import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { db } from "../admin";
import { getStripeClient } from "../stripeClient";
import { stripeSecretKey, PAYMENT_RECHECK_MS } from "../config";
import { readBookingCharge, reconcileSellerTransfer, sellerAmount, transferGroup } from "../services/sellerEarnings";

export const withdrawBookingEarnings = onCall<{ bookingId: string }>(
  { secrets: [stripeSecretKey], timeoutSeconds: 120, maxInstances: 3 },
  async request => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in to withdraw earnings.");
    const bookingId = request.data?.bookingId;
    if (typeof bookingId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(bookingId)) {
      throw new HttpsError("invalid-argument", "Invalid booking ID.");
    }
    const bookingRef = db.collection("bookings").doc(bookingId);
    const entryRef = db.collection("sellerTransfers").doc(bookingId);
    const userRef = db.collection("users").doc(uid);
    const booking = (await bookingRef.get()).data();
    if (!booking) throw new HttpsError("not-found", "Booking not found.");
    if (booking.sellerId !== uid) throw new HttpsError("permission-denied", "Only the seller can withdraw these earnings.");
    const existing = (await entryRef.get()).data();
    if (!existing) {
      if (booking.paymentFlow !== "separate_v1") {
        throw new HttpsError("failed-precondition", "This booking uses automatic Stripe transfers. Check your Stripe account.");
      }
      if (!["confirmed", "completed"].includes(booking.status) || !Number.isFinite(booking.endTime) ||
          booking.endTime > Date.now() || booking.cancellationRequestedAt) {
        throw new HttpsError("failed-precondition", "Earnings can be withdrawn after the booking ends, unless cancellation is pending.");
      }
      const user = (await userRef.get()).data();
      if (!user?.stripeConnectAccountId) throw new HttpsError("failed-precondition", "Complete payout setup in Profile first.");
      const account = await getStripeClient().accounts.retrieve(user.stripeConnectAccountId);
      if (!account.details_submitted || !account.payouts_enabled || account.capabilities?.transfers !== "active") {
        throw new HttpsError("failed-precondition", "Stripe has not enabled your payouts yet. Check payout setup in Profile.");
      }
      const charge = await readBookingCharge(bookingId, booking);
      if (charge.amount_refunded > 0 || charge.disputed || booking.paymentDisputed || booking.refundedCents > 0) {
        throw new HttpsError("failed-precondition", "This payment has a refund or dispute and needs review before withdrawal.");
      }
      const amount = sellerAmount(booking);
      await db.runTransaction(async transaction => {
        const current = (await transaction.get(bookingRef)).data();
        const entry = await transaction.get(entryRef);
        const currentUser = (await transaction.get(userRef)).data();
        if (entry.exists) return;
        if (!current || current.sellerId !== uid || !["confirmed", "completed"].includes(current.status) ||
            current.cancellationRequestedAt || current.refundedCents > 0 || current.paymentDisputed ||
            currentUser?.stripeConnectAccountId !== account.id || current.stripePaymentIntentId !== booking.stripePaymentIntentId) {
          throw new HttpsError("failed-precondition", "Booking or payout details changed. Refresh and try again.");
        }
        transaction.create(entryRef, {
          sellerId: uid, bookingId, amountCents: amount, currency: booking.currency,
          status: "processing", requestedAt: Date.now(), nextCheckAt: Date.now() + PAYMENT_RECHECK_MS,
          request: {
            amount, currency: booking.currency, destination: account.id, source_transaction: charge.id,
            transfer_group: transferGroup(bookingId), metadata: { bookingId, sellerId: uid },
          },
        });
      });
    }
    try {
      await reconcileSellerTransfer(bookingId);
    } catch {
      // The durable request is picked up by the worker. A timeout is not proof
      // of a failed transfer; never invite the caller to create another payment.
      logger.error("Seller withdrawal awaits reconciliation", { bookingId });
    }
    const result = (await entryRef.get()).data()!;
    return { status: result.status as string, amountCents: result.amountCents as number };
  }
);
