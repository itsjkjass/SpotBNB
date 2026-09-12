import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "../admin";
import { getStripeClient } from "../stripeClient";
import { stripeSecretKey } from "../config";

interface CancelBookingRequest {
  bookingId: string;
}

export const cancelBooking = onCall<CancelBookingRequest>(
  { secrets: [stripeSecretKey] },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }

    const { bookingId } = request.data;
    const bookingRef = db.collection("bookings").doc(bookingId);
    const bookingSnap = await bookingRef.get();
    if (!bookingSnap.exists) {
      throw new HttpsError("not-found", "Booking not found.");
    }
    const booking = bookingSnap.data()!;
    if (booking.buyerId !== uid && booking.sellerId !== uid) {
      throw new HttpsError("permission-denied", "You don't have access to this booking.");
    }
    if (booking.status === "cancelled" || booking.status === "completed") {
      throw new HttpsError("failed-precondition", `Booking is already ${booking.status}.`);
    }
    if (booking.startTime <= Date.now()) {
      throw new HttpsError("failed-precondition", "This booking has already started.");
    }

    const stripe = getStripeClient();
    if (booking.stripePaymentIntentId) {
      const intent = await stripe.paymentIntents.retrieve(booking.stripePaymentIntentId);
      if (intent.status === "succeeded") {
        await stripe.refunds.create(
          {
            payment_intent: booking.stripePaymentIntentId,
            reverse_transfer: true,
            refund_application_fee: true,
          },
          // Reuse the refund if Stripe succeeded but the Firestore update failed.
          { idempotencyKey: `cancel-booking-${bookingId}` }
        );
      } else if (intent.status !== "canceled") {
        await stripe.paymentIntents.cancel(booking.stripePaymentIntentId);
      }
    }

    await bookingRef.update({ status: "cancelled" });
    return { ok: true };
  }
);
