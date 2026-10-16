import { onCall, HttpsError } from "firebase-functions/v2/https";
import { app, db } from "../admin";
import { getStripeClient } from "../stripeClient";
import { stripeSecretKey } from "../config";
import { createRefreshToken, onboardingCallbacks } from "../connectOnboarding";

export const createConnectOnboardingLink = onCall(
  { secrets: [stripeSecretKey] },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }

    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    const user = userSnap.data();
    if (!user) {
      throw new HttpsError("not-found", "User profile not found.");
    }

    const stripe = getStripeClient();
    let accountId = user.stripeConnectAccountId as string | undefined;

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: "CA",
        email: user.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: "individual",
      }, { idempotencyKey: `seller-connect-${uid}` });
      accountId = await db.runTransaction(async transaction => {
        const current = (await transaction.get(userRef)).data();
        if (!current) throw new HttpsError("not-found", "User profile not found.");
        if (current.stripeConnectAccountId) return current.stripeConnectAccountId as string;
        transaction.update(userRef, { stripeConnectAccountId: account.id, stripeConnectOnboarded: false });
        return account.id;
      });
    }

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      ...onboardingCallbacks(app.options.projectId!, createRefreshToken(accountId, stripeSecretKey.value())),
    });

    return { url: accountLink.url };
  }
);

export const getConnectAccountStatus = onCall(
  { secrets: [stripeSecretKey] },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }

    const userSnap = await db.collection("users").doc(uid).get();
    const user = userSnap.data();
    if (!user?.stripeConnectAccountId) {
      return { onboarded: false, payoutsEnabled: false, transfersEnabled: false };
    }

    const stripe = getStripeClient();
    const account = await stripe.accounts.retrieve(user.stripeConnectAccountId);
    const onboarded = Boolean(account.details_submitted);
    const payoutsEnabled = Boolean(account.payouts_enabled);

    if (onboarded !== user.stripeConnectOnboarded) {
      await db.collection("users").doc(uid).update({ stripeConnectOnboarded: onboarded });
    }

    return { onboarded, payoutsEnabled, transfersEnabled: account.capabilities?.transfers === "active" };
  }
);
