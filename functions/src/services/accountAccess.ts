import type { Transaction } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { db } from "../admin";

// Read inside the same transaction as writes. Deletion and new activity must
// conflict, even when the caller still holds an unexpired Firebase ID token.
export async function assertAccountActive(uid: string, transaction?: Transaction) {
  const ref = db.doc(`accountDeletions/${uid}`);
  const snapshot = transaction ? await transaction.get(ref) : await ref.get();
  if (snapshot.exists) throw new HttpsError("failed-precondition", "This account is being deleted. Contact spotbnb1@gmail.com if you need help.");
}
