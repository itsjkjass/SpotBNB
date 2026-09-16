const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadBackend } = require('./helpers/backend.cjs');

function fixture({ status = 'requires_payment_method', expired = true,
  cancelFails = false, retrieveFails = false, racedStatus, bookingStatus = 'pending_payment' } = {}) {
  const booking = { status: bookingStatus, stripePaymentIntentId: 'pi_test', totalPriceCents: 500,
    currency: 'cad', paymentExpiresAt: Date.now() + (expired ? -60000 : 60000) };
  const intent = { id: 'pi_test', status, metadata: { bookingId: 'booking' }, amount: 500, currency: 'cad' };
  const calls = [];
  const ref = { id: 'booking', get: async () => ({ data: () => booking }) };
  const db = { runTransaction: async (callback) => callback({
    get: () => ref.get(), update: (_, data) => Object.assign(booking, data),
  }) };
  const service = loadBackend('services/bookingPayment.ts', {
    '../admin': { db }, '../config': { PAYMENT_RECOVERY_WINDOW_MS: 23 * 3600000 },
    '../stripeClient': { getStripeClient: () => ({ paymentIntents: {
      cancel: async (id, params) => {
        calls.push({ id, params });
        if (cancelFails) throw new Error('Cancellation unavailable');
        return { ...intent, status: 'canceled' };
      },
      retrieve: async () => {
        if (retrieveFails) throw new Error('Network unavailable');
        return { ...intent, status: racedStatus || intent.status };
      },
    } }) },
  });
  return { booking, intent, calls,
    run: async () => {
      const result = await service.expireBookingPayment(ref, intent);
      await service.syncBookingPaymentStatus(ref, result);
    },
  };
}

test('expired unpaid payment is cancelled at Stripe before releasing its reservation', async () => {
  const f = fixture();
  await f.run();
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].id, 'pi_test');
  assert.equal(f.calls[0].params.cancellation_reason, 'abandoned');
  assert.equal(f.booking.status, 'cancelled');
});

test('unexpired and legacy reservations are not expired', async () => {
  const fresh = fixture({ expired: false });
  const legacy = fixture();
  delete legacy.booking.paymentExpiresAt;
  for (const f of [fresh, legacy]) {
    await f.run();
    assert.equal(f.calls.length, 0);
    assert.equal(f.booking.status, 'pending_payment');
  }
});

test('processing and authorized payments remain reserved even after the hold deadline', async () => {
  for (const status of ['processing', 'requires_capture']) {
    const f = fixture({ status });
    await f.run();
    assert.equal(f.calls.length, 0);
    assert.equal(f.booking.status, 'pending_payment');
  }
});

test('paid reservation is confirmed rather than expired', async () => {
  const f = fixture({ status: 'succeeded' });
  await f.run();
  assert.equal(f.calls.length, 0);
  assert.equal(f.booking.status, 'confirmed');
});

test('payment succeeding during cancellation is recovered and confirmed', async () => {
  const f = fixture({ cancelFails: true, racedStatus: 'succeeded' });
  await f.run();
  assert.equal(f.booking.status, 'confirmed');
});

test('lost cancellation response is recovered from Stripe before releasing the slot', async () => {
  const f = fixture({ cancelFails: true, racedStatus: 'canceled' });
  await f.run();
  assert.equal(f.booking.status, 'cancelled');
});

test('unknown cancellation outcome retains the reservation', async () => {
  const f = fixture({ cancelFails: true, retrieveFails: true });
  await assert.rejects(f.run(), /Network unavailable/);
  assert.equal(f.booking.status, 'pending_payment');
});

test('unsuccessful cancellation cannot release a still-payable intent', async () => {
  const f = fixture({ cancelFails: true });
  await f.run();
  assert.equal(f.booking.status, 'pending_payment');
});

test('already confirmed booking is not cancelled by an old worker snapshot', async () => {
  const f = fixture({ bookingStatus: 'confirmed' });
  await f.run();
  assert.equal(f.calls.length, 0);
  assert.equal(f.booking.status, 'confirmed');
});
