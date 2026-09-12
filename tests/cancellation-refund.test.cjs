const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function fixture({ intentStatus = 'succeeded', failUpdateOnce = false, refundError = false } = {}) {
  const booking = { buyerId: 'buyer', sellerId: 'seller', status: 'confirmed',
    startTime: Date.now() + 3600000, stripePaymentIntentId: 'pi_test' };
  const refundCalls = [];
  const cancellations = [];
  const cachedRefunds = new Map();
  let refundCount = 0;
  let failUpdate = failUpdateOnce;
  class HttpsError extends Error {
    constructor(code, message) { super(message); this.code = code; }
  }
  const dependencies = {
    'firebase-functions/v2/https': { onCall: (_, handler) => handler, HttpsError },
    '../config': { stripeSecretKey: {} },
    '../admin': { db: { collection: () => ({ doc: () => ({
      get: async () => ({ exists: true, data: () => ({ ...booking }) }),
      update: async (data) => {
        if (failUpdate) { failUpdate = false; throw new Error('Firestore unavailable'); }
        Object.assign(booking, data);
      },
    }) }) } },
    '../stripeClient': { getStripeClient: () => ({
      paymentIntents: {
        retrieve: async () => ({ status: intentStatus }),
        cancel: async (id) => cancellations.push(id),
      },
      refunds: { create: async (params, options) => {
        refundCalls.push({ params, options });
        if (refundError) throw new Error('Refund rejected');
        // Simulate Stripe's retained idempotent result. Without the same key,
        // refunding the full charge again fails rather than completing recovery.
        const key = options?.idempotencyKey;
        if (key && cachedRefunds.has(key)) return cachedRefunds.get(key);
        if (refundCount) throw new Error('Charge already refunded');
        refundCount++;
        const result = { id: 're_test', status: 'succeeded' };
        if (key) cachedRefunds.set(key, result);
        return result;
      } },
    }) },
  };
  const source = fs.readFileSync(path.join(__dirname, '../functions/src/callable/cancelBooking.ts'), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021,
  } });
  const exports = {};
  vm.runInNewContext(outputText, { exports, Date, require(name) {
    assert.ok(name in dependencies, `Unexpected dependency ${name}`);
    return dependencies[name];
  } });
  return { booking, refundCalls, cancellations, refundCount: () => refundCount,
    cancel: (uid = 'buyer') => exports.cancelBooking({
      auth: uid ? { uid } : undefined, data: { bookingId: 'booking' },
    }),
  };
}

test('paid cancellation reverses destination transfer and application fee', async () => {
  const f = fixture();
  await f.cancel();
  assert.equal(f.booking.status, 'cancelled');
  assert.equal(f.refundCalls.length, 1);
  assert.equal(f.refundCalls[0].params.payment_intent, 'pi_test');
  assert.equal(f.refundCalls[0].params.reverse_transfer, true);
  assert.equal(f.refundCalls[0].params.refund_application_fee, true);
  assert.equal(f.refundCalls[0].options.idempotencyKey, 'cancel-booking-booking');
});

test('retry after Firestore failure reuses refund and finishes cancellation', async () => {
  const f = fixture({ failUpdateOnce: true });
  await assert.rejects(f.cancel(), /Firestore unavailable/);
  assert.equal(f.booking.status, 'confirmed');
  await f.cancel('seller');
  assert.equal(f.booking.status, 'cancelled');
  assert.equal(f.refundCount(), 1);
  assert.equal(f.refundCalls.length, 2);
  assert.equal(f.refundCalls[0].options.idempotencyKey, f.refundCalls[1].options.idempotencyKey);
});

test('Stripe refund error leaves booking status unchanged', async () => {
  const f = fixture({ refundError: true });
  await assert.rejects(f.cancel(), /Refund rejected/);
  assert.equal(f.booking.status, 'confirmed');
});

test('unpaid intent is cancelled without requesting a refund', async () => {
  const f = fixture({ intentStatus: 'requires_payment_method' });
  await f.cancel();
  assert.equal(f.refundCalls.length, 0);
  assert.deepEqual(f.cancellations, ['pi_test']);
  assert.equal(f.booking.status, 'cancelled');
});

test('already cancelled intent requires no additional Stripe operation', async () => {
  const f = fixture({ intentStatus: 'canceled' });
  await f.cancel();
  assert.equal(f.refundCalls.length, 0);
  assert.equal(f.cancellations.length, 0);
  assert.equal(f.booking.status, 'cancelled');
});

test('unauthenticated users and unrelated users cannot refund', async () => {
  for (const [uid, code] of [[null, 'unauthenticated'], ['stranger', 'permission-denied']]) {
    const f = fixture();
    await assert.rejects(f.cancel(uid), (error) => error.code === code);
    assert.equal(f.refundCalls.length, 0);
    assert.equal(f.booking.status, 'confirmed');
  }
});
