import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import { db } from "../admin";
import { stripeSecretKey, PAYMENT_RECHECK_MS } from "../config";
import { getOrCreateBookingPayment, syncBookingPaymentStatus } from "../services/bookingPayment";

export const reconcileBookingPayments = onSchedule(
  { schedule: "every 5 minutes", secrets: [stripeSecretKey], timeoutSeconds: 540, maxInstances: 1 },
  async () => {
    const now = Date.now();
    // Only new reservations carry this field. Legacy records cannot safely be
    // recreated because their original Stripe request/key was not persisted.
    const snapshot = await db.collection("bookings")
      .where("status", "==", "pending_payment")
      .where("paymentReconcileAt", "<=", now)
      .orderBy("paymentReconcileAt")
      .limit(25)
      .get();

    for (let offset = 0; offset < snapshot.docs.length; offset += 5) {
      await Promise.all(snapshot.docs.slice(offset, offset + 5).map(async (document) => {
        try {
          const intent = await getOrCreateBookingPayment(document.ref);
          if (intent) await syncBookingPaymentStatus(document.ref, intent);
        } catch {
          logger.error("Payment reconciliation failed; reservation retained", { bookingId: document.id });
        }
        try {
          await db.runTransaction(async (transaction) => {
            const current = (await transaction.get(document.ref)).data();
            if (current?.status === "pending_payment") {
              transaction.update(document.ref, { paymentReconcileAt: Date.now() + PAYMENT_RECHECK_MS });
            }
          });
        } catch {
          logger.error("Could not reschedule payment reconciliation", { bookingId: document.id });
        }
      }));
    }
  }
);
