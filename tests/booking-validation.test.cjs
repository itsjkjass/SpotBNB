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
        ? { ownerId: 'seller', title: 'Parking', address: 'Test', isActive: true, pricePerHour: 5, ...prices }
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
  const startTime = Date.now() + 3600000;
  return { writes, reads: () => reads, payments: () => payments,
    valid: { spotId: 'spot', startTime, endTime: startTime + 3600000 },
    run: data => createBooking({ auth: { uid: 'buyer' }, data }) };
}

test('malformed request bodies fail before database access', async () => {
  for (const data of [null, undefined, [], 'request', 12, {}]) {
    const f = fixture();
    await assert.rejects(f.run(data), { code: 'invalid-argument' });
    assert.equal(f.reads(), 0);
  }
});

test('invalid IDs and non-numeric or invalid dates fail before database access', async () => {
  const badValues = [
    ...[{}, 12, ' ', 'spots/other', '.', '..'].map(spotId => ({ spotId })),
    ...['123', NaN, Infinity, -Infinity, 1.5, 8640000000000001].flatMap(value => [{ startTime: value }, { endTime: value }]),
    { startTime: 1, endTime: 2 },
  ];
  for (const override of badValues) {
    const f = fixture();
    await assert.rejects(f.run({ ...f.valid, ...override }), { code: 'invalid-argument' });
    assert.equal(f.reads(), 0);
  }
});

test('invalid stored rates cannot create a reservation or payment', async () => {
  for (const value of [undefined, null, '5', NaN, Infinity, 0, -5]) {
    for (const prices of [{ pricePerHour: value }, ...(value == null ? [] : [{ pricePerDay: value }])]) {
      const f = fixture(prices);
      await assert.rejects(f.run(f.valid), { code: 'failed-precondition' });
      assert.equal(f.writes.length, 0);
      assert.equal(f.payments(), 0);
    }
  }
});

test('unchargeable and oversized totals cannot reserve a spot', async () => {
  for (const pricePerHour of [0.01, 1000000, Number.MAX_VALUE]) {
    const f = fixture({ pricePerHour });
    await assert.rejects(f.run(f.valid), { code: 'invalid-argument' });
    assert.equal(f.writes.length, 0);
    assert.equal(f.payments(), 0);
  }
});

test('valid hourly and rounded daily bookings preserve pricing', async () => {
  const hourly = fixture();
  await hourly.run(hourly.valid);
  assert.equal(hourly.writes[0].totalPriceCents, 500);
  assert.equal(hourly.writes[0].paymentFlow, 'separate_v1');
  assert.equal(hourly.writes[0].paymentIntentRequest.transfer_data, undefined);
  assert.equal(hourly.writes[0].paymentIntentRequest.application_fee_amount, undefined);
  assert.equal(hourly.writes[0].paymentIntentRequest.transfer_group, 'booking_booking');
  const daily = fixture({ pricePerDay: 30 });
  await daily.run({ ...daily.valid, endTime: daily.valid.startTime + 25 * 3600000 });
  assert.equal(daily.writes[0].totalPriceCents, 6000);
  assert.equal(daily.writes[0].platformFeeCents, 720);
});
