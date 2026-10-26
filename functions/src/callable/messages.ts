import { onCall, HttpsError } from "firebase-functions/v2/https";
import type { DocumentData } from "firebase-admin/firestore";
import { db } from "../admin";
import { assertAccountActive } from "../services/accountAccess";

function id(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new HttpsError("invalid-argument", "Invalid booking or message ID.");
  }
  return value;
}

function participant(booking: DocumentData | undefined, uid: string) {
  if (!booking || (booking.buyerId !== uid && booking.sellerId !== uid)) {
    throw new HttpsError("permission-denied", "This conversation is not available to your account.");
  }
  return booking;
}

function conversationData(booking: DocumentData): DocumentData {
  return { buyerId: booking.buyerId, sellerId: booking.sellerId, spotTitle: booking.spotTitle,
    lastMessage: "", lastMessageId: null, lastSenderId: null, updatedAt: Date.now(),
    buyerUnread: 0, sellerUnread: 0, buyerBlocked: false, sellerBlocked: false };
}

export const sendBookingMessage = onCall(async request => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Log in to send a message.");
  const uid = request.auth.uid;
  const bookingId = id(request.data?.bookingId);
  const messageId = id(request.data?.messageId);
  const text = typeof request.data?.text === "string" ? request.data.text.trim() : "";
  if (!text || text.length > 2000) throw new HttpsError("invalid-argument", "Messages must contain 1–2000 characters.");
  const bookingRef = db.doc(`bookings/${bookingId}`);
  const conversationRef = db.doc(`conversations/${bookingId}`);
  const messageRef = bookingRef.collection("messages").doc(messageId);
  await db.runTransaction(async tx => {
    const booking = participant((await tx.get(bookingRef)).data(), uid);
    await assertAccountActive(booking.buyerId, tx);
    await assertAccountActive(booking.sellerId, tx);
    if (booking.buyerAccountDeleted || booking.sellerAccountDeleted) throw new HttpsError("failed-precondition", "This conversation is closed because a participant deleted their account.");
    const existing = (await tx.get(messageRef)).data();
    if (existing) {
      if (existing.senderId === uid && existing.text === text) return;
      throw new HttpsError("already-exists", "This message ID has already been used.");
    }
    if (!["confirmed", "completed"].includes(booking.status)) {
      throw new HttpsError("failed-precondition", "Messaging opens after payment confirms the booking. Cancelled bookings are read-only.");
    }
    const conversation = (await tx.get(conversationRef)).data() ?? conversationData(booking);
    if (conversation.buyerBlocked || conversation.sellerBlocked) {
      throw new HttpsError("permission-denied", "Messaging is blocked for this booking.");
    }
    const isBuyer = uid === booking.buyerId;
    const sentField = isBuyer ? "buyerLastSentAt" : "sellerLastSentAt";
    const now = Date.now();
    if (typeof conversation[sentField] === "number" && now - conversation[sentField] < 1000) {
      throw new HttpsError("resource-exhausted", "Please wait a moment before sending another message.");
    }
    tx.create(messageRef, { senderId: uid, text, createdAt: now });
    const unreadField = isBuyer ? "sellerUnread" : "buyerUnread";
    tx.set(conversationRef, { ...conversation, lastMessage: text, lastMessageId: messageId,
      lastSenderId: uid, updatedAt: now, [sentField]: now,
      [unreadField]: (conversation[unreadField] ?? 0) + 1 });
  });
  return { messageId };
});

export const markBookingMessagesRead = onCall(async request => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Log in to read messages.");
  const uid = request.auth.uid;
  const bookingId = id(request.data?.bookingId);
  const messageId = id(request.data?.lastMessageId);
  const ref = db.doc(`conversations/${bookingId}`);
  await db.runTransaction(async tx => {
    const booking = participant((await tx.get(db.doc(`bookings/${bookingId}`))).data(), uid);
    await assertAccountActive(uid, tx);
    const conversation = (await tx.get(ref)).data();
    // Don't clear unread messages that arrived after the client last rendered.
    if (conversation?.lastMessageId === messageId) {
      tx.update(ref, { [uid === booking.buyerId ? "buyerUnread" : "sellerUnread"]: 0 });
    }
  });
  return { ok: true };
});

export const setBookingChatBlocked = onCall(async request => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Log in to manage messages.");
  const uid = request.auth.uid;
  const bookingId = id(request.data?.bookingId);
  if (typeof request.data?.blocked !== "boolean") throw new HttpsError("invalid-argument", "Invalid block setting.");
  const ref = db.doc(`conversations/${bookingId}`);
  await db.runTransaction(async tx => {
    const booking = participant((await tx.get(db.doc(`bookings/${bookingId}`))).data(), uid);
    await assertAccountActive(booking.buyerId, tx);
    await assertAccountActive(booking.sellerId, tx);
    if (booking.buyerAccountDeleted || booking.sellerAccountDeleted) throw new HttpsError("failed-precondition", "This conversation is closed because a participant deleted their account.");
    const conversation = (await tx.get(ref)).data() ?? conversationData(booking);
    tx.set(ref, { ...conversation, [uid === booking.buyerId ? "buyerBlocked" : "sellerBlocked"]: request.data.blocked });
  });
  return { ok: true };
});

export const reportBookingMessage = onCall(async request => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Log in to report a message.");
  const uid = request.auth.uid;
  const bookingId = id(request.data?.bookingId);
  const messageId = id(request.data?.messageId);
  const reason = request.data?.reason;
  if (!["harassment", "spam", "other"].includes(reason)) throw new HttpsError("invalid-argument", "Choose a report reason.");
  await db.runTransaction(async tx => {
    const booking = participant((await tx.get(db.doc(`bookings/${bookingId}`))).data(), uid);
    await assertAccountActive(booking.buyerId, tx);
    await assertAccountActive(booking.sellerId, tx);
    if (booking.buyerAccountDeleted || booking.sellerAccountDeleted) throw new HttpsError("failed-precondition", "This conversation is closed.");
    const message = (await tx.get(db.doc(`bookings/${bookingId}/messages/${messageId}`))).data();
    if (!message || message.senderId === uid) throw new HttpsError("invalid-argument", "Select a message from the other participant.");
    tx.set(db.doc(`messageReports/${bookingId}_${messageId}_${uid}`), {
      bookingId, messageId, reporterId: uid, senderId: message.senderId, text: message.text, reason, createdAt: Date.now(),
    });
  });
  return { ok: true };
});
