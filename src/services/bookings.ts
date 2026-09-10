import { collection, doc, getDoc, getDocs, query, where, orderBy } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./firebase";
import { Booking } from "../types/models";

const bookingsCollection = collection(db, "bookings");

interface CreateBookingRequest {
  spotId: string;
  startTime: number;
  endTime: number;
}

interface CreateBookingResponse {
  bookingId: string;
  paymentIntentClientSecret: string;
}

/**
 * Booking creation, price calculation, and the Stripe PaymentIntent are all
 * done server-side in a Cloud Function so pricing/availability can't be spoofed by the client.
 */
export async function requestBooking(payload: CreateBookingRequest): Promise<CreateBookingResponse> {
  const createBooking = httpsCallable<CreateBookingRequest, CreateBookingResponse>(
    functions,
    "createBooking"
  );
  const result = await createBooking(payload);
  return result.data;
}

export async function getBooking(bookingId: string): Promise<Booking | null> {
  const snapshot = await getDoc(doc(db, "bookings", bookingId));
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...snapshot.data() } as Booking;
}

export async function getBookingsForBuyer(buyerId: string): Promise<Booking[]> {
  const q = query(bookingsCollection, where("buyerId", "==", buyerId), orderBy("startTime", "desc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Booking);
}

export async function getBookingsForSeller(sellerId: string): Promise<Booking[]> {
  const q = query(bookingsCollection, where("sellerId", "==", sellerId), orderBy("startTime", "desc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Booking);
}

export async function cancelBooking(bookingId: string) {
  const cancel = httpsCallable(functions, "cancelBooking");
  await cancel({ bookingId });
}
