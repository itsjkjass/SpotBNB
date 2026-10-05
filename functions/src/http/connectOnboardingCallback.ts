import { onRequest } from "firebase-functions/v2/https";
import { app } from "../admin";
import { stripeSecretKey } from "../config";
import { getStripeClient } from "../stripeClient";
import { onboardingCallbacks, readRefreshToken } from "../connectOnboarding";

function page(message: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SpotBnB payouts</title></head><body><main><h1>SpotBnB payouts</h1><p>${message}</p><p><a href="spotbnb://onboarding-complete">Open SpotBnB</a></p><p>If the app does not open, switch back to SpotBnB and open Profile &rarr; Seller Payouts.</p></main></body></html>`;
}

export const connectOnboardingCallback = onRequest(
  { region: "us-central1", secrets: [stripeSecretKey] },
  async (request, response) => {
    response.set("Cache-Control", "no-store");
    response.set("Referrer-Policy", "no-referrer");
    response.set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    if (request.method !== "GET") {
      response.set("Allow", "GET").status(405).send("Method not allowed");
      return;
    }
    if (request.query.action === "return") {
      // Returning from Stripe also happens when a seller leaves onboarding early.
      // Only the authenticated status endpoint can update their saved status.
      response.status(200).type("html").send(page("Return to the app and tap Refresh status to check your payout setup."));
      return;
    }
    const token = request.query.token;
    const accountId = request.query.action === "refresh"
      ? readRefreshToken(token, stripeSecretKey.value()) : null;
    if (!accountId) {
      response.status(400).type("html").send(page("This setup link has expired or is invalid. Return to the app and tap Start onboarding for a new link."));
      return;
    }
    try {
      const link = await getStripeClient().accountLinks.create({
        account: accountId,
        type: "account_onboarding",
        ...onboardingCallbacks(app.options.projectId!, token as string),
      });
      response.redirect(303, link.url);
    } catch {
      response.status(502).type("html").send(page("Payout setup is temporarily unavailable. Return to the app and try Start onboarding again."));
    }
  }
);
