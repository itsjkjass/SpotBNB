const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadBackend } = require('./helpers/backend.cjs');

function setup(status = 'confirmed') {
  const records = new Map([['bookings/booking', { buyerId: 'buyer', sellerId: 'seller', spotTitle: 'Parking', status }]]);
  const snapshot = ref => ({ data: () => records.get(ref.path) });
  const doc = path => ({ path, get: async () => snapshot({ path }),
    set: async data => records.set(path, { ...data }),
    collection: name => ({ doc: id => doc(`${path}/${name}/${id}`) }) });
  const db = { doc, runTransaction: async callback => {
    const writes = [];
    await callback({ get: async ref => snapshot(ref),
      create: (ref, data) => { assert.ok(!records.has(ref.path)); writes.push(() => records.set(ref.path, { ...data })); },
      set: (ref, data) => writes.push(() => records.set(ref.path, { ...data })),
      update: (ref, data) => writes.push(() => records.set(ref.path, { ...records.get(ref.path), ...data })),
    });
    writes.forEach(write => write());
  } };
  class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const api = loadBackend('callable/messages.ts', {
    '../admin': { db }, 'firebase-functions/v2/https': { onCall: handler => handler, HttpsError },
  });
  const call = (method, uid, data = {}) => api[method]({ auth: uid ? { uid } : undefined, data: { bookingId: 'booking', ...data } });
  const send = (uid = 'buyer', text = 'Hello', messageId = 'message') => call('sendBookingMessage', uid, { text, messageId });
  return { records, call, send };
}
const rejects = (promise, code) => assert.rejects(promise, error => error.code === code);

test('chat requires authentication and booking membership for every action', async () => {
  const { call, records } = setup();
  for (const method of ['sendBookingMessage', 'markBookingMessagesRead', 'setBookingChatBlocked', 'reportBookingMessage']) {
    const data = { messageId: 'message', lastMessageId: 'message', text: 'Hello', blocked: true, reason: 'spam' };
    await rejects(call(method, null, data), 'unauthenticated');
    await rejects(call(method, 'outsider', data), 'permission-denied');
  }
  assert.equal(records.size, 1);
});

test('unpaid and cancelled bookings cannot send; confirmed and completed bookings can', async () => {
  for (const status of ['pending_payment', 'cancelled']) {
    const { send, records } = setup(status);
    await rejects(send(), 'failed-precondition');
    assert.equal(records.size, 1);
  }
  for (const status of ['confirmed', 'completed']) {
    const { send, records } = setup(status);
    await send();
    assert.equal(records.get('bookings/booking/messages/message').text, 'Hello');
  }
});

test('validates content and IDs, stores trimmed text with server sender and time', async () => {
  const { send, call, records } = setup();
  for (const text of ['', '   ', 'x'.repeat(2001), 42]) await rejects(send('buyer', text), 'invalid-argument');
  await rejects(send('buyer', 'Hello', '../bad'), 'invalid-argument');
  await rejects(call('sendBookingMessage', 'buyer', { bookingId: 'bad/path', messageId: 'm', text: 'Hello' }), 'invalid-argument');
  const before = Date.now();
  await call('sendBookingMessage', 'buyer', { messageId: 'message', text: ' Hello ', senderId: 'seller', createdAt: 1 });
  const message = records.get('bookings/booking/messages/message');
  assert.equal(message.text, 'Hello');
  assert.equal(message.senderId, 'buyer');
  assert.ok(message.createdAt >= before);
  assert.equal(records.get('conversations/booking').sellerUnread, 1);
});

test('retries are idempotent and cannot overwrite an existing message', async () => {
  const { send, records } = setup();
  await send();
  await send();
  assert.equal(records.get('conversations/booking').sellerUnread, 1);
  await rejects(send('buyer', 'Changed'), 'already-exists');
  await rejects(send('seller'), 'already-exists');
  assert.equal(records.get('bookings/booking/messages/message').text, 'Hello');
});

test('rate limit applies per sender and rejects without writing', async () => {
  const { send, records } = setup();
  await send();
  await rejects(send('buyer', 'Another', 'm2'), 'resource-exhausted');
  assert.equal(records.has('bookings/booking/messages/m2'), false);
  await send('seller', 'Reply', 'm3');
  assert.equal(records.get('conversations/booking').buyerUnread, 1);
  records.get('conversations/booking').buyerLastSentAt = Date.now() - 1001;
  await send('buyer', 'Later', 'm4');
  assert.equal(records.get('conversations/booking').sellerUnread, 2);
});

test('either participant can block both directions; only the blocker can remove their block', async () => {
  const { call, send, records } = setup();
  await call('setBookingChatBlocked', 'buyer', { blocked: true });
  await call('setBookingChatBlocked', 'seller', { blocked: false });
  assert.equal(records.get('conversations/booking').buyerBlocked, true);
  await rejects(send(), 'permission-denied');
  await rejects(send('seller'), 'permission-denied');
  await call('setBookingChatBlocked', 'buyer', { blocked: false });
  await call('setBookingChatBlocked', 'seller', { blocked: true });
  await rejects(send(), 'permission-denied');
  await call('setBookingChatBlocked', 'seller', { blocked: false });
  await send();
  await rejects(call('setBookingChatBlocked', 'buyer', { blocked: 'false' }), 'invalid-argument');
});

test('read acknowledgement only clears own counter and never clears newer unseen messages', async () => {
  const { send, call, records } = setup();
  await send();
  await send('seller', 'Reply', 'reply');
  await call('markBookingMessagesRead', 'buyer', { lastMessageId: 'message' });
  assert.equal(records.get('conversations/booking').buyerUnread, 1);
  await call('markBookingMessagesRead', 'buyer', { lastMessageId: 'reply' });
  assert.equal(records.get('conversations/booking').buyerUnread, 0);
  assert.equal(records.get('conversations/booking').sellerUnread, 1);
});

test('reports use actual message content, reject own/missing messages and deduplicate', async () => {
  const { call, send, records } = setup();
  await send();
  await rejects(call('reportBookingMessage', 'buyer', { messageId: 'message', reason: 'spam' }), 'invalid-argument');
  await rejects(call('reportBookingMessage', 'seller', { messageId: 'missing', reason: 'spam' }), 'invalid-argument');
  await rejects(call('reportBookingMessage', 'seller', { messageId: 'message', reason: 'bad' }), 'invalid-argument');
  for (let i = 0; i < 2; i++) await call('reportBookingMessage', 'seller', { messageId: 'message', reason: 'spam', text: 'Forged' });
  const reports = [...records.entries()].filter(([path]) => path.startsWith('messageReports/'));
  assert.equal(reports.length, 1);
  assert.equal(reports[0][1].text, 'Hello');
  assert.equal(reports[0][1].reporterId, 'seller');
});
