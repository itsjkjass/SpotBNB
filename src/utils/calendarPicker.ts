import { pickerDate, pickerDateString } from "./calendarDays";

export function monthStart(date: string): string { return `${date.slice(0, 7)}-01`; }

export function shiftMonth(month: string, offset: number): string {
  const date = pickerDate(monthStart(month));
  date.setMonth(date.getMonth() + offset);
  return pickerDateString(date);
}

// Six rows keep the calendar and its confirmation button steady between months.
export function monthCells(month: string): (string | null)[] {
  const first = pickerDate(monthStart(month));
  const offset = first.getDay();
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0, 12).getDate();
  return Array.from({ length: 42 }, (_, index) => {
    const day = index - offset + 1;
    return day > 0 && day <= days ? `${month.slice(0, 7)}-${String(day).padStart(2, "0")}` : null;
  });
}

export function selectCalendarDay(start: string, end: string, day: string, field: "start" | "end", minimum: string) {
  if (day < minimum || (field === "end" && day < start)) return { start, end };
  return field === "start" ? { start: day, end: end < day ? day : end } : { start, end: day };
}
