import { onDocumentUpdated, onDocumentCreated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import { db } from "../admin";

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

async function sendExpoPush(messages: ExpoPushMessage[]) {
  if (messages.length === 0) return;
  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(messages),
    });
    if (!response.ok) {
      logger.error("Expo push send failed", await response.text());
    }
  } catch (err) {
    logger.error("Failed to send Expo push notification due to network error", err);
  }
}

async function getPushToken(userId: string): Promise<string | null> {
  const snap = await db.collection("users").doc(userId).get();
  return (snap.data()?.expoPushToken as string | undefined) ?? null;
}

export const onBookingCreatedNotifySeller = onDocumentCreated("bookings/{bookingId}", async (event) => {
  const booking = event.data?.data();
  if (!booking) return;

  const token = await getPushToken(booking.sellerId);
  if (!token) return;

  await sendExpoPush([
    {
      to: token,
      title: "New booking request",
      body: `Someone wants to book ${booking.spotTitle}.`,
      data: { bookingId: event.params.bookingId, type: "booking_created" },
    },
  ]);
});

export const onBookingStatusChangedNotifyBuyer = onDocumentUpdated(
  "bookings/{bookingId}",
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after || before.status === after.status) return;

    const token = await getPushToken(after.buyerId);
    if (!token) return;

    const statusMessages: Record<string, string> = {
      confirmed: `Your booking for ${after.spotTitle} is confirmed.`,
      cancelled: `Your booking for ${after.spotTitle} was cancelled.`,
      completed: `Your booking for ${after.spotTitle} is complete. Leave a review!`,
    };
    const body = statusMessages[after.status];
    if (!body) return;

    await sendExpoPush([
      {
        to: token,
        title: "Booking update",
        body,
        data: { bookingId: event.params.bookingId, type: "booking_status_changed" },
      },
    ]);
  }
);
