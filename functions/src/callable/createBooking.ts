import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "../admin";
import { stripeSecretKey, PLATFORM_FEE_PERCENT, PAYMENT_HOLD_MS } from "../config";
import { getOrCreateBookingPayment } from "../services/bookingPayment";
import type Stripe from "stripe";

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

    if (!request.data || typeof request.data !== "object" || Array.isArray(request.data)) {
      throw new HttpsError("invalid-argument", "Invalid booking request.");
    }
    const { spotId, startTime, endTime } = request.data;
    if (typeof spotId !== "string" || !spotId.trim() || spotId.includes("/") ||
        spotId === "." || spotId === "..") {
      throw new HttpsError("invalid-argument", "Invalid parking spot ID.");
    }
    if (!Number.isSafeInteger(startTime) || !Number.isSafeInteger(endTime) ||
        !Number.isFinite(new Date(startTime).getTime()) || !Number.isFinite(new Date(endTime).getTime()) ||
        endTime <= startTime) {
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
    if (!seller) {
      throw new HttpsError("failed-precondition", "This seller's account is unavailable.");
    }

    if (typeof spot.pricePerHour !== "number" || !Number.isFinite(spot.pricePerHour) || spot.pricePerHour <= 0 ||
        (spot.pricePerDay != null && (typeof spot.pricePerDay !== "number" ||
          !Number.isFinite(spot.pricePerDay) || spot.pricePerDay <= 0))) {
      throw new HttpsError("failed-precondition", "This parking spot has invalid pricing. Please contact the seller.");
    }
    const hours = (endTime - startTime) / (1000 * 60 * 60);
    const rawTotal =
      spot.pricePerDay && hours >= 24
        ? Math.ceil(hours / 24) * spot.pricePerDay
        : hours * spot.pricePerHour;
    const totalPriceCents = Math.round(rawTotal * 100);
    const platformFeeCents = Math.round((totalPriceCents * PLATFORM_FEE_PERCENT) / 100);

    // Stripe accepts integer amounts with at most eight digits. Reject before
    // reserving the spot so an invalid amount cannot leave an unpaid hold.
    if (!Number.isSafeInteger(totalPriceCents) || totalPriceCents < 50 || totalPriceCents > 99_999_999) {
      throw new HttpsError("invalid-argument", "Booking total is outside the supported payment range.");
    }

    const bookingRef = db.collection("bookings").doc();
    const createdAt = Date.now();
    const paymentIntentRequest: Stripe.PaymentIntentCreateParams = {
      amount: totalPriceCents,
      currency: "cad",
      // Charge the platform now. The seller's net earnings are transferred only
      // after the booking ends and they finish Connect setup and request withdrawal.
      payment_method_types: ["card"],
      transfer_group: `booking_${bookingRef.id}`,
      metadata: { bookingId: bookingRef.id, spotId, buyerId: uid, sellerId: spot.ownerId },
    };

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
        paymentFlow: "separate_v1",
        currency: "cad",
        status: "pending_payment",
        createdAt,
        paymentIntentRequest,
        paymentReconcileAt: createdAt + 60_000,
        paymentExpiresAt: createdAt + PAYMENT_HOLD_MS,
      });
    });

    // A timeout does not prove that Stripe failed to create the intent. Keep
    // the reservation and request so the scheduled worker can recover it.
    const paymentIntent = await getOrCreateBookingPayment(bookingRef);
    if (!paymentIntent?.client_secret || paymentIntent.status === "canceled") {
      throw new HttpsError("failed-precondition", "This booking is no longer awaiting payment.");
    }

    return {
      bookingId: bookingRef.id,
      paymentIntentClientSecret: paymentIntent.client_secret,
    };
  }
);
