const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadBackend } = require('./helpers/backend.cjs');
const { quoteCalendarBooking: quote, calendarDayCount, midnightInZone, dateInZone } = loadBackend('lib/calendarDays.ts');
const now = Date.parse('2026-01-01T00:00:00Z');

test('calendar dates stay one daily charge on 23-hour and 25-hour days', () => {
  for (const [date, hours] of [['2026-03-08', 23], ['2026-11-01', 25]]) {
    const q = quote(date, date, 24.99, 'America/Toronto', now);
    assert.equal(q.dayCount, 1);
    assert.equal(q.totalPriceCents, 2499);
    assert.equal((q.endTime - q.startTime) / 3600000, hours);
  }
});
test('inclusive ranges cross months, leap days and years without elapsed-hour rounding', () => {
  assert.equal(calendarDayCount('2028-02-28', '2028-03-01'), 3);
  assert.equal(calendarDayCount('2026-12-31', '2027-01-01'), 2);
  const q = quote('2026-03-07', '2026-03-09', 18.35, undefined, now);
  assert.equal(q.totalPriceCents, 5505);
  assert.equal((q.endTime - q.startTime) / 3600000, 71);
});
test('exclusive end permits next-date bookings and blocks sharing a selected date', () => {
  const a = quote('2026-10-24', '2026-10-25', 10, undefined, now);
  const b = quote('2026-10-26', '2026-10-26', 10, undefined, now);
  const c = quote('2026-10-25', '2026-10-25', 10, undefined, now);
  assert.equal(a.endTime, b.startTime);
  assert.ok(c.startTime < a.endTime && c.endTime > a.startTime);
});
test('space timezone controls dates, including half-hour offsets', () => {
  assert.equal(new Date(midnightInZone('2026-01-02', 'America/St_Johns')).toISOString(), '2026-01-02T03:30:00.000Z');
  assert.equal(new Date(midnightInZone('2026-07-02', 'America/St_Johns')).toISOString(), '2026-07-02T02:30:00.000Z');
  const instant = Date.parse('2026-10-25T02:00:00Z');
  assert.equal(dateInZone(instant, 'America/Vancouver'), '2026-10-24');
  assert.equal(quote('2026-10-24', '2026-10-24', 10, 'America/Vancouver', instant).dayCount, 1);
  assert.throws(() => quote('2026-10-23', '2026-10-24', 10, 'America/Vancouver', instant));
});
test('invalid dates, reversed ranges, precision and oversized totals fail closed', () => {
  for (const date of ['2026-02-29', '2026-04-31', '2026-1-1', '', null]) {
    assert.throws(() => quote(date, date, 20, undefined, now));
  }
  assert.throws(() => quote('2026-10-25', '2026-10-24', 20, undefined, now));
  assert.throws(() => quote('2026-10-24', '2026-10-24', 20.123, undefined, now));
  assert.throws(() => quote('2026-10-24', '2026-10-25', 999999.99, undefined, now));
});
