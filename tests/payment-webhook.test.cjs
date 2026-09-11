const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Execute the real handler with isolated external boundaries. These tests
// establish event transitions, not Firestore concurrency or live Stripe delivery.
function fixture(initialStatus = 'pending_payment') {
  const booking = { status: initialStatus };
  let event;
  let writes = 0;
  const dependencies = {
    'firebase-functions/v2/https': { onRequest: (_, handler) => handler },
    'firebase-functions/v2': { logger: { error() {} } },
    '../admin': { db: {
      collection: () => ({ doc: (id) => { assert.equal(id, 'booking'); return {}; } }),
      runTransaction: async (callback) => callback({
        get: async () => ({ exists: true, data: () => booking }),
        update: (_, data) => { writes++; Object.assign(booking, data); },
      }),
    } },
    '../config': { stripeSecretKey: {}, stripeWebhookSecret: { value: () => 'test_secret' } },
    '../stripeClient': { getStripeClient: () => ({ webhooks: {
      constructEvent: (_, signature) => {
        if (signature !== 'valid') throw new Error('Invalid signature');
        return event;
      },
    } }) },
  };
  const source = fs.readFileSync(path.join(__dirname, '../functions/src/http/stripeWebhook.ts'), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021,
  } });
  const exports = {};
  vm.runInNewContext(outputText, { exports, require(name) {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  } });
  return {
    booking, writes: () => writes,
    async deliver(type, signature = 'valid') {
      event = { type, data: { object: { id: 'pi_test', metadata: { bookingId: 'booking' } } } };
      let code;
      await exports.stripeWebhook({ headers: { 'stripe-signature': signature }, rawBody: '' }, {
        status(value) { code = value; return this; }, send() {},
      });
      return code;
    },
  };
}

test('decline retains reservation and successful retry confirms the same booking', async () => {
  const f = fixture();
  assert.equal(await f.deliver('payment_intent.payment_failed'), 200);
  assert.equal(f.booking.status, 'pending_payment');
  assert.equal(f.writes(), 0);
  assert.equal(await f.deliver('payment_intent.succeeded'), 200);
  assert.equal(f.booking.status, 'confirmed');
  assert.equal(f.writes(), 1);
});

test('duplicate successful events write confirmation only once', async () => {
  const f = fixture();
  await f.deliver('payment_intent.succeeded');
  await f.deliver('payment_intent.succeeded');
  assert.equal(f.booking.status, 'confirmed');
  assert.equal(f.writes(), 1);
});

test('terminal cancellation releases reservation and duplicate events do not rewrite it', async () => {
  const f = fixture();
  await f.deliver('payment_intent.payment_failed');
  await f.deliver('payment_intent.canceled');
  await f.deliver('payment_intent.canceled');
  assert.equal(f.booking.status, 'cancelled');
  assert.equal(f.writes(), 1);
});

test('late decline cannot undo confirmation', async () => {
  const f = fixture();
  await f.deliver('payment_intent.succeeded');
  await f.deliver('payment_intent.payment_failed');
  assert.equal(f.booking.status, 'confirmed');
  assert.equal(f.writes(), 1);
});

test('late success does not reopen terminal bookings', async () => {
  for (const status of ['cancelled', 'completed']) {
    const f = fixture(status);
    await f.deliver('payment_intent.succeeded');
    assert.equal(f.booking.status, status);
    assert.equal(f.writes(), 0);
  }
});

test('missing or invalid signature rejects event without changing booking', async () => {
  for (const signature of ['', 'invalid']) {
    const f = fixture();
    assert.equal(await f.deliver('payment_intent.succeeded', signature), 400);
    assert.equal(f.booking.status, 'pending_payment');
    assert.equal(f.writes(), 0);
  }
});
