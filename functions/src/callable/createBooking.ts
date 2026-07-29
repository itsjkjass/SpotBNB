import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "../admin";
import { getStripeClient } from "../stripeClient";
import { stripeSecretKey, PLATFORM_FEE_PERCENT } from "../config";

interface CreateBookingRequest {
  spotId: string;
  startTime: number;
  endTime: number;
}

export const createBooking = onCall<CreateBookingRequest>(
  { secrets: [stripeSecretKey] },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "You must be signed in to book a spot.");
    }

    const { spotId, startTime, endTime } = request.data;
    if (!spotId || !startTime || !endTime || endTime <= startTime) {
      throw new HttpsError("invalid-argument", "Invalid booking time range.");
    }
    if (startTime < Date.now() - 60_000) {
      throw new HttpsError("invalid-argument", "Booking start time is in the past.");
    }

    const spotSnap = await db.collection("spots").doc(spotId).get();
    if (!spotSnap.exists) {
      throw new HttpsError("not-found", "This parking spot no longer exists.");
    }
    const spot = spotSnap.data()!;
    if (!spot.isActive) {
      throw new HttpsError("failed-precondition", "This parking spot is no longer available.");
    }
    if (spot.ownerId === uid) {
      throw new HttpsError("failed-precondition", "You can't book your own parking spot.");
    }

    const sellerSnap = await db.collection("users").doc(spot.ownerId).get();
    const seller = sellerSnap.data();
    if (!seller?.stripeConnectAccountId || !seller?.stripeConnectOnboarded) {
      throw new HttpsError(
        "failed-precondition",
        "This seller hasn't finished setting up payouts yet."
      );
    }

    const hours = (endTime - startTime) / (1000 * 60 * 60);
    const rawTotal =
      spot.pricePerDay && hours >= 24
        ? Math.ceil(hours / 24) * spot.pricePerDay
        : hours * spot.pricePerHour;
    const totalPriceCents = Math.round(rawTotal * 100);
    const platformFeeCents = Math.round((totalPriceCents * PLATFORM_FEE_PERCENT) / 100);

    if (totalPriceCents < 50) {
      throw new HttpsError("invalid-argument", "Booking total is below the minimum chargeable amount.");
    }

    const bookingRef = db.collection("bookings").doc();

    // Firestore tracks queries read inside a transaction, not just documents, so this
    // retries automatically if a concurrent booking for an overlapping slot commits first -
    // closing the race that a plain read-then-write would leave open.
    await db.runTransaction(async (transaction) => {
      const overlappingQuery = db
        .collection("bookings")
        .where("spotId", "==", spotId)
        .where("status", "in", ["pending_payment", "confirmed"])
        .where("endTime", ">", startTime);
      const overlappingSnap = await transaction.get(overlappingQuery);
      const conflict = overlappingSnap.docs.some((d) => d.data().startTime < endTime);
      if (conflict) {
        throw new HttpsError("already-exists", "This spot is already booked for part of that time range.");
      }

      transaction.set(bookingRef, {
        spotId,
        spotTitle: spot.title,
        spotAddress: spot.address,
        buyerId: uid,
        sellerId: spot.ownerId,
        startTime,
        endTime,
        totalPriceCents,
        platformFeeCents,
        currency: "cad",
        status: "pending_payment",
        createdAt: Date.now(),
      });
    });

    const stripe = getStripeClient();
    let paymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.create({
        amount: totalPriceCents,
        currency: "cad",
        automatic_payment_methods: { enabled: true },
        application_fee_amount: platformFeeCents,
        transfer_data: {
          destination: seller.stripeConnectAccountId,
        },
        metadata: {
          bookingId: bookingRef.id,
          spotId,
          buyerId: uid,
          sellerId: spot.ownerId,
        },
      });
    } catch (stripeError) {
      await bookingRef.delete();
      throw stripeError;
    }

    await bookingRef.update({ stripePaymentIntentId: paymentIntent.id });

    return {
      bookingId: bookingRef.id,
      paymentIntentClientSecret: paymentIntent.client_secret,
    };
  }
);
