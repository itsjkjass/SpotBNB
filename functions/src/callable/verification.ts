import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineBoolean, defineSecret } from "firebase-functions/params";
import { randomUUID } from "node:crypto";
import { db } from "../admin";
import { CONSENT_VERSION, evaluateReview, validateSubmission } from "../lib/documentReview";
import { reviewDocuments } from "../lib/geminiReview";
import { assertAccountActive } from "../services/accountAccess";

const geminiKey = defineSecret("GEMINI_API_KEY");
// Activate only after paid Gemini data handling and the privacy notice are configured.
const enabled = defineBoolean("DOCUMENT_CHECKS_ENABLED", { default: false });

export const getDocumentCheckSettings = onCall(() => ({ enabled: enabled.value(), consentVersion: CONSENT_VERSION }));

export const submitDocumentCheck = onCall({ secrets: [geminiKey], timeoutSeconds: 120, memory: "512MiB", maxInstances: 3, concurrency: 2 }, async request => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Log in to check your documents.");
  if (!enabled.value()) throw new HttpsError("failed-precondition", "Document checks are not available yet.");
  let submission;
  try { submission = validateSubmission(request.data); }
  catch (error) { throw new HttpsError("invalid-argument", error instanceof Error ? error.message : "Invalid documents."); }
  const uid = request.auth.uid;
  const { role, images } = submission;
  const ref = db.doc(`documentChecks/${uid}/roles/${role}`);
  const publicRef = db.doc(`documentBadges/${uid}`);
  const attemptId = randomUUID();
  const now = Date.now();
  await db.runTransaction(async tx => {
    await assertAccountActive(uid, tx);
    const current = (await tx.get(ref)).data();
    if (current?.status === "processing" && now - current.updatedAt < 180_000) {
      throw new HttpsError("already-exists", "Your documents are still being checked.");
    }
    if (typeof current?.lastSubmittedAt === "number" && now - current.lastSubmittedAt < 60_000) {
      throw new HttpsError("resource-exhausted", "Please wait a minute before submitting again.");
    }
    const sameDay = current?.day === new Date(now).toISOString().slice(0, 10);
    const attempts = sameDay ? current?.attempts ?? 0 : 0;
    if (attempts >= 5) throw new HttpsError("resource-exhausted", "You have reached today's limit. Try again tomorrow.");
    tx.set(ref, { status: "processing", reasons: [], expiresAt: null, attemptId, consentVersion: CONSENT_VERSION,
      consentAt: now, lastSubmittedAt: now, updatedAt: now, day: new Date(now).toISOString().slice(0, 10), attempts: attempts + 1 });
    tx.set(publicRef, { [role]: { status: "not_checked", expiresAt: null } }, { merge: true });
  });
  try {
    const outcome = evaluateReview(role, await reviewDocuments(geminiKey.value(), role, images));
    await db.runTransaction(async tx => {
      await assertAccountActive(uid, tx);
      const current = (await tx.get(ref)).data();
      if (current?.attemptId !== attemptId || current.status !== "processing") return;
      tx.update(ref, { ...outcome, updatedAt: Date.now() });
      tx.set(publicRef, { [role]: { status: outcome.status === "checked" ? "checked" : "not_checked", expiresAt: outcome.expiresAt } }, { merge: true });
    });
    return { ...outcome };
  } catch {
    await db.runTransaction(async tx => {
      const current = (await tx.get(ref)).data();
      if (current?.attemptId === attemptId && current.status === "processing") tx.update(ref, { status: "error", reasons: [], updatedAt: Date.now() });
    });
    throw new HttpsError("unavailable", "We couldn't check your documents. Please try again later.");
  }
});

export const removeDocumentCheck = onCall(async request => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Log in to manage your document checks.");
  const uid = request.auth.uid;
  const role = request.data?.role;
  if (role !== "buyer" && role !== "seller") throw new HttpsError("invalid-argument", "Choose buyer or seller.");
  const ref = db.doc(`documentChecks/${uid}/roles/${role}`);
  await db.runTransaction(async tx => {
    await assertAccountActive(uid, tx);
    const current = (await tx.get(ref)).data();
    // Retain only daily rate-limit metadata, so removal cannot reset submission limits.
    tx.set(ref, { status: "not_checked", reasons: [], expiresAt: null, attemptId: null, updatedAt: Date.now(),
      day: current?.day ?? "", attempts: current?.attempts ?? 0, lastSubmittedAt: current?.lastSubmittedAt ?? 0 });
    tx.set(db.doc(`documentBadges/${uid}`), { [role]: { status: "not_checked", expiresAt: null } }, { merge: true });
  });
  return { ok: true };
});
