import { defineSecret } from "firebase-functions/params";

export const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");
export const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");

// SpotBnB's cut of every booking, in whole percent.
export const PLATFORM_FEE_PERCENT = 12;
