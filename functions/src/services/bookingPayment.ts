import type { DocumentReference } from "firebase-admin/firestore";
import type Stripe from "stripe";
import { db } from "../admin";
import { getStripeClient } from "../stripeClient";
import { PAYMENT_RECOVERY_WINDOW_MS } from "../config";

export async function getOrCreateBookingPayment(bookingRef: DocumentReference) {
  const snapshot = await bookingRef.get();
  const booking = snapshot.data();
  if (!booking || booking.status !== "pending_payment") return null;

  const stripe = getStripeClient();
  let intent: Stripe.PaymentIntent;
  if (booking.stripePaymentIntentId) {
    intent = await stripe.paymentIntents.retrieve(booking.stripePaymentIntentId);
  } else {
    // Never recreate a request after Stripe may have discarded its idempotency
    // key. Legacy/older reservations need reconciliation by an operator.
    if (!booking.paymentIntentRequest || !Number.isFinite(booking.createdAt) ||
        Date.now() - booking.createdAt >= PAYMENT_RECOVERY_WINDOW_MS) {
      throw new Error("Payment setup needs manual reconciliation.");
    }
    intent = await stripe.paymentIntents.create(booking.paymentIntentRequest, {
      idempotencyKey: `booking-payment-${bookingRef.id}`,
    });
  }

  if (intent.metadata.bookingId !== bookingRef.id ||
      intent.amount !== booking.totalPriceCents || intent.currency !== booking.currency) {
    throw new Error("Payment does not match its booking.");
  }

  await db.runTransaction(async (transaction) => {
    const current = (await transaction.get(bookingRef)).data();
    if (!current) throw new Error("Booking disappeared during payment setup.");
    if (current.stripePaymentIntentId && current.stripePaymentIntentId !== intent.id) {
      throw new Error("Booking already references a different payment.");
    }
    // Attaching an ID must never overwrite a concurrent cancellation or webhook.
    transaction.update(bookingRef, { stripePaymentIntentId: intent.id });
  });
  return intent;
}

export async function expireBookingPayment(bookingRef: DocumentReference, intent: Stripe.PaymentIntent) {
  const booking = (await bookingRef.get()).data();
  if (!booking || booking.status !== "pending_payment" || booking.stripePaymentIntentId !== intent.id ||
      !Number.isFinite(booking.paymentExpiresAt) || Date.now() < booking.paymentExpiresAt) return intent;

  // Keep processing/authorized payments reserved. A deadline alone never proves
  // that a payment cannot still succeed.
  if (!["requires_payment_method", "requires_confirmation", "requires_action"].includes(intent.status)) return intent;
  const stripe = getStripeClient();
  let result: Stripe.PaymentIntent;
  try {
    result = await stripe.paymentIntents.cancel(intent.id, { cancellation_reason: "abandoned" });
  } catch {
    // Cancellation may race with success or its response may be lost. Only an
    // authoritative terminal state may release or confirm the reservation.
    result = await stripe.paymentIntents.retrieve(intent.id);
  }
  if (result.id !== intent.id || result.metadata.bookingId !== bookingRef.id ||
      result.amount !== booking.totalPriceCents || result.currency !== booking.currency) {
    throw new Error("Payment does not match its booking.");
  }
  return result;
}

export async function syncBookingPaymentStatus(bookingRef: DocumentReference, intent: Stripe.PaymentIntent) {
  if (intent.status !== "succeeded" && intent.status !== "canceled") return;
  await db.runTransaction(async (transaction) => {
    const booking = (await transaction.get(bookingRef)).data();
    if (!booking || booking.status !== "pending_payment" || booking.stripePaymentIntentId !== intent.id) return;
    transaction.update(bookingRef, { status: intent.status === "succeeded" ? "confirmed" : "cancelled" });
  });
}
