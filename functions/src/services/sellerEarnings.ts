import type { DocumentData } from "firebase-admin/firestore";
import type Stripe from "stripe";
import { db } from "../admin";
import { getStripeClient } from "../stripeClient";
import { PAYMENT_RECOVERY_WINDOW_MS, PAYMENT_RECHECK_MS } from "../config";

export const transferGroup = (bookingId: string) => `booking_${bookingId}`;
const objectId = (value: string | { id: string } | null) => typeof value === "string" ? value : value?.id;

export function sellerAmount(booking: DocumentData): number {
  const { totalPriceCents: total, platformFeeCents: fee } = booking;
  if (!Number.isSafeInteger(total) || !Number.isSafeInteger(fee) || total < 50 || fee < 0 || fee >= total || booking.currency !== "cad") {
    throw new Error("Invalid booking earnings.");
  }
  return total - fee;
}

export async function readBookingCharge(bookingId: string, booking: DocumentData) {
  const stripe = getStripeClient();
  const intent = await stripe.paymentIntents.retrieve(booking.stripePaymentIntentId);
  if (intent.id !== booking.stripePaymentIntentId || intent.metadata.bookingId !== bookingId ||
      intent.amount !== booking.totalPriceCents || intent.currency !== booking.currency ||
      intent.status !== "succeeded" || !intent.latest_charge || intent.transfer_data) {
    throw new Error("Booking payment is not eligible for withdrawal.");
  }
  const charge = await stripe.charges.retrieve(objectId(intent.latest_charge)!);
  if (objectId(charge.payment_intent) !== intent.id || !charge.paid || !charge.captured ||
      charge.amount !== booking.totalPriceCents || charge.currency !== booking.currency) {
    throw new Error("Booking charge does not match.");
  }
  return charge;
}

function validateTransfer(transfer: Stripe.Transfer, bookingId: string, entry: DocumentData) {
  const request = entry.request as Stripe.TransferCreateParams;
  if (transfer.metadata.bookingId !== bookingId || transfer.amount !== entry.amountCents ||
      transfer.currency !== request.currency || objectId(transfer.destination) !== request.destination ||
      objectId(transfer.source_transaction) !== request.source_transaction || transfer.transfer_group !== transferGroup(bookingId)) {
    throw new Error("Transfer does not match its saved withdrawal request.");
  }
}

// One immutable transfer request per booking. A retry always uses the same
// destination, amount and idempotency key, including after a lost HTTP response.
export async function reconcileSellerTransfer(bookingId: string) {
  const entryRef = db.collection("sellerTransfers").doc(bookingId);
  const entry = (await entryRef.get()).data();
  if (!entry || (entry.status === "held" && !entry.stripeTransferId) || entry.status === "reversed") return;
  const booking = (await db.collection("bookings").doc(bookingId).get()).data();
  if (!booking || booking.paymentFlow !== "separate_v1" || booking.sellerId !== entry.sellerId) {
    throw new Error("Withdrawal booking is unavailable.");
  }
  const stripe = getStripeClient();
  let transfer: Stripe.Transfer;
  if (entry.stripeTransferId) {
    transfer = await stripe.transfers.retrieve(entry.stripeTransferId);
  } else if (Date.now() - entry.requestedAt < PAYMENT_RECOVERY_WINDOW_MS) {
    transfer = await stripe.transfers.create(entry.request, { idempotencyKey: `seller-earnings-${bookingId}` });
  } else {
    // After the idempotency retention window, only discover an existing transfer.
    // Never issue a second transfer just because an earlier response was lost.
    const found = await stripe.transfers.list({ transfer_group: transferGroup(bookingId), limit: 2 });
    if (found.has_more || found.data.length !== 1) {
      await entryRef.update({ status: "held", holdReason: "reconciliation_required", nextCheckAt: null });
      return;
    }
    transfer = found.data[0];
  }
  validateTransfer(transfer, bookingId, entry);
  // Save the ID before further API calls, but do not claim a bank payout.
  await entryRef.update({ stripeTransferId: transfer.id });
  const charge = await readBookingCharge(bookingId, booking);
  if (charge.amount_refunded > 0 || charge.disputed || booking.paymentDisputed || booking.refundedCents > 0 ||
      entry.status === "reversal_pending" || booking.cancellationRequestedAt || booking.status === "cancelled") {
    // In-app cancellations are full refunds before parking. For an external
    // partial refund/dispute, recover the transfer in full and hold settlement
    // for the operator instead of guessing what the seller is still owed.
    await entryRef.update({ status: "reversal_pending", holdReason: "payment_adjusted", nextCheckAt: Date.now() + PAYMENT_RECHECK_MS });
    if (transfer.amount_reversed < transfer.amount) {
      const remaining = transfer.amount - transfer.amount_reversed;
      try {
        await stripe.transfers.createReversal(transfer.id, { amount: remaining }, {
          idempotencyKey: `seller-reversal-${transfer.id}-${remaining}`,
        });
      } catch (error) {
        // A concurrent worker or lost response may have finished the reversal.
        transfer = await stripe.transfers.retrieve(transfer.id);
        if (transfer.amount_reversed !== transfer.amount) throw error;
      }
      transfer = await stripe.transfers.retrieve(transfer.id);
    }
    if (transfer.amount_reversed !== transfer.amount) throw new Error("Transfer reversal is still pending.");
    await entryRef.update({ status: "reversed", holdReason: "payment_adjusted", nextCheckAt: null });
    return;
  }
  if (transfer.amount_reversed > 0) {
    await entryRef.update({ status: "held", holdReason: "transfer_adjusted", nextCheckAt: null });
    return;
  }
  await db.runTransaction(async transaction => {
    const current = (await transaction.get(entryRef)).data();
    // Do not undo a concurrent refund/reversal worker's terminal decision.
    if (current && ["processing", "transferred"].includes(current.status)) {
      transaction.update(entryRef, { status: "transferred", nextCheckAt: Date.now() + 24 * 60 * 60 * 1000 });
    }
  });
}

export async function reconcileChargeAdjustment(chargeId: string) {
  const stripe = getStripeClient();
  const charge = await stripe.charges.retrieve(chargeId);
  const intentId = objectId(charge.payment_intent);
  if (!intentId) return;
  const intent = await stripe.paymentIntents.retrieve(intentId);
  const bookingId = intent.metadata.bookingId;
  if (!bookingId || !/^[A-Za-z0-9_-]{1,128}$/.test(bookingId)) return;
  const bookingRef = db.collection("bookings").doc(bookingId);
  const booking = (await bookingRef.get()).data();
  if (!booking || booking.paymentFlow !== "separate_v1" || (booking.stripePaymentIntentId && booking.stripePaymentIntentId !== intentId) ||
      booking.totalPriceCents !== charge.amount || booking.currency !== charge.currency) return;
  await db.runTransaction(async transaction => {
    const current = (await transaction.get(bookingRef)).data();
    if (!current) return;
    transaction.update(bookingRef, {
      stripePaymentIntentId: intentId,
      refundedCents: Math.max(current.refundedCents || 0, charge.amount_refunded),
      paymentDisputed: Boolean(charge.disputed || current.paymentDisputed),
      ...(charge.refunded && current.status !== "completed" ? { status: "cancelled" } : {}),
    });
  });
  await reconcileSellerTransfer(bookingId);
}
