import type { Booking } from "../types/models";

export function selectBookings(bookings: Booking[], uid: string, role: "buyer" | "seller", period: "upcoming" | "past", now: number): Booking[] {
  return [...new Map(bookings.map(booking => [booking.id, booking])).values()]
    .filter(booking => (role === "buyer" ? booking.buyerId : booking.sellerId) === uid)
    .filter(booking => {
      const past = booking.status === "cancelled" || booking.status === "completed" || booking.endTime <= now;
      return period === "past" ? past : !past;
    })
    .sort((a, b) => period === "past" ? b.startTime - a.startTime : a.startTime - b.startTime);
}
