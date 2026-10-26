const { before, beforeEach, after, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, setDoc, getDoc, updateDoc } = require('firebase/firestore');
const functionsRequire = require('node:module').createRequire(path.resolve(__dirname, '../../functions/package.json'));
const { initializeApp, deleteApp } = functionsRequire('firebase-admin/app');
const adminFirestore = functionsRequire('firebase-admin/firestore');
const { loadBackend } = require('../helpers/backend.cjs');
let env, app, db;
before(async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'A local emulator is required.');
  env = await initializeTestEnvironment({ projectId: 'demo-spotbnb-rules', firestore: { rules: fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8') } });
  app = initializeApp({ projectId: 'demo-spotbnb-rules' }, 'account-deletion-tests');
  db = adminFirestore.getFirestore(app);
});
beforeEach(async () => env.clearFirestore());
after(async () => { await env?.cleanup(); await deleteApp(app); });

function fixture() {
  // Firestore checks native Promise identity. Normalize promises returned by
  // the isolated TypeScript test VM while still using real emulator transactions.
  const testDb = { doc: name => db.doc(name), collection: name => db.collection(name),
    recursiveDelete: ref => db.recursiveDelete(ref), runTransaction: fn => db.runTransaction(async tx => await fn(tx)) };
  const accounts = new Map([['owner', {}], ['other', {}]]);
  const files = new Set(['spots/owner/photo.jpg', 'spots/owner-other/photo.jpg']);
  let storageFails = false, deleteAuthFails = false;
  const balance = { available: [], pending: [] };
  const auth = {
    updateUser: async (uid, value) => {
      if (!accounts.has(uid)) throw Object.assign(new Error('Missing'), { code: 'auth/user-not-found' });
      accounts.set(uid, { ...accounts.get(uid), ...value });
    },
    revokeRefreshTokens: async () => {},
    deleteUser: async uid => { if (deleteAuthFails) throw Error('Temporary auth outage'); accounts.delete(uid); },
  };
  const dependencies = {
    'node:crypto': require('node:crypto'),
    'firebase-admin/firestore': adminFirestore,
    'firebase-admin/auth': { getAuth: () => auth },
    'firebase-admin/storage': { getStorage: () => ({ bucket: () => ({ deleteFiles: async ({ prefix }) => {
      if (storageFails) throw Error('Temporary storage outage');
      for (const file of files) if (file.startsWith(prefix)) files.delete(file);
    } }) }) },
    'firebase-functions/v2/https': { HttpsError: class extends Error { constructor(code, message) { super(message); this.code = code; } } },
    '../admin': { app, db: testDb }, '../stripeClient': { getStripeClient: () => ({ balance: { retrieve: async () => balance } }) },
  };
  return { ...loadBackend('services/accountDeletion.ts', dependencies), ...loadBackend('services/accountAccess.ts', dependencies),
    accounts, files, balance, storageFailure: value => { storageFails = value; }, authFailure: value => { deleteAuthFails = value; } };
}
async function seed() {
  const data = {
    'users/owner': { email: 'owner@example.com', displayName: 'Owner', expoPushToken: 'ExponentPushToken[example]' },
    'users/other': { email: 'other@example.com' },
    'spots/space': { ownerId: 'owner', isActive: true, address: 'Private address', photoUrls: ['photo'] },
    'spots/other': { ownerId: 'other', isActive: true },
    'bookings/sold': { sellerId: 'owner', buyerId: 'other', status: 'completed', spotTitle: 'Home', spotAddress: 'Private address', spotLocation: { latitude: 1, longitude: 2 }, stripePaymentIntentId: 'pi_example', paymentIntentRequest: { metadata: { sellerId: 'owner' } } },
    'bookings/bought': { sellerId: 'other', buyerId: 'owner', status: 'cancelled', spotTitle: 'Other space', totalPriceCents: 500 },
    'bookings/sold/messages/message': { senderId: 'owner', text: 'Personal message' },
    'bookings/sold/messages/other': { senderId: 'other', text: 'Shared conversation' },
    'conversations/sold': { buyerId: 'other', sellerId: 'owner', lastMessage: 'Personal message' },
    'documentChecks/owner/roles/seller': { status: 'checked' },
    'documentBadges/owner': { seller: { status: 'checked' } },
    'reviews/written': { authorId: 'owner', targetId: 'other' },
    'reviews/received': { authorId: 'other', targetId: 'owner' },
    'messageReports/report': { senderId: 'owner', reporterId: 'other', text: 'Personal message' },
    'sellerTransfers/sold': { sellerId: 'owner', status: 'transferred', stripeTransferId: 'tr_example', request: { metadata: { sellerId: 'owner' }, destination: 'acct_example' } },
  };
  for (const [name, value] of Object.entries(data)) await db.doc(name).set(value);
}
test('full deletion removes personal records and files, redacts receipts, and preserves another account', async () => {
  const f = fixture(); await seed(); await f.queueAccountDeletion('owner');
  assert.equal((await db.doc('users/owner').get()).data().expoPushToken, undefined);
  await f.processAccountDeletion('owner');
  for (const name of ['users/owner', 'spots/space', 'conversations/sold', 'bookings/sold/messages/message', 'bookings/sold/messages/other',
    'documentChecks/owner/roles/seller', 'documentBadges/owner', 'reviews/written', 'reviews/received', 'messageReports/report']) {
    assert.equal((await db.doc(name).get()).exists, false, name);
  }
  assert.equal(f.accounts.has('owner'), false); assert.equal(f.accounts.has('other'), true);
  assert.deepEqual([...f.files], ['spots/owner-other/photo.jpg']);
  const booking = (await db.doc('bookings/sold').get()).data();
  const transfer = (await db.doc('sellerTransfers/sold').get()).data();
  assert.match(booking.sellerId, /^deleted_/); assert.equal(booking.buyerId, 'other');
  assert.equal(booking.spotAddress, ''); assert.equal(booking.spotLocation, undefined);
  assert.equal(booking.stripePaymentIntentId, 'pi_example'); assert.equal(booking.paymentIntentRequest, undefined);
  assert.equal(transfer.sellerId, booking.sellerId); assert.equal(transfer.request.metadata.sellerId, booking.sellerId);
  assert.equal(transfer.stripeTransferId, 'tr_example'); assert.ok(booking.expiresAt.toMillis() > Date.now());
  assert.equal((await db.doc('bookings/bought').get()).data().spotTitle, 'Other space');
  assert.equal((await db.doc('spots/other').get()).exists, true);
  const job = (await db.doc('accountDeletions/owner').get()).data();
  assert.equal(job.status, 'completed'); assert.equal(job.replacementId, undefined);
  await f.processAccountDeletion('owner'); // Delivered twice is harmless.
});
test('cleanup resumes after a storage failure and after authentication deletion fails', async () => {
  const f = fixture(); await seed(); await f.queueAccountDeletion('owner');
  f.storageFailure(true); await assert.rejects(f.processAccountDeletion('owner'));
  assert.equal(f.accounts.get('owner').disabled, true);
  assert.equal((await db.doc('accountDeletions/owner').get()).data().leaseUntil, 0);
  f.storageFailure(false); f.authFailure(true); await assert.rejects(f.processAccountDeletion('owner'));
  f.authFailure(false); await f.processAccountDeletion('owner');
  assert.equal((await db.doc('accountDeletions/owner').get()).data().status, 'completed');
  assert.equal(f.accounts.has('owner'), false);
});
test('active bookings, unsettled earnings, withdrawals and Stripe balances prevent destructive cleanup', async () => {
  const f = fixture(); await seed();
  for (const status of ['pending_payment', 'confirmed']) {
    await db.doc('bookings/sold').update({ status });
    await assert.rejects(f.queueAccountDeletion('owner'), { code: 'failed-precondition' });
  }
  await db.doc('bookings/sold').update({ status: 'completed', paymentFlow: 'separate_v1', totalPriceCents: 1000 });
  await db.doc('sellerTransfers/sold').delete();
  await assert.rejects(f.queueAccountDeletion('owner'), { code: 'failed-precondition' });
  await db.doc('sellerTransfers/sold').set({ sellerId: 'owner', status: 'processing' });
  await assert.rejects(f.queueAccountDeletion('owner'), { code: 'failed-precondition' });
  await db.doc('sellerTransfers/sold').update({ status: 'transferred' });
  await db.doc('users/owner').update({ stripeConnectAccountId: 'acct_example' });
  f.balance.pending.push({ amount: 500, currency: 'cad' });
  await assert.rejects(f.queueAccountDeletion('owner'), { code: 'failed-precondition' });
  assert.equal((await db.doc('accountDeletions/owner').get()).exists, false);
  assert.equal((await db.doc('spots/space').get()).exists, true);
  assert.equal(f.accounts.get('owner').disabled, undefined);
});
test('concurrent requests queue once and the transaction barrier blocks further server activity', async () => {
  const f = fixture(); await seed();
  await Promise.all([f.queueAccountDeletion('owner'), f.queueAccountDeletion('owner')]);
  await assert.rejects(db.runTransaction(async tx => await f.assertAccountActive('owner', tx)), { code: 'failed-precondition' });
  await f.assertAccountActive('other');
  await Promise.all([f.processAccountDeletion('owner'), f.processAccountDeletion('owner')]);
  assert.equal((await db.doc('accountDeletions/owner').get()).data().status, 'completed');
});
test('old authenticated sessions cannot read private records or recreate data during and after deletion', async () => {
  await seed(); const f = fixture(); await f.queueAccountDeletion('owner');
  const old = env.authenticatedContext('owner').firestore();
  for (const name of ['users/owner', 'bookings/sold', 'documentChecks/owner/roles/seller']) await assertFails(getDoc(doc(old, name)));
  await assertFails(setDoc(doc(old, 'spots/new'), { ownerId: 'owner', isActive: true }));
  await assertFails(updateDoc(doc(old, 'users/owner'), { displayName: 'Restored' }));
  await assertFails(setDoc(doc(old, 'accountDeletions/owner'), { status: 'cancelled' }));
  await f.processAccountDeletion('owner');
  await assertFails(setDoc(doc(old, 'users/owner'), { email: 'owner@example.com' }));
  const other = env.authenticatedContext('other').firestore();
  await assertSucceeds(getDoc(doc(other, 'bookings/sold')));
  await assertFails(setDoc(doc(other, 'reviews/new'), { bookingId: 'sold', spotId: 'space', authorId: 'other', targetId: 'owner', rating: 5, comment: 'late' }));
});
