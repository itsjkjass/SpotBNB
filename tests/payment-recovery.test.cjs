const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadBackend } = require('./helpers/backend.cjs');

function fixture({ timeoutOnce = false, failSaveOnce = false } = {}) {
  let booking;
  let remoteIntent;
  let timedOut = false;
  let failedSave = false;
  const calls = [];
  function update(data) {
    if (failSaveOnce && data.stripePaymentIntentId && !failedSave) {
      failedSave = true;
      throw new Error('Database unavailable');
    }
    Object.assign(booking, data);
  }
  const bookingRef = {
    id: 'booking',
    get: async () => ({ exists: Boolean(booking), data: () => booking }),
    update,
    delete: async () => { booking = undefined; },
  };
  const query = { where() { return this; } };
  const db = {
    collection(name) {
      if (name === 'bookings') return { ...query, doc: () => bookingRef };
      return { doc: () => ({ get: async () => ({ exists: true, data: () => name === 'spots'
        ? { ownerId: 'seller', title: 'Parking', address: 'Test', isActive: true, pricePerHour: 5 }
        : { stripeConnectAccountId: 'acct_seller', stripeConnectOnboarded: true } }) }) };
    },
    runTransaction: async (callback) => callback({
      get: async (ref) => ref === bookingRef ? bookingRef.get() : { docs: [] },
      set: (_, data) => { booking = data; },
      update: (_, data) => bookingRef.update(data),
    }),
  };
  const stripe = { paymentIntents: {
    create: async (params, options) => {
      calls.push({ params: JSON.parse(JSON.stringify(params)), key: options?.idempotencyKey });
      if (remoteIntent) {
        assert.equal(options?.idempotencyKey, calls[0].key);
        assert.deepEqual(JSON.parse(JSON.stringify(params)), calls[0].params);
      } else {
        remoteIntent = { id: 'pi_recovered', status: 'requires_payment_method',
          client_secret: 'test_secret', amount: params.amount, currency: params.currency,
          metadata: params.metadata };
      }
      if (timeoutOnce && !timedOut) { timedOut = true; throw new Error('Stripe timeout'); }
      return remoteIntent;
    },
    retrieve: async (id) => { assert.equal(id, remoteIntent.id); return remoteIntent; },
  } };
  class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const dependencies = {
    'firebase-functions/v2/https': { onCall: (_, handler) => handler, HttpsError },
    'firebase-functions/v2': { logger: { error() {}, warn() {} } },
    '../admin': { db }, '../stripeClient': { getStripeClient: () => stripe },
    '../config': { stripeSecretKey: {}, PLATFORM_FEE_PERCENT: 12,
      PAYMENT_RECOVERY_WINDOW_MS: 23 * 3600000, PAYMENT_RECHECK_MS: 300000, PAYMENT_HOLD_MS: 900000 },
  };
  const { createBooking } = loadBackend('callable/createBooking.ts', dependencies);
  return { calls, bookingRef, booking: () => booking, intent: () => remoteIntent,
    recover: () => loadBackend('services/bookingPayment.ts', dependencies).getOrCreateBookingPayment(bookingRef),
    sync: () => loadBackend('services/bookingPayment.ts', dependencies).syncBookingPaymentStatus(bookingRef, remoteIntent),
    create: () => createBooking({ auth: { uid: 'buyer' }, data: {
      spotId: 'spot', startTime: Date.now() + 3600000, endTime: Date.now() + 7200000,
    } }),
  };
}

test('Stripe timeout preserves the reservation and exact request for recovery', async () => {
  const f = fixture({ timeoutOnce: true });
  await assert.rejects(f.create(), /Stripe timeout/);
  assert.equal(f.booking()?.status, 'pending_payment');
  assert.equal(f.booking().paymentIntentRequest.amount, f.calls[0].params.amount);
  assert.equal(f.calls[0].key, 'booking-payment-booking');
});

test('initial setup saves a recoverable payment request before contacting Stripe', async () => {
  const f = fixture();
  const result = await f.create();
  assert.equal(result.bookingId, 'booking');
  assert.equal(f.booking().stripePaymentIntentId, 'pi_recovered');
  assert.equal(f.booking().paymentIntentRequest.transfer_data, undefined);
  assert.equal(f.booking().paymentIntentRequest.transfer_group, 'booking_booking');
  assert.equal(typeof f.booking().paymentReconcileAt, 'number');
  assert.equal(f.booking().paymentExpiresAt - f.booking().createdAt, 900000);
});

test('retry after an ambiguous Stripe timeout uses the exact saved request and key', async () => {
  const f = fixture({ timeoutOnce: true });
  await assert.rejects(f.create(), /Stripe timeout/);
  const recovered = await f.recover();
  assert.equal(recovered.id, 'pi_recovered');
  assert.equal(f.booking().stripePaymentIntentId, recovered.id);
  assert.equal(f.calls.length, 2);
  assert.deepEqual(f.calls[0], f.calls[1]);
});

test('retry after Stripe success and database failure recovers the original intent', async () => {
  const f = fixture({ failSaveOnce: true });
  await assert.rejects(f.create(), /Database unavailable/);
  const recovered = await f.recover();
  assert.equal(recovered.id, 'pi_recovered');
  assert.equal(f.booking().stripePaymentIntentId, 'pi_recovered');
  assert.deepEqual(f.calls[0], f.calls[1]);
});

test('existing intent is retrieved without creating another and can recover a missed success webhook', async () => {
  const f = fixture();
  await f.create();
  f.intent().status = 'succeeded';
  await f.recover();
  await f.sync();
  assert.equal(f.calls.length, 1);
  assert.equal(f.booking().status, 'confirmed');
});

test('recovery stops before idempotency key retention may expire', async () => {
  const f = fixture({ timeoutOnce: true });
  await assert.rejects(f.create());
  f.booking().createdAt = Date.now() - 23 * 3600000;
  await assert.rejects(f.recover(), /manual reconciliation/);
  assert.equal(f.calls.length, 1);
  assert.equal(f.booking().status, 'pending_payment');
});

test('legacy reservation without original request is never recreated', async () => {
  const f = fixture({ timeoutOnce: true });
  await assert.rejects(f.create());
  delete f.booking().paymentIntentRequest;
  await assert.rejects(f.recover(), /manual reconciliation/);
  assert.equal(f.calls.length, 1);
});

test('payment with a mismatched amount cannot update booking state', async () => {
  const f = fixture();
  await f.create();
  f.intent().amount++;
  await assert.rejects(f.recover(), /does not match/);
  assert.equal(f.booking().status, 'pending_payment');
});

test('terminal booking is never reopened by recovery', async () => {
  const f = fixture();
  await f.create();
  f.booking().status = 'cancelled';
  f.intent().status = 'succeeded';
  assert.equal(await f.recover(), null);
  await f.sync();
  assert.equal(f.booking().status, 'cancelled');
});
