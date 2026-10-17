export { PARKING_TIME_ZONES, DEFAULT_PARKING_TIME_ZONE, dateOrdinal, addCalendarDays, calendarDayCount, parkingTimeZone, dateInZone, dailyRateCents, quoteCalendarBooking } from "../../functions/src/lib/calendarDays";
import { dailyRateCents, parkingTimeZone } from "../../functions/src/lib/calendarDays";

export function supportsDailyBooking(spot: { pricePerDay?: number; timeZone?: string; availability?: { type: string } }): boolean {
  try {
    dailyRateCents(spot.pricePerDay);
    parkingTimeZone(spot.timeZone);
    return spot.availability?.type !== "recurring_hours";
  } catch { return false; }
}

// Date pickers use the device's calendar fields, not its UTC date. Conversion
// to parking-space midnight happens only in the shared timezone-aware quote.
export function pickerDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}
export function pickerDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function displayCalendarDate(value: string): string {
  return pickerDate(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
