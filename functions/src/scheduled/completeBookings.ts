import { onSchedule } from "firebase-functions/v2/scheduler";
import { db } from "../admin";

export const completeBookings = onSchedule("every 60 minutes", async () => {
  const now = Date.now();
  const snapshot = await db
    .collection("bookings")
    .where("status", "==", "confirmed")
    .where("endTime", "<=", now)
    .limit(500)
    .get();

  const batch = db.batch();
  snapshot.docs.forEach((doc) => batch.update(doc.ref, { status: "completed" }));
  await batch.commit();
});
