import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { db } from "../admin";
import { getStripeClient } from "../stripeClient";
import { stripeSecretKey, stripeWebhookSecret } from "../config";
import type Stripe from "stripe";

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

    try {
      switch (event.type) {
        case "payment_intent.succeeded": {
          const intent = event.data.object as Stripe.PaymentIntent;
          const bookingId = intent.metadata?.bookingId;
          if (bookingId) {
            await db.collection("bookings").doc(bookingId).update({ status: "confirmed" });
          }
          break;
        }
        case "payment_intent.payment_failed":
        case "payment_intent.canceled": {
          const intent = event.data.object as Stripe.PaymentIntent;
          const bookingId = intent.metadata?.bookingId;
          if (bookingId) {
            await db.collection("bookings").doc(bookingId).update({ status: "cancelled" });
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
