const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadBackend } = require('./helpers/backend.cjs');

function fixture(prices = {}) {
  const writes = [];
  let reads = 0;
  let payments = 0;
  const query = { where() { return this; } };
  const db = {
    collection(name) {
      reads++;
      if (name === 'bookings') return { ...query, doc: () => ({ id: 'booking' }) };
      return { doc: () => ({ get: async () => ({ exists: true, data: () => name === 'spots'
        ? { ownerId: 'seller', title: 'Parking', address: 'Test', isActive: true, pricePerDay: 5, ...prices }
        : { stripeConnectOnboarded: false } }) }) };
    },
    runTransaction: async callback => callback({ get: async () => ({ docs: [] }), set: (_, value) => writes.push(value) }),
  };
  class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const { createBooking } = loadBackend('callable/createBooking.ts', {
    'firebase-functions/v2/https': { onCall: (_, handler) => handler, HttpsError },
    '../admin': { db }, '../config': { stripeSecretKey: {}, PLATFORM_FEE_PERCENT: 12, PAYMENT_HOLD_MS: 900000 },
    '../services/bookingPayment': { getOrCreateBookingPayment: async () => {
      payments++; return { client_secret: 'test', status: 'requires_payment_method' };
    } },
  });
  const startDate = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  return { writes, reads: () => reads, payments: () => payments,
    valid: { spotId: 'spot', startDate, endDate: startDate, expectedTotalPriceCents: 500 },
    run: data => createBooking({ auth: { uid: 'buyer' }, data }) };
}

test('malformed request bodies fail before database access', async () => {
  for (const data of [null, undefined, [], 'request', 12, {}]) {
    const f = fixture();
    await assert.rejects(f.run(data), { code: 'invalid-argument' });
    assert.equal(f.reads(), 0);
  }
});

test('invalid IDs and malformed calendar dates fail before database access', async () => {
  const badValues = [
    ...[{}, 12, ' ', 'spots/other', '.', '..'].map(spotId => ({ spotId })),
    ...['123', NaN, Infinity, null, 1.5, '2026-02-30', '2026-13-01'].flatMap(value => [{ startDate: value }, { endDate: value }]),
    { startDate: '2030-01-02', endDate: '2030-01-01' },
  ];
  for (const override of badValues) {
    const f = fixture();
    await assert.rejects(f.run({ ...f.valid, ...override }), { code: 'invalid-argument' });
    assert.equal(f.reads(), 0);
  }
});

test('invalid stored daily rates cannot create a reservation or payment', async () => {
  for (const value of [undefined, null, '5', NaN, Infinity, 0, -5, 0.01, 1000000, 5.001]) {
    const f = fixture({ pricePerDay: value });
    await assert.rejects(f.run(f.valid), { code: 'failed-precondition' });
    assert.equal(f.writes.length, 0);
    assert.equal(f.payments(), 0);
  }
});

test('same-date booking charges one day, independently of hourly legacy data', async () => {
  const f = fixture({ pricePerHour: 999 });
  await f.run(f.valid);
  assert.equal(f.writes[0].totalPriceCents, 500);
  assert.equal(f.writes[0].dayCount, 1);
  assert.equal(f.writes[0].paymentFlow, 'separate_v1');
  assert.equal(f.writes[0].paymentIntentRequest.transfer_data, undefined);
  assert.equal(f.writes[0].paymentIntentRequest.application_fee_amount, undefined);
  assert.equal(f.writes[0].paymentIntentRequest.transfer_group, 'booking_booking');
});

test('booking snapshots the saved parking pin and ignores client-supplied coordinates', async () => {
  const point = { latitude: 43.65123, longitude: -79.38123 };
  const f = fixture({ location: point });
  await f.run({ ...f.valid, spotLocation: { latitude: 0, longitude: 0 } });
  point.latitude = 0;
  assert.equal(f.writes[0].spotLocation.latitude, 43.65123);
  assert.equal(f.writes[0].spotLocation.longitude, -79.38123);
});

test('two selected calendar dates charge two days and keep exact cents', async () => {
  const f = fixture({ pricePerDay: 30.01 });
  await f.run({ ...f.valid, startDate: '2090-10-24', endDate: '2090-10-25', expectedTotalPriceCents: 6002 });
  assert.equal(f.writes[0].totalPriceCents, 6002);
  assert.equal(f.writes[0].platformFeeCents, 720);
});

test('changed prices, past dates and unsupported hours cannot reserve a spot', async () => {
  for (const [prices, request, code] of [
    [{ pricePerDay: 6 }, {}, 'failed-precondition'],
    [{ availability: { type: 'recurring_hours' } }, {}, 'failed-precondition'],
    [{ timeZone: 'invalid' }, {}, 'failed-precondition'],
    [{}, { startDate: '2000-01-01', endDate: '2000-01-01' }, 'invalid-argument'],
    [{ pricePerDay: 999999.99 }, { startDate: '2090-01-01', endDate: '2090-01-02' }, 'invalid-argument'],
  ]) {
    const f = fixture(prices);
    await assert.rejects(f.run({ ...f.valid, ...request }), { code });
    assert.equal(f.writes.length, 0);
    assert.equal(f.payments(), 0);
  }
});
