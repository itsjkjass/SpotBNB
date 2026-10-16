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

  for (let offset = 0; offset < snapshot.docs.length; offset += 10) {
    await Promise.all(snapshot.docs.slice(offset, offset + 10).map(document => db.runTransaction(async transaction => {
      const booking = (await transaction.get(document.ref)).data();
      if (booking?.status === "confirmed" && !booking.cancellationRequestedAt) {
        transaction.update(document.ref, { status: "completed" });
      }
    })));
  }
});
