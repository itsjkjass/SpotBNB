import { randomUUID } from "node:crypto";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";
import { FieldValue, Timestamp, type DocumentData, type Query, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { app, db } from "../admin";
import { getStripeClient } from "../stripeClient";

const DAY = 86_400_000;
export const FINANCIAL_RETENTION_DAYS = 7 * 365;

export function deletionBlocker(bookings: DocumentData[], transfers: Map<string, DocumentData>, uid: string): string | null {
  if ([...transfers.values()].some(transfer => !["transferred", "reversed"].includes(transfer.status))) {
    return "A withdrawal or payment adjustment is still pending. Resolve it in Earnings, or contact spotbnb1@gmail.com before deleting your account.";
  }
  for (const booking of bookings) {
    if (!["cancelled", "completed"].includes(booking.status)) {
      return "Finish or cancel your active bookings before deleting your account. Unpaid reservations may take a few minutes to expire.";
    }
    if (booking.cancellationRequestedAt && booking.status !== "cancelled") return "Wait for your pending cancellation to finish before deleting your account.";
    if (booking.sellerId !== uid) continue;
    const transfer = transfers.get(booking.id);
    if (transfer && !["transferred", "reversed"].includes(transfer.status)) {
      return "A withdrawal or payment adjustment is still pending. Resolve it in Earnings, or contact spotbnb1@gmail.com before deleting your account.";
    }
    if (booking.status === "completed" && booking.paymentFlow === "separate_v1" &&
        !(booking.refundedCents >= booking.totalPriceCents) && transfer?.status !== "transferred") {
      return "You still have earnings to settle. Open Profile → Earnings and withdraw them before deleting your account. For a refund or dispute, contact spotbnb1@gmail.com.";
    }
  }
  return null;
}

export async function queueAccountDeletion(uid: string) {
  const jobRef = db.doc(`accountDeletions/${uid}`);
  if ((await jobRef.get()).exists) return;
  const userRef = db.doc(`users/${uid}`);
  const profile = (await userRef.get()).data();
  // Closing the app account must not strand a seller's money in Connect.
  const accountId = profile?.stripeConnectAccountId;
  if (accountId) {
    const balance = await getStripeClient().balance.retrieve({ stripeAccount: accountId });
    if ([...balance.available, ...balance.pending, ...(balance.connect_reserved ?? [])].some(item => item.amount !== 0)) {
      throw new HttpsError("failed-precondition", "Your Stripe account still has an unsettled balance. Wait for bank payouts to finish, or contact spotbnb1@gmail.com before deleting your account.");
    }
  }
  await db.runTransaction(async tx => {
    const existing = await tx.get(jobRef);
    if (existing.exists) return;
    const current = (await tx.get(userRef)).data();
    if (current?.stripeConnectAccountId !== accountId) throw new HttpsError("aborted", "Payout details changed. Please try again.");
    const bought = await tx.get(db.collection("bookings").where("buyerId", "==", uid));
    const sold = await tx.get(db.collection("bookings").where("sellerId", "==", uid));
    const withdrawals = await tx.get(db.collection("sellerTransfers").where("sellerId", "==", uid));
    const bookings = [...new Map([...bought.docs, ...sold.docs].map(doc => [doc.id, { ...doc.data(), id: doc.id }])).values()];
    const transfers = new Map(withdrawals.docs.map(doc => [doc.id, doc.data()]));
    const blocker = deletionBlocker(bookings, transfers, uid);
    if (blocker) throw new HttpsError("failed-precondition", blocker);
    tx.create(jobRef, { status: "pending", requestedAt: Date.now(), replacementId: `deleted_${randomUUID()}`, leaseUntil: 0 });
    if (current) tx.update(userRef, { expoPushToken: FieldValue.delete() });
  });
}

async function deleteMatching(query: Query) {
  // Bounded batches also make cleanup safe for accounts with large histories.
  for (;;) {
    const page = await query.limit(100).get();
    if (page.empty) return;
    for (const doc of page.docs) await db.recursiveDelete(doc.ref);
  }
}

async function redactBooking(snapshot: QueryDocumentSnapshot, uid: string, replacementId: string) {
  const bookingRef = snapshot.ref;
  await db.recursiveDelete(bookingRef.collection("messages"));
  await db.doc(`conversations/${snapshot.id}`).delete();
  const transferRef = db.doc(`sellerTransfers/${snapshot.id}`);
  await db.runTransaction(async tx => {
    const booking = (await tx.get(bookingRef)).data();
    const transfer = (await tx.get(transferRef)).data();
    if (!booking) return;
    const updates: DocumentData = { paymentIntentRequest: FieldValue.delete(), expiresAt: Timestamp.fromMillis(Date.now() + FINANCIAL_RETENTION_DAYS * DAY) };
    if (booking.buyerId === uid) Object.assign(updates, { buyerId: replacementId, buyerAccountDeleted: true });
    if (booking.sellerId === uid) Object.assign(updates, {
      sellerId: replacementId, sellerAccountDeleted: true, spotTitle: "Removed parking space", spotAddress: "",
      spotLocation: FieldValue.delete(),
    });
    tx.update(bookingRef, updates);
    if (transfer?.sellerId === uid) tx.update(transferRef, {
      sellerId: replacementId, "request.metadata.sellerId": replacementId, expiresAt: updates.expiresAt,
    });
  });
}

// Durable, retryable cleanup: a storage/network failure must not leave an
// account half-deleted with no worker able to finish it.
export async function processAccountDeletion(uid: string) {
  const ref = db.doc(`accountDeletions/${uid}`);
  const lease = randomUUID();
  const job = await db.runTransaction(async tx => {
    const data = (await tx.get(ref)).data();
    if (!data || data.status !== "pending" || data.leaseUntil > Date.now()) return null;
    tx.update(ref, { lease, leaseUntil: Date.now() + 10 * 60_000 });
    return data;
  });
  if (!job) return;
  const auth = getAuth(app);
  const ignoreMissingUser = (error: unknown) => {
    if ((error as { code?: string }).code !== "auth/user-not-found") throw error;
  };
  try {
    await auth.updateUser(uid, { disabled: true }).catch(ignoreMissingUser);
    await auth.revokeRefreshTokens(uid).catch(ignoreMissingUser);
    await deleteMatching(db.collection("spots").where("ownerId", "==", uid));
    // Restrict the prefix to this exact UID; never delete another user's files.
    await getStorage(app).bucket().deleteFiles({ prefix: `spots/${uid}/` });
    for (const field of ["buyerId", "sellerId"]) {
      for (;;) {
        const page = await db.collection("bookings").where(field, "==", uid).limit(50).get();
        if (page.empty) break;
        for (const booking of page.docs) await redactBooking(booking, uid, job.replacementId);
      }
    }
    for (const field of ["authorId", "targetId"]) await deleteMatching(db.collection("reviews").where(field, "==", uid));
    for (const field of ["reporterId", "senderId"]) await deleteMatching(db.collection("messageReports").where(field, "==", uid));
    for (const field of ["buyerId", "sellerId"]) await deleteMatching(db.collection("conversations").where(field, "==", uid));
    for (;;) {
      const orphaned = await db.collection("sellerTransfers").where("sellerId", "==", uid).limit(100).get();
      if (orphaned.empty) break;
      for (const transfer of orphaned.docs) await transfer.ref.update({
        sellerId: job.replacementId, "request.metadata.sellerId": job.replacementId,
        expiresAt: Timestamp.fromMillis(Date.now() + FINANCIAL_RETENTION_DAYS * DAY),
      });
    }
    await db.recursiveDelete(db.doc(`documentChecks/${uid}`));
    await db.doc(`documentBadges/${uid}`).delete();
    await db.recursiveDelete(db.doc(`users/${uid}`));
    await auth.deleteUser(uid).catch(ignoreMissingUser);
    // Keep a short-lived barrier against already-issued tokens recreating data.
    await ref.set({ status: "completed", completedAt: Date.now(), expiresAt: Timestamp.fromMillis(Date.now() + 7 * DAY) });
  } catch (error) {
    await db.runTransaction(async tx => {
      const current = (await tx.get(ref)).data();
      if (current?.lease === lease) tx.update(ref, { leaseUntil: 0 });
    });
    throw error;
  }
}
