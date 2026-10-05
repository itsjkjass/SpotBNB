import { createHmac, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";

const SESSION_MS = 60 * 60 * 1000;

export function createRefreshToken(accountId: string, secret: string, now = Date.now()): string {
  const payload = `${accountId}.${now + SESSION_MS}`;
  const signature = createHmac("sha256", secret).update(`connect-refresh:${payload}`).digest("hex");
  return `${payload}.${signature}`;
}

export function readRefreshToken(token: unknown, secret: string, now = Date.now()): string | null {
  if (typeof token !== "string") return null;
  const match = /^(acct_[A-Za-z0-9]+)\.(\d{13})\.([a-f0-9]{64})$/.exec(token);
  if (!match) return null;
  const [, accountId, expires, signature] = match;
  if (Number(expires) <= now || Number(expires) > now + SESSION_MS) return null;
  const expected = createHmac("sha256", secret)
    .update(`connect-refresh:${accountId}.${expires}`).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex")) ? accountId : null;
}

export function onboardingCallbacks(projectId: string, token: string) {
  if (!/^[a-z][a-z0-9-]+$/.test(projectId)) throw new Error("Missing Firebase project ID");
  const base = `https://us-central1-${projectId}.cloudfunctions.net/connectOnboardingCallback`;
  return {
    return_url: `${base}?action=return`,
    refresh_url: `${base}?action=refresh&token=${encodeURIComponent(token)}`,
  };
}
