// Pure shared calendar/pricing logic used by both the app and the payment backend.
export const PARKING_TIME_ZONES = [
  ["America/Toronto", "Eastern · Toronto / Montréal"],
  ["America/Vancouver", "Pacific · Vancouver"],
  ["America/Edmonton", "Mountain · Calgary / Edmonton"],
  ["America/Winnipeg", "Central · Winnipeg"],
  ["America/Regina", "Saskatchewan · Regina"],
  ["America/Halifax", "Atlantic · Halifax"],
  ["America/St_Johns", "Newfoundland · St. John's"],
  ["America/Whitehorse", "Yukon · Whitehorse"],
] as const;
export const DEFAULT_PARKING_TIME_ZONE = "America/Toronto";
const DAY = 86_400_000;

export function dateOrdinal(value: string): number {
  if (typeof value !== "string" || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) throw new Error("Choose a valid calendar date.");
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("Choose a valid calendar date.");
  return date.getTime() / DAY;
}
export function addCalendarDays(value: string, count: number): string {
  return new Date((dateOrdinal(value) + count) * DAY).toISOString().slice(0, 10);
}
export function calendarDayCount(first: string, last: string): number {
  const count = dateOrdinal(last) - dateOrdinal(first) + 1;
  if (count < 1) throw new Error("The last parking date must be on or after the first.");
  return count;
}
export function parkingTimeZone(value?: string): string {
  const zone = value ?? DEFAULT_PARKING_TIME_ZONE;
  if (!PARKING_TIME_ZONES.some(([id]) => id === zone)) throw new Error("This space needs a valid parking time zone.");
  return zone;
}
export function dateInZone(time: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(time);
  const part = (name: string) => parts.find(p => p.type === name)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function midnightInZone(date: string, timeZone: string): number {
  const target = dateOrdinal(date) * DAY;
  const format = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  let candidate = target;
  for (let i = 0; i < 4; i++) {
    const parts = format.formatToParts(candidate);
    const number = (name: string) => Number(parts.find(p => p.type === name)!.value);
    const rendered = Date.UTC(number("year"), number("month") - 1, number("day"), number("hour"), number("minute"), number("second"));
    if (rendered === target) return candidate;
    candidate += target - rendered;
  }
  throw new Error("This date cannot be booked in the space's time zone.");
}
export function dailyRateCents(rate: unknown): number {
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate < 0.5 || rate > 999999.99 || Math.abs(rate * 100 - Math.round(rate * 100)) > 0.000001) {
    throw new Error("Set a daily price of at least $0.50 CAD, using no more than two decimal places.");
  }
  return Math.round(rate * 100);
}
export function quoteCalendarBooking(first: string, last: string, rate: unknown, zone?: string, now = Date.now()) {
  const timeZone = parkingTimeZone(zone);
  const dayCount = calendarDayCount(first, last);
  if (first < dateInZone(now, timeZone)) throw new Error("Choose today or a future parking date.");
  const pricePerDayCents = dailyRateCents(rate);
  const totalPriceCents = dayCount * pricePerDayCents;
  if (!Number.isSafeInteger(totalPriceCents) || totalPriceCents > 99_999_999) throw new Error("Booking total is outside the supported payment range.");
  return { startDate: first, endDate: last, dayCount, timeZone, pricePerDayCents, totalPriceCents,
    startTime: midnightInZone(first, timeZone), endTime: midnightInZone(addCalendarDays(last, 1), timeZone) };
}
