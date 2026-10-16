import { collection, doc, getDocs, limit, onSnapshot, orderBy, query, startAfter, where, type QueryDocumentSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./firebase";
import type { Booking } from "../types/models";

export interface ChatMessage { id: string; senderId: string; text: string; createdAt: number }
export interface Conversation {
  id: string; buyerId: string; sellerId: string; spotTitle: string;
  lastMessage: string; lastMessageId: string | null; lastSenderId: string | null; updatedAt: number;
  buyerUnread: number; sellerUnread: number; buyerBlocked: boolean; sellerBlocked: boolean;
}
export type MessageCursor = QueryDocumentSnapshot;
const pageSize = 40;
const messagesRef = (bookingId: string) => collection(db, "bookings", bookingId, "messages");

export function subscribeInbox(uid: string, next: (items: Conversation[]) => void, fail: (error: Error) => void) {
  const results: Record<string, Conversation[]> = {};
  const stops = ["buyerId", "sellerId"].map(field => onSnapshot(
    query(collection(db, "conversations"), where(field, "==", uid), orderBy("updatedAt", "desc"), limit(100)),
    snapshot => {
      results[field] = snapshot.docs.map(d => ({ ...d.data(), id: d.id }) as Conversation);
      if (Object.keys(results).length === 2) {
        const merged = new Map(Object.values(results).flat().map(item => [item.id, item]));
        next([...merged.values()].sort((a, b) => b.updatedAt - a.updatedAt));
      }
    }, fail));
  return () => stops.forEach(stop => stop());
}

export function subscribeChat(bookingId: string, next: (messages: ChatMessage[], cursor?: MessageCursor) => void, fail: (error: Error) => void) {
  return onSnapshot(query(messagesRef(bookingId), orderBy("createdAt", "desc"), limit(pageSize)), snapshot => {
    next(snapshot.docs.map(d => ({ ...d.data(), id: d.id }) as ChatMessage), snapshot.docs.at(-1));
  }, fail);
}
export function subscribeBooking(bookingId: string, next: (booking: Booking | null) => void, fail: (error: Error) => void) {
  return onSnapshot(doc(db, "bookings", bookingId), snapshot => next(snapshot.exists() ? { ...snapshot.data(), id: snapshot.id } as Booking : null), fail);
}
export function subscribeConversation(bookingId: string, next: (conversation: Conversation | null) => void, fail: (error: Error) => void) {
  return onSnapshot(doc(db, "conversations", bookingId), snapshot => next(snapshot.exists() ? { ...snapshot.data(), id: snapshot.id } as Conversation : null), fail);
}
export async function getOlderMessages(bookingId: string, cursor: MessageCursor) {
  const snapshot = await getDocs(query(messagesRef(bookingId), orderBy("createdAt", "desc"), startAfter(cursor), limit(pageSize)));
  return { messages: snapshot.docs.map(d => ({ ...d.data(), id: d.id }) as ChatMessage), cursor: snapshot.docs.at(-1), hasMore: snapshot.size === pageSize };
}
export function newMessageId(bookingId: string) { return doc(messagesRef(bookingId)).id; }
export async function sendMessage(bookingId: string, messageId: string, text: string) {
  await httpsCallable(functions, "sendBookingMessage")({ bookingId, messageId, text });
}
export async function markMessagesRead(bookingId: string, lastMessageId: string) {
  await httpsCallable(functions, "markBookingMessagesRead")({ bookingId, lastMessageId });
}
export async function setChatBlocked(bookingId: string, blocked: boolean) {
  await httpsCallable(functions, "setBookingChatBlocked")({ bookingId, blocked });
}
export async function reportMessage(bookingId: string, messageId: string, reason: "harassment" | "spam" | "other") {
  await httpsCallable(functions, "reportBookingMessage")({ bookingId, messageId, reason });
}
