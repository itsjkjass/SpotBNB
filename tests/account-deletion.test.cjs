const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadBackend } = require('./helpers/backend.cjs');

function fixture() {
  const queued = [];
  class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const { requestAccountDeletion } = loadBackend('callable/deleteAccount.ts', {
    'firebase-functions/v2/https': { onCall: (_, handler) => handler, HttpsError },
    '../config': { stripeSecretKey: {} },
    '../services/accountDeletion': { queueAccountDeletion: async uid => queued.push(uid) },
  });
  return { queued, run: requestAccountDeletion };
}
test('deletion requires authentication, explicit confirmation and a recent password check', async () => {
  for (const request of [
    { data: { confirmation: 'DELETE' } },
    { auth: { uid: 'owner', token: { auth_time: Date.now() / 1000 } }, data: {} },
    ...[undefined, '123', NaN, Date.now() / 1000 - 301, Date.now() / 1000 + 60].map(auth_time => ({ auth: { uid: 'owner', token: { auth_time } }, data: { confirmation: 'DELETE' } })),
  ]) {
    const f = fixture(); await assert.rejects(f.run(request)); assert.deepEqual(f.queued, []);
  }
});
test('deletion always targets the verified caller, never a supplied account ID', async () => {
  const f = fixture();
  const result = await f.run({ auth: { uid: 'owner', token: { auth_time: Date.now() / 1000 } }, data: { confirmation: 'DELETE', uid: 'victim' } });
  assert.equal(result.accepted, true); assert.deepEqual(f.queued, ['owner']);
});
