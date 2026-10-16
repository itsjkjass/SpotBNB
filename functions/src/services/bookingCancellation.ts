import type { DocumentReference } from "firebase-admin/firestore";
import { getStripeClient } from "../stripeClient";
import { db } from "../admin";

// Used for new platform charges only. The persisted request lets the scheduler
// finish a cancellation if the app closes or Stripe/Firestore times out.
export async function finishBookingCancellation(bookingRef: DocumentReference) {
  const booking = (await bookingRef.get()).data();
  if (!booking || !booking.cancellationRequestedAt || booking.paymentFlow !== "separate_v1" || booking.status === "cancelled") return;
  const stripe = getStripeClient();
  let intent = await stripe.paymentIntents.retrieve(booking.stripePaymentIntentId);
  if (intent.metadata.bookingId !== bookingRef.id || intent.id !== booking.stripePaymentIntentId ||
      intent.amount !== booking.totalPriceCents || intent.currency !== booking.currency || intent.transfer_data) {
    throw new Error("Cancellation payment does not match booking.");
  }
  if (intent.status !== "succeeded" && intent.status !== "canceled") {
    try { intent = await stripe.paymentIntents.cancel(intent.id); }
    catch { intent = await stripe.paymentIntents.retrieve(intent.id); }
  }
  if (intent.id !== booking.stripePaymentIntentId || intent.metadata.bookingId !== bookingRef.id ||
      intent.amount !== booking.totalPriceCents || intent.currency !== booking.currency) {
    throw new Error("Cancellation returned an unrelated payment.");
  }
  if (intent.status === "succeeded") {
    const chargeId = typeof intent.latest_charge === "string" ? intent.latest_charge : intent.latest_charge?.id;
    if (!chargeId) throw new Error("Paid booking has no charge.");
    const charge = await stripe.charges.retrieve(chargeId);
    const chargeIntentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
    if (chargeIntentId !== intent.id || charge.amount !== booking.totalPriceCents || charge.currency !== booking.currency) {
      throw new Error("Refund charge does not match booking.");
    }
    if (!charge.refunded) {
      const refund = await stripe.refunds.create({ payment_intent: intent.id }, { idempotencyKey: `cancel-booking-${bookingRef.id}` });
      if (refund.status === "failed" || refund.status === "canceled") throw new Error("Refund was not accepted.");
    }
  } else if (intent.status !== "canceled") {
    throw new Error("Payment is still processing; cancellation retained for retry.");
  }
  await db.runTransaction(async transaction => {
    const current = (await transaction.get(bookingRef)).data();
    if (current?.cancellationRequestedAt && current.stripePaymentIntentId === intent.id) {
      transaction.update(bookingRef, { status: "cancelled" });
    }
  });
}
