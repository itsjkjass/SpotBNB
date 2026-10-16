import { collection, doc, getDoc, getDocs, limit, orderBy, query, startAfter, where, type QueryDocumentSnapshot, type DocumentData } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./firebase";
import type { Booking } from "../types/models";

export interface SellerTransfer {
  status: "processing" | "transferred" | "held" | "reversed" | "reversal_pending";
  amountCents: number;
}
export interface EarningsItem { booking: Booking; transfer: SellerTransfer | null }
export type EarningsCursor = QueryDocumentSnapshot<DocumentData>;

export async function getEarningsPage(uid: string, cursor?: EarningsCursor) {
  const constraints = [where("sellerId", "==", uid), orderBy("startTime", "desc"), ...(cursor ? [startAfter(cursor)] : []), limit(20)];
  const result = await getDocs(query(collection(db, "bookings"), ...constraints));
  const items: EarningsItem[] = await Promise.all(result.docs.map(async snapshot => {
    const booking = { ...snapshot.data(), id: snapshot.id } as Booking;
    const transfer = booking.paymentFlow === "separate_v1" ? await getDoc(doc(db, "sellerTransfers", snapshot.id)) : null;
    return { booking, transfer: transfer?.exists() ? transfer.data() as SellerTransfer : null };
  }));
  return { items, cursor: result.size === 20 ? result.docs[result.docs.length - 1] : undefined };
}

export async function withdrawEarnings(bookingId: string) {
  const fn = httpsCallable<{ bookingId: string }, { status: SellerTransfer["status"]; amountCents: number }>(
    functions, "withdrawBookingEarnings", { timeout: 130_000 }
  );
  return (await fn({ bookingId })).data;
}
