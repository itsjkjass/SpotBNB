const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadBackend } = require('./helpers/backend.cjs');

function fixture({ loseResponse = false, failSave = false } = {}) {
  const booking = { sellerId: 'seller', buyerId: 'buyer', paymentFlow: 'separate_v1', status: 'completed',
    endTime: Date.now() - 60000, startTime: Date.now() - 3600000, totalPriceCents: 1000,
    platformFeeCents: 120, currency: 'cad', stripePaymentIntentId: 'pi_booking' };
  const records = new Map([['bookings/booking', booking], ['users/seller', { stripeConnectAccountId: 'acct_seller' }]]);
  const intent = { id: 'pi_booking', amount: 1000, currency: 'cad', status: 'succeeded', latest_charge: 'ch_booking', metadata: { bookingId: 'booking' } };
  const charge = { id: 'ch_booking', payment_intent: 'pi_booking', paid: true, captured: true, amount: 1000, currency: 'cad', amount_refunded: 0, refunded: false, disputed: false };
  const account = { id: 'acct_seller', details_submitted: true, payouts_enabled: true, capabilities: { transfers: 'active' } };
  const transfers = new Map();
  const reversals = new Set();
  const calls = { creates: [], reversals: [], refunds: [], accountReads: 0 };
  let reversalFails = false;
  let lost = false;
  let saveFailed = false;
  const ref = path => ({ path, id: path.split('/').at(-1),
    get: async () => ({ exists: records.has(path), data: () => records.has(path) ? { ...records.get(path) } : undefined }),
    update: async data => {
      if (failSave && data.stripeTransferId && !saveFailed) { saveFailed = true; throw new Error('Firestore unavailable'); }
      Object.assign(records.get(path), data);
    },
  });
  let queue = Promise.resolve();
  const db = { collection: name => ({ doc: id => ref(`${name}/${id}`) }),
    runTransaction(callback) {
      const next = queue.then(() => callback({ get: reference => reference.get(),
        update: (reference, data) => Object.assign(records.get(reference.path), data),
        create: (reference, data) => { assert.ok(!records.has(reference.path)); records.set(reference.path, { ...data }); },
      }));
      queue = next.catch(() => {});
      return next;
    },
  };
  const stripe = {
    accounts: { retrieve: async () => { calls.accountReads++; return account; } },
    paymentIntents: { retrieve: async () => ({ ...intent }), cancel: async () => { intent.status = 'canceled'; return { ...intent }; } },
    charges: { retrieve: async () => ({ ...charge }) },
    refunds: { create: async params => { calls.refunds.push(params); charge.refunded = true; charge.amount_refunded = charge.amount; return { status: 'succeeded' }; } },
    transfers: {
      create: async (params, options) => {
        calls.creates.push({ params, options });
        if (!transfers.has(options.idempotencyKey)) transfers.set(options.idempotencyKey, {
          ...params, id: 'tr_booking', amount_reversed: 0,
        });
        if (loseResponse && !lost) { lost = true; throw new Error('Response lost'); }
        return { ...transfers.get(options.idempotencyKey) };
      },
      retrieve: async id => { const result = [...transfers.values()].find(t => t.id === id); assert.ok(result); return { ...result }; },
      list: async params => ({ has_more: false, data: [...transfers.values()].filter(t => t.transfer_group === params.transfer_group) }),
      createReversal: async (id, params, options) => {
        calls.reversals.push({ id, params, options });
        if (reversals.has(options.idempotencyKey)) return;
        if (reversalFails) throw new Error('Insufficient funds for reversal');
        const transfer = [...transfers.values()].find(t => t.id === id);
        assert.ok(transfer.amount_reversed + params.amount <= transfer.amount);
        transfer.amount_reversed += params.amount;
        reversals.add(options.idempotencyKey);
      },
    },
  };
  class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const dependencies = {
    'firebase-functions/v2/https': { onCall: (_, handler) => handler, HttpsError },
    'firebase-functions/v2': { logger: { error() {} } },
    '../admin': { db }, '../stripeClient': { getStripeClient: () => stripe },
    '../config': { stripeSecretKey: {}, PAYMENT_RECOVERY_WINDOW_MS: 23 * 3600000, PAYMENT_RECHECK_MS: 300000 },
  };
  const { withdrawBookingEarnings } = loadBackend('callable/withdrawEarnings.ts', dependencies);
  const service = loadBackend('services/sellerEarnings.ts', dependencies);
  const { cancelBooking } = loadBackend('callable/cancelBooking.ts', dependencies);
  const { finishBookingCancellation } = loadBackend('services/bookingCancellation.ts', dependencies);
  return { booking, records, charge, intent, account, transfers, calls, stripe,
    entry: () => records.get('sellerTransfers/booking'),
    withdraw: (uid = 'seller', data = { bookingId: 'booking' }) => withdrawBookingEarnings({ auth: uid ? { uid } : undefined, data }),
    cancel: () => cancelBooking({ auth: { uid: 'buyer' }, data: { bookingId: 'booking' } }),
    finishCancellation: () => finishBookingCancellation(ref('bookings/booking')),
    reconcile: () => service.reconcileSellerTransfer('booking'),
    adjustment: () => service.reconcileChargeAdjustment('ch_booking'),
    setReversalFailure: value => { reversalFails = value; },
  };
}

test('only the authenticated seller can request earnings with a valid booking ID', async () => {
  for (const [uid, data, code] of [[null, {}, 'unauthenticated'], ['buyer', { bookingId: 'booking' }, 'permission-denied'],
    ['outsider', { bookingId: 'booking' }, 'permission-denied'], ['seller', null, 'invalid-argument'],
    ['seller', { bookingId: '../booking' }, 'invalid-argument']]) {
    const f = fixture();
    await assert.rejects(f.withdraw(uid, data), { code });
    assert.equal(f.calls.creates.length, 0);
    assert.equal(f.calls.accountReads, 0);
  }
});

test('upcoming, unpaid, cancelled, legacy and cancelling bookings cannot be withdrawn', async () => {
  for (const change of [{ endTime: Date.now() + 60000 }, { status: 'pending_payment' }, { status: 'cancelled' },
    { paymentFlow: undefined }, { cancellationRequestedAt: Date.now() }]) {
    const f = fixture(); Object.assign(f.booking, change);
    await assert.rejects(f.withdraw(), { code: 'failed-precondition' });
    assert.equal(f.entry(), undefined);
    assert.equal(f.calls.creates.length, 0);
  }
});

test('details submitted alone are not enough: Stripe transfers and payouts must be enabled', async () => {
  for (const change of [{ details_submitted: false }, { payouts_enabled: false }, { capabilities: { transfers: 'pending' } }]) {
    const f = fixture(); Object.assign(f.account, change);
    await assert.rejects(f.withdraw(), { code: 'failed-precondition' });
    assert.equal(f.entry(), undefined);
  }
  const f = fixture(); f.records.set('users/seller', {});
  await assert.rejects(f.withdraw(), { code: 'failed-precondition' });
});

test('refunds, disputes and mismatched Stripe payments cannot become withdrawals', async () => {
  for (const [target, change] of [['charge', { amount_refunded: 100 }], ['charge', { disputed: true }],
    ['intent', { amount: 2000 }], ['intent', { metadata: { bookingId: 'other' } }],
    ['intent', { transfer_data: { destination: 'acct_other' } }], ['charge', { captured: false }],
    ['booking', { platformFeeCents: -1 }], ['booking', { paymentDisputed: true }]]) {
    const f = fixture(); Object.assign(f[target], change);
    await assert.rejects(f.withdraw());
    assert.equal(f.entry(), undefined);
    assert.equal(f.calls.creates.length, 0);
  }
});

test('withdrawal sends the exact seller share and keeps a durable request tied to the paid charge', async () => {
  const f = fixture();
  const result = await f.withdraw();
  assert.equal(result.status, 'transferred');
  assert.equal(result.amountCents, 880);
  const { params, options } = f.calls.creates[0];
  assert.equal(params.amount, 880);
  assert.equal(params.source_transaction, 'ch_booking');
  assert.equal(params.destination, 'acct_seller');
  assert.equal(params.transfer_group, 'booking_booking');
  assert.equal(options.idempotencyKey, 'seller-earnings-booking');
  assert.equal(f.entry().stripeTransferId, 'tr_booking');
});

test('concurrent requests and repeated withdrawals produce only one transfer', async () => {
  const f = fixture();
  await Promise.all([f.withdraw(), f.withdraw(), f.withdraw()]);
  await f.withdraw();
  assert.equal(f.transfers.size, 1);
  assert.equal(f.entry().status, 'transferred');
  assert.ok(f.calls.creates.every(call => call.options.idempotencyKey === 'seller-earnings-booking'));
});

test('lost Stripe response and failed ID save both recover without another transfer', async () => {
  for (const options of [{ loseResponse: true }, { failSave: true }]) {
    const f = fixture(options);
    assert.equal((await f.withdraw()).status, 'processing');
    assert.equal(f.transfers.size, 1);
    await f.reconcile();
    assert.equal(f.entry().status, 'transferred');
    assert.equal(f.transfers.size, 1);
    assert.equal(f.calls.creates.length, 2);
  }
});

test('after idempotency expiry, discover an existing transfer but never create a new one', async () => {
  for (const exists of [true, false]) {
    const f = fixture({ loseResponse: true });
    await f.withdraw();
    f.entry().requestedAt = Date.now() - 24 * 3600000;
    if (!exists) f.transfers.clear();
    await f.reconcile();
    assert.equal(f.calls.creates.length, 1);
    assert.equal(f.entry().status, exists ? 'transferred' : 'held');
    await f.withdraw();
    assert.equal(f.calls.creates.length, 1);
  }
});

test('a transfer with the wrong destination is never recorded as paid', async () => {
  const f = fixture({ loseResponse: true }); await f.withdraw();
  [...f.transfers.values()][0].destination = 'acct_other';
  await assert.rejects(f.reconcile(), /does not match/);
  assert.equal(f.entry().status, 'processing');
});

test('full refund, partial refund or dispute recovers the transfer and holds further withdrawal', async () => {
  for (const change of [{ amount_refunded: 1000, refunded: true }, { amount_refunded: 200 }, { disputed: true }]) {
    const f = fixture(); await f.withdraw(); Object.assign(f.charge, change);
    await f.adjustment(); await f.adjustment(); await f.withdraw();
    assert.equal(f.entry().status, 'reversed');
    assert.equal(f.calls.reversals.length, 1);
    assert.equal(f.calls.reversals[0].params.amount, 880);
    assert.equal(f.transfers.size, 1);
  }
});

test('failed reversal stays queued and a later retry completes it', async () => {
  const f = fixture(); await f.withdraw(); f.charge.amount_refunded = 1000;
  f.setReversalFailure(true);
  await assert.rejects(f.adjustment(), /Insufficient funds/);
  assert.equal(f.entry().status, 'reversal_pending');
  f.setReversalFailure(false); await f.reconcile();
  assert.equal(f.entry().status, 'reversed');
  assert.equal(f.calls.reversals[0].options.idempotencyKey, f.calls.reversals[1].options.idempotencyKey);
});

test('an external manual reversal is not paid out a second time', async () => {
  const f = fixture(); await f.withdraw(); [...f.transfers.values()][0].amount_reversed = 880;
  await f.reconcile(); await f.withdraw();
  assert.equal(f.entry().status, 'held');
  assert.equal(f.transfers.size, 1);
});

test('new-flow cancellation refunds the platform charge without destination-charge flags', async () => {
  const f = fixture(); f.booking.status = 'confirmed'; f.booking.startTime = Date.now() + 3600000;
  await f.cancel();
  assert.equal(f.booking.status, 'cancelled');
  assert.ok(f.booking.cancellationRequestedAt);
  assert.equal(f.calls.refunds.length, 1);
  assert.equal(f.calls.refunds[0].reverse_transfer, undefined);
  assert.equal(f.calls.refunds[0].refund_application_fee, undefined);
});

test('a cancellation recorded before start can recover after the app closes and parking ends', async () => {
  const f = fixture(); f.booking.status = 'confirmed'; f.booking.cancellationRequestedAt = Date.now() - 7200000;
  await assert.rejects(f.withdraw(), { code: 'failed-precondition' });
  await f.finishCancellation();
  assert.equal(f.booking.status, 'cancelled');
  assert.equal(f.calls.refunds.length, 1);
});

test('recovering a full refund after a lost save does not issue a second refund', async () => {
  const f = fixture(); f.booking.status = 'confirmed'; f.booking.cancellationRequestedAt = Date.now() - 7200000;
  f.charge.refunded = true; f.charge.amount_refunded = 1000;
  await f.finishCancellation();
  assert.equal(f.calls.refunds.length, 0);
  assert.equal(f.booking.status, 'cancelled');
});

test('a payout account changed during validation cannot receive a withdrawal', async () => {
  const f = fixture();
  f.stripe.accounts.retrieve = async () => {
    f.records.get('users/seller').stripeConnectAccountId = 'acct_changed'; return f.account;
  };
  await assert.rejects(f.withdraw(), { code: 'failed-precondition' });
  assert.equal(f.entry(), undefined);
  assert.equal(f.transfers.size, 0);
});

test('a refund racing a transfer is recovered immediately after its ID is saved', async () => {
  const f = fixture(); const create = f.stripe.transfers.create;
  f.stripe.transfers.create = async (...args) => {
    const result = await create(...args); f.charge.refunded = true; f.charge.amount_refunded = 1000; return result;
  };
  assert.equal((await f.withdraw()).status, 'reversed');
  assert.equal([...f.transfers.values()][0].amount_reversed, 880);
});

test('parallel refund workers reverse at most the original seller transfer', async () => {
  const f = fixture(); await f.withdraw(); f.charge.refunded = true; f.charge.amount_refunded = 1000;
  await Promise.all([f.adjustment(), f.adjustment(), f.reconcile()]);
  assert.equal(f.entry().status, 'reversed');
  assert.equal([...f.transfers.values()][0].amount_reversed, 880);
});

test('refund notification before the payment ID save cannot leave a paid booking available', async () => {
  const f = fixture(); delete f.booking.stripePaymentIntentId;
  f.booking.status = 'pending_payment'; f.charge.refunded = true; f.charge.amount_refunded = 1000;
  await f.adjustment();
  assert.equal(f.booking.status, 'cancelled');
  assert.equal(f.booking.stripePaymentIntentId, 'pi_booking');
  assert.equal(f.booking.refundedCents, 1000);
});

test('pending cancellation that races a successful payment refunds it instead of releasing an unpaid slot', async () => {
  const f = fixture(); f.booking.status = 'confirmed'; f.booking.cancellationRequestedAt = Date.now() - 7200000;
  f.intent.status = 'processing';
  f.stripe.paymentIntents.cancel = async () => { f.intent.status = 'succeeded'; throw new Error('Payment already succeeded'); };
  await f.finishCancellation();
  assert.equal(f.booking.status, 'cancelled');
  assert.equal(f.calls.refunds.length, 1);
});
