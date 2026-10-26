import { onCall, HttpsError } from "firebase-functions/v2/https";
import { stripeSecretKey } from "../config";
import { queueAccountDeletion } from "../services/accountDeletion";

export const requestAccountDeletion = onCall({ secrets: [stripeSecretKey], timeoutSeconds: 60, maxInstances: 3 }, async request => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in before deleting your account.");
  if (request.data?.confirmation !== "DELETE") throw new HttpsError("invalid-argument", "Confirm permanent account deletion.");
  const authTime = request.auth.token.auth_time;
  const age = Date.now() / 1000 - Number(authTime);
  if (typeof authTime !== "number" || !Number.isFinite(age) || age < -30 || age > 300) {
    throw new HttpsError("failed-precondition", "Confirm your password again before deleting your account.");
  }
  // The UID always comes from verified authentication, never the request body.
  await queueAccountDeletion(request.auth.uid);
  return { accepted: true };
});
