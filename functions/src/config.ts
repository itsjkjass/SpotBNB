import { defineSecret } from "firebase-functions/params";

export const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");
export const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");

// SpotBnB's cut of every booking, in whole percent.
export const PLATFORM_FEE_PERCENT = 12;

// Stay below Stripe's minimum 24-hour idempotency retention window.
export const PAYMENT_RECOVERY_WINDOW_MS = 23 * 60 * 60 * 1000;
export const PAYMENT_RECHECK_MS = 5 * 60 * 1000;
