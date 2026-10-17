import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "../admin";
import { stripeSecretKey, PLATFORM_FEE_PERCENT, PAYMENT_HOLD_MS } from "../config";
import { getOrCreateBookingPayment } from "../services/bookingPayment";
import type Stripe from "stripe";
import { calendarDayCount, dailyRateCents, parkingTimeZone, quoteCalendarBooking } from "../lib/calendarDays";

interface CreateBookingRequest {
  spotId: string;
  startDate: string;
  endDate: string;
  expectedTotalPriceCents: number;
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
    const { spotId, startDate, endDate } = request.data;
    if (typeof spotId !== "string" || !spotId.trim() || spotId.includes("/") ||
        spotId === "." || spotId === "..") {
      throw new HttpsError("invalid-argument", "Invalid parking spot ID.");
    }
    if (typeof startDate !== "string" || typeof endDate !== "string") {
      throw new HttpsError("invalid-argument", "Choose calendar dates. Please update the app if it still asks for hourly bookings.");
    }
    try { calendarDayCount(startDate, endDate); }
    catch { throw new HttpsError("invalid-argument", "Choose valid calendar dates in order."); }
    if (!Number.isSafeInteger(request.data.expectedTotalPriceCents) || request.data.expectedTotalPriceCents < 50) {
      throw new HttpsError("invalid-argument", "Review the daily price before booking.");
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

    if (spot.pricePerDay == null) throw new HttpsError("failed-precondition", "The seller needs to set a daily price before this space can be booked.");
    try { dailyRateCents(spot.pricePerDay); parkingTimeZone(spot.timeZone); }
    catch { throw new HttpsError("failed-precondition", "The seller needs to update this space's daily price or time zone."); }
    if (spot.availability?.type === "recurring_hours") {
      throw new HttpsError("failed-precondition", "This space's restricted hours do not support full calendar-day bookings yet.");
    }
    let quote;
    try { quote = quoteCalendarBooking(startDate, endDate, spot.pricePerDay, spot.timeZone); }
    catch (error) { throw new HttpsError("invalid-argument", error instanceof Error ? error.message : "Invalid booking dates."); }
    const { startTime, endTime, totalPriceCents } = quote;
    if (request.data.expectedTotalPriceCents !== totalPriceCents) {
      throw new HttpsError("failed-precondition", "The daily price has changed. Go back and reopen checkout to review it.");
    }
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
        startDate, endDate, dayCount: quote.dayCount, timeZone: quote.timeZone,
        pricePerDayCents: quote.pricePerDayCents,
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
      totalPriceCents, dayCount: quote.dayCount,
    };
  }
);
