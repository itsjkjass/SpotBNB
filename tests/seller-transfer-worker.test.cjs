const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadBackend } = require('./helpers/backend.cjs');

test('the worker retries cancellations and transfers independently, rescheduling failures', async () => {
  const records = { bookings: ['cancel-fail', 'cancel-ok'], sellerTransfers: ['transfer-fail', 'transfer-ok'] };
  const updates = new Map(); const attempted = [];
  const query = name => ({ where() { return this; }, orderBy() { return this; }, limit() { return this; },
    get: async () => ({ docs: records[name].map(id => ({ id, ref: { id, update: async data => updates.set(id, data) } })) }),
  });
  const { reconcileSellerTransfers } = loadBackend('scheduled/reconcileSellerTransfers.ts', {
    'firebase-functions/v2/scheduler': { onSchedule: (_, fn) => fn },
    'firebase-functions/v2': { logger: { error() {} } },
    '../admin': { db: { collection: query } }, '../config': { stripeSecretKey: {}, PAYMENT_RECHECK_MS: 300000 },
    '../services/sellerEarnings': { reconcileSellerTransfer: async id => { attempted.push(id); if (id.endsWith('fail')) throw new Error('Temporary error'); } },
    '../services/bookingCancellation': { finishBookingCancellation: async ref => { attempted.push(ref.id); if (ref.id.endsWith('fail')) throw new Error('Temporary error'); } },
  });
  await reconcileSellerTransfers();
  assert.deepEqual(attempted.sort(), Object.values(records).flat().sort());
  assert.ok(updates.get('cancel-fail').cancellationReconcileAt > Date.now());
  assert.ok(updates.get('transfer-fail').nextCheckAt > Date.now());
});

test('booking completion cannot overwrite a cancellation or complete a pending refund', async () => {
  const bookings = [{ status: 'confirmed' }, { status: 'cancelled' }, { status: 'confirmed', cancellationRequestedAt: 1 }];
  const query = { where() { return this; }, limit() { return this; }, get: async () => ({ docs: bookings.map(booking => ({ ref: booking })) }) };
  const { completeBookings } = loadBackend('scheduled/completeBookings.ts', {
    'firebase-functions/v2/scheduler': { onSchedule: (_, fn) => fn },
    '../admin': { db: { collection: () => query, runTransaction: fn => fn({
      get: async booking => ({ data: () => booking }), update: (booking, data) => Object.assign(booking, data),
    }) } },
  });
  await completeBookings();
  assert.deepEqual(bookings.map(booking => booking.status), ['completed', 'cancelled', 'confirmed']);
});
