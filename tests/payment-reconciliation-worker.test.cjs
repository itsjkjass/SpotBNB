const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadBackend } = require('./helpers/backend.cjs');

function fixture(count = 3) {
  const records = Array.from({ length: count }, (_, index) => ({
    id: String(index), state: { status: 'pending_payment', paymentReconcileAt: 0 },
  }));
  const recovered = [];
  const errors = [];
  const query = {
    where() { return this; }, orderBy() { return this; },
    limit(value) { assert.equal(value, 25); return this; },
    get: async () => ({ docs: records.filter((record) => record.state.status === 'pending_payment' &&
      record.state.paymentReconcileAt <= Date.now()).sort((a, b) => a.state.paymentReconcileAt - b.state.paymentReconcileAt)
      .slice(0, 25).map((record) => ({ id: record.id, ref: record })) }),
  };
  const db = {
    collection: () => query,
    runTransaction: async (callback) => callback({
      get: async (record) => ({ data: () => record.state }),
      update: (record, data) => Object.assign(record.state, data),
    }),
  };
  const { reconcileBookingPayments } = loadBackend('scheduled/reconcileBookingPayments.ts', {
    'firebase-functions/v2/scheduler': { onSchedule: (_, handler) => handler },
    'firebase-functions/v2': { logger: { error: (...args) => errors.push(args) } },
    '../admin': { db }, '../config': { stripeSecretKey: {}, PAYMENT_RECHECK_MS: 300000 },
    '../services/bookingPayment': {
      expireBookingPayment: async (_, intent) => intent,
      getOrCreateBookingPayment: async (record) => {
        recovered.push(record.id);
        if (record.id === '0') throw new Error('Stripe unavailable');
        return { id: 'pi_' + record.id, status: record.id === '1' ? 'succeeded' : 'requires_payment_method' };
      },
      syncBookingPaymentStatus: async (record, intent) => {
        if (intent.status === 'succeeded') record.state.status = 'confirmed';
      },
    },
  });
  return { run: reconcileBookingPayments, records, recovered, errors };
}

test('one Stripe failure retains its reservation without preventing other recoveries', async () => {
  const f = fixture();
  await f.run();
  assert.equal(f.records[0].state.status, 'pending_payment');
  assert.ok(f.records[0].state.paymentReconcileAt > Date.now());
  assert.equal(f.records[1].state.status, 'confirmed');
  assert.equal(f.records[2].state.status, 'pending_payment');
  assert.ok(f.records[2].state.paymentReconcileAt > Date.now());
  assert.equal(f.errors.length, 1);
});

test('rescheduling leaves room for the next due page rather than starving later reservations', async () => {
  const f = fixture(30);
  await f.run();
  assert.equal(f.recovered.length, 25);
  await f.run();
  assert.equal(f.recovered.length, 30);
  assert.equal(new Set(f.recovered).size, 30);
});
