import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

/**
 * Returns a Stripe-hosted onboarding URL for the seller's Connect Express account.
 * Creates the Connect account on first call; Cloud Function stores the account id on the user doc.
 */
export async function getSellerOnboardingLink(returnUrl: string, refreshUrl: string): Promise<string> {
  const fn = httpsCallable<{ returnUrl: string; refreshUrl: string }, { url: string }>(
    functions,
    "createConnectOnboardingLink"
  );
  const result = await fn({ returnUrl, refreshUrl });
  return result.data.url;
}

export async function getSellerConnectStatus(): Promise<{ onboarded: boolean; payoutsEnabled: boolean }> {
  const fn = httpsCallable<void, { onboarded: boolean; payoutsEnabled: boolean }>(
    functions,
    "getConnectAccountStatus"
  );
  const result = await fn();
  return result.data;
}
