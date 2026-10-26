import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import { db } from "../admin";
import { processAccountDeletion } from "../services/accountDeletion";

export const onAccountDeletionRequested = onDocumentCreated({ document: "accountDeletions/{uid}", timeoutSeconds: 540, retry: true, maxInstances: 3, concurrency: 1 }, async event => {
  await processAccountDeletion(event.params.uid);
});

export const retryAccountDeletions = onSchedule({ schedule: "every 15 minutes", timeoutSeconds: 540, maxInstances: 1 }, async () => {
  const pending = await db.collection("accountDeletions").where("status", "==", "pending").limit(20).get();
  for (const job of pending.docs) {
    try { await processAccountDeletion(job.id); }
    catch { logger.error("Account deletion cleanup requires retry", { requestId: job.id }); }
  }
});
