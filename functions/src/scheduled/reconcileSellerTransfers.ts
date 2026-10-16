import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import { db } from "../admin";
import { stripeSecretKey, PAYMENT_RECHECK_MS } from "../config";
import { reconcileSellerTransfer } from "../services/sellerEarnings";
import { finishBookingCancellation } from "../services/bookingCancellation";

export const reconcileSellerTransfers = onSchedule(
  { schedule: "every 5 minutes", secrets: [stripeSecretKey], timeoutSeconds: 540, maxInstances: 1 },
  async () => {
    const cancellations = await db.collection("bookings")
      .where("status", "in", ["pending_payment", "confirmed"])
      .where("cancellationReconcileAt", "<=", Date.now()).orderBy("cancellationReconcileAt").limit(50).get();
    for (let offset = 0; offset < cancellations.docs.length; offset += 5) {
      await Promise.all(cancellations.docs.slice(offset, offset + 5).map(async document => {
        try { await finishBookingCancellation(document.ref); }
        catch {
          logger.error("Booking cancellation awaits reconciliation", { bookingId: document.id });
          await document.ref.update({ cancellationReconcileAt: Date.now() + PAYMENT_RECHECK_MS });
        }
      }));
    }
    const due = await db.collection("sellerTransfers")
      .where("status", "in", ["processing", "transferred", "reversal_pending"])
      .where("nextCheckAt", "<=", Date.now()).orderBy("nextCheckAt").limit(100).get();
    for (let offset = 0; offset < due.docs.length; offset += 5) {
      await Promise.all(due.docs.slice(offset, offset + 5).map(async document => {
        try {
          await reconcileSellerTransfer(document.id);
        } catch {
          logger.error("Seller transfer reconciliation failed", { bookingId: document.id });
          await document.ref.update({ nextCheckAt: Date.now() + PAYMENT_RECHECK_MS });
        }
      }));
    }
  }
);
