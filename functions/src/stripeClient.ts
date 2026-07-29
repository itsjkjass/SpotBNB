import Stripe from "stripe";
import { stripeSecretKey } from "./config";

let cachedClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (!cachedClient) {
    cachedClient = new Stripe(stripeSecretKey.value(), {
      apiVersion: "2025-02-24.acacia",
    });
  }
  return cachedClient;
}
