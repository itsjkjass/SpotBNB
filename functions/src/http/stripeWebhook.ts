import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { db } from "../admin";
import { getStripeClient } from "../stripeClient";
import { stripeSecretKey, stripeWebhookSecret } from "../config";
import type Stripe from "stripe";
import { reconcileChargeAdjustment } from "../services/sellerEarnings";

export const stripeWebhook = onRequest(
  { secrets: [stripeSecretKey, stripeWebhookSecret] },
  async (req, res) => {
    const signature = req.headers["stripe-signature"];
    if (!signature) {
      res.status(400).send("Missing Stripe signature.");
      return;
    }

    const stripe = getStripeClient();
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.rawBody, signature, stripeWebhookSecret.value());
    } catch (err) {
      logger.error("Stripe webhook signature verification failed", err);
      res.status(400).send("Invalid signature.");
      return;
    }

    async function transitionBooking(bookingId: string, nextStatus: "confirmed" | "cancelled", intent: Stripe.PaymentIntent) {
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(bookingId)) return;
      const bookingRef = db.collection("bookings").doc(bookingId);
      await db.runTransaction(async (transaction) => {
        const bookingSnap = await transaction.get(bookingRef);
        if (!bookingSnap.exists) return;
        const booking = bookingSnap.data()!;
        if (booking.status !== "pending_payment") return;
        if (booking.stripePaymentIntentId && booking.stripePaymentIntentId !== intent.id) return;
        if (booking.totalPriceCents !== intent.amount || booking.currency !== intent.currency) return;
        transaction.update(bookingRef, { status: nextStatus, stripePaymentIntentId: intent.id });
      });
    }

    try {
      switch (event.type) {
        case "charge.refunded":
          await reconcileChargeAdjustment((event.data.object as Stripe.Charge).id);
          break;
        case "charge.dispute.created":
        case "charge.dispute.closed": {
          const dispute = event.data.object as Stripe.Dispute;
          const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id;
          await reconcileChargeAdjustment(chargeId);
          break;
        }
        case "payment_intent.succeeded": {
          const intent = event.data.object as Stripe.PaymentIntent;
          const bookingId = intent.metadata?.bookingId;
          if (bookingId) {
            await transitionBooking(bookingId, "confirmed", intent);
          }
          break;
        }
        case "payment_intent.payment_failed":
          // A decline is retryable on the same PaymentIntent. Keep the slot
          // reserved so a later success can confirm this booking safely.
          break;
        case "payment_intent.canceled": {
          const intent = event.data.object as Stripe.PaymentIntent;
          const bookingId = intent.metadata?.bookingId;
          if (bookingId) {
            await transitionBooking(bookingId, "cancelled", intent);
          }
          break;
        }
        default:
          break;
      }
      res.status(200).send({ received: true });
    } catch (err) {
      logger.error("Stripe webhook handler error", err);
      res.status(500).send("Webhook handler error.");
    }
  }
);
