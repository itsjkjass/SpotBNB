const { before, after, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, setDoc, updateDoc, getDoc, getDocs, query, where, collection, deleteDoc, deleteField, serverTimestamp } = require('firebase/firestore');

let env;
before(async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Run with npm run test:rules; a local emulator is required.');
  env = await initializeTestEnvironment({ projectId: 'demo-spotbnb-rules', firestore: {
    rules: fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8'),
  } });
});
beforeEach(async () => env.clearFirestore());
after(async () => { if (env) await env.cleanup(); });
const profile = () => ({ uid: 'seller', email: 'seller@example.com', displayName: 'Seller',
  roles: ['buyer'], stripeConnectOnboarded: false, createdAt: serverTimestamp() });
const ownRef = () => doc(env.authenticatedContext('seller').firestore(), 'users/seller');

test('only the backend can publish badges and check results remain owner-only', async () => {
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'documentChecks/seller/roles/seller'), { status: 'checked', reasons: [], expiresAt: 123 });
    await setDoc(doc(context.firestore(), 'documentBadges/seller'), { seller: { status: 'checked', expiresAt: 123 } });
  });
  const owner = env.authenticatedContext('seller').firestore();
  await assertSucceeds(getDoc(doc(owner, 'documentChecks/seller/roles/seller')));
  await assertSucceeds(getDoc(doc(owner, 'documentChecks/seller/roles/buyer')));
  for (const context of [env.authenticatedContext('seller'), env.authenticatedContext('other'), env.unauthenticatedContext()]) {
    const db = context.firestore();
    await assertSucceeds(getDoc(doc(db, 'documentBadges/seller')));
    await assertFails(getDocs(collection(db, 'documentBadges')));
    await assertFails(setDoc(doc(db, 'documentBadges/seller'), { seller: { status: 'checked', expiresAt: 999 } }));
    await assertFails(setDoc(doc(db, 'documentChecks/seller/roles/seller'), { status: 'checked' }));
    await assertFails(deleteDoc(doc(db, 'documentChecks/seller/roles/seller')));
  }
  for (const context of [env.authenticatedContext('other'), env.unauthenticatedContext()]) {
    await assertFails(getDoc(doc(context.firestore(), 'documentChecks/seller/roles/seller')));
  }
});

test('booking messages and conversations are private, server-written records', async () => {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'bookings/chat'), { buyerId: 'buyer', sellerId: 'seller', status: 'confirmed' });
    await setDoc(doc(db, 'bookings/empty'), { buyerId: 'buyer', sellerId: 'seller', status: 'confirmed' });
    await setDoc(doc(db, 'bookings/chat/messages/message'), { senderId: 'buyer', text: 'Hello', createdAt: 1 });
    await setDoc(doc(db, 'conversations/chat'), { buyerId: 'buyer', sellerId: 'seller', lastMessage: 'Hello', updatedAt: 1 });
    await setDoc(doc(db, 'messageReports/report'), { text: 'Private report' });
  });
  for (const uid of ['buyer', 'seller']) {
    const db = env.authenticatedContext(uid).firestore();
    await assertSucceeds(getDoc(doc(db, 'bookings/chat/messages/message')));
    await assertSucceeds(getDocs(collection(db, 'bookings/chat/messages')));
    await assertSucceeds(getDoc(doc(db, 'conversations/chat')));
    await assertSucceeds(getDoc(doc(db, 'conversations/empty')));
    const inbox = await assertSucceeds(getDocs(query(collection(db, 'conversations'), where(`${uid}Id`, '==', uid))));
    assert.equal(inbox.size, 1);
    await assertFails(getDocs(collection(db, 'conversations')));
    await assertFails(setDoc(doc(db, 'bookings/chat/messages/forged'), { senderId: uid, text: 'Forged' }));
    await assertFails(updateDoc(doc(db, 'bookings/chat/messages/message'), { text: 'Changed' }));
    await assertFails(deleteDoc(doc(db, 'bookings/chat/messages/message')));
    await assertFails(updateDoc(doc(db, 'conversations/chat'), { buyerBlocked: false }));
    await assertFails(getDoc(doc(db, 'messageReports/report')));
    await assertFails(setDoc(doc(db, 'messageReports/forged'), { text: 'Forged' }));
  }
  for (const context of [env.authenticatedContext('outsider'), env.unauthenticatedContext()]) {
    const db = context.firestore();
    await assertFails(getDoc(doc(db, 'bookings/chat/messages/message')));
    await assertFails(getDocs(collection(db, 'bookings/chat/messages')));
    await assertFails(getDoc(doc(db, 'conversations/chat')));
    await assertFails(getDoc(doc(db, 'conversations/empty')));
    await assertFails(getDocs(collection(db, 'conversations')));
  }
});

test('sellers can save private listings before onboarding, but cannot publish them', async () => {
  await setDoc(ownRef(), profile());
  const db = env.authenticatedContext('seller').firestore();
  const spot = doc(db, 'spots/draft');
  await assertSucceeds(setDoc(spot, { ownerId: 'seller', isActive: false, title: 'Draft' }));
  await assertSucceeds(updateDoc(spot, { title: 'Updated draft' }));
  await assertSucceeds(getDoc(spot));
  await assertSucceeds(getDocs(query(collection(db, 'spots'), where('ownerId', '==', 'seller'))));
  await assertFails(updateDoc(spot, { isActive: true }));
  await assertFails(updateDoc(spot, { ownerId: 'other' }));
  await assertFails(setDoc(doc(db, 'spots/public'), { ownerId: 'seller', isActive: true }));
  for (const context of [env.unauthenticatedContext(), env.authenticatedContext('other')]) {
    await assertFails(getDoc(doc(context.firestore(), 'spots/draft')));
    await assertFails(updateDoc(doc(context.firestore(), 'spots/draft'), { title: 'Stolen' }));
  }
});

test('guests can search active listings while private listings remain owner-only', async () => {
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'users/seller'), { ...profile(), stripeConnectOnboarded: true });
  });
  const seller = env.authenticatedContext('seller').firestore();
  const guest = env.unauthenticatedContext().firestore();
  await assertSucceeds(setDoc(doc(seller, 'spots/public'), { ownerId: 'seller', isActive: true }));
  await setDoc(doc(seller, 'spots/private'), { ownerId: 'seller', isActive: false });
  const results = await assertSucceeds(getDocs(query(collection(guest, 'spots'), where('isActive', '==', true))));
  assert.deepEqual(results.docs.map(d => d.id), ['public']);
  await assertFails(getDocs(collection(guest, 'spots')));
  await assertSucceeds(getDoc(doc(guest, 'spots/public')));
  await assertFails(setDoc(doc(guest, 'spots/guest'), { ownerId: 'guest', isActive: false }));
  await assertSucceeds(updateDoc(doc(seller, 'spots/public'), { isActive: false }));
  await assertFails(getDoc(doc(guest, 'spots/public')));
  await assertSucceeds(deleteDoc(doc(seller, 'spots/private')));
});

test('normal signup and profile edits remain allowed', async () => {
  await assertSucceeds(setDoc(ownRef(), profile()));
  await assertSucceeds(updateDoc(ownRef(), { displayName: 'New name', phone: '123' }));
  await assertSucceeds(getDoc(ownRef()));
});

test('creation cannot claim onboarding or supply a Stripe account', async () => {
  for (const fields of [
    { stripeConnectOnboarded: true }, { stripeConnectOnboarded: 'false' },
    { stripeConnectOnboarded: null }, { stripeConnectAccountId: 'acct_attacker' },
    { stripeConnectAccountId: null }, { stripeConnectAccountId: '' },
  ]) await assertFails(setDoc(ownRef(), { ...profile(), ...fields }));
});

test('creation without Stripe fields is allowed for older clients', async () => {
  const data = profile();
  delete data.stripeConnectOnboarded;
  await assertSucceeds(setDoc(ownRef(), data));
  await assertFails(updateDoc(ownRef(), { stripeConnectAccountId: 'acct_attacker' }));
  await assertFails(updateDoc(ownRef(), { stripeConnectOnboarded: true }));
});

test('unauthenticated users and other users cannot create profiles for the owner', async () => {
  for (const context of [env.unauthenticatedContext(), env.authenticatedContext('other')]) {
    await assertFails(setDoc(doc(context.firestore(), 'users/seller'), profile()));
  }
});

test('backend-owned Stripe fields survive permitted edits and cannot be replaced or removed', async () => {
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'users/seller'), {
      ...profile(), stripeConnectAccountId: 'acct_server', stripeConnectOnboarded: true,
    });
  });
  await assertSucceeds(updateDoc(ownRef(), { displayName: 'Updated' }));
  for (const changes of [{ stripeConnectAccountId: 'acct_other' }, { stripeConnectOnboarded: false },
    { stripeConnectAccountId: deleteField() }, { stripeConnectOnboarded: deleteField() }]) {
    await assertFails(updateDoc(ownRef(), changes));
  }
  await assertFails(setDoc(ownRef(), profile()));
  await assertFails(deleteDoc(ownRef()));
  const data = (await getDoc(ownRef())).data();
  assert.equal(data.stripeConnectAccountId, 'acct_server');
  assert.equal(data.stripeConnectOnboarded, true);
});
