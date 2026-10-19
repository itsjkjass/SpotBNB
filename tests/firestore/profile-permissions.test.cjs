const { before, after, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, setDoc, updateDoc, getDoc, getDocs, query, where, orderBy, limit, collection, deleteDoc, deleteField, serverTimestamp } = require('firebase/firestore');

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

test('sellers can save and publish before payout setup, while private drafts remain private', async () => {
  await setDoc(ownRef(), profile());
  const db = env.authenticatedContext('seller').firestore();
  const spot = doc(db, 'spots/draft');
  await assertSucceeds(setDoc(spot, { ownerId: 'seller', isActive: false, title: 'Draft' }));
  await assertSucceeds(updateDoc(spot, { title: 'Updated draft' }));
  await assertSucceeds(getDoc(spot));
  await assertSucceeds(getDocs(query(collection(db, 'spots'), where('ownerId', '==', 'seller'))));
  await assertSucceeds(updateDoc(spot, { isActive: true }));
  await assertSucceeds(updateDoc(spot, { isActive: false }));
  await assertFails(updateDoc(spot, { ownerId: 'other' }));
  await assertSucceeds(setDoc(doc(db, 'spots/public'), { ownerId: 'seller', isActive: true }));
  for (const context of [env.unauthenticatedContext(), env.authenticatedContext('other')]) {
    await assertFails(getDoc(doc(context.firestore(), 'spots/draft')));
    await assertFails(updateDoc(doc(context.firestore(), 'spots/draft'), { title: 'Stolen' }));
  }
});

test('withdrawal records are seller-private and cannot be forged by app clients', async () => {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'bookings/earned'), { sellerId: 'seller', buyerId: 'buyer' });
    await setDoc(doc(db, 'bookings/unused'), { sellerId: 'seller', buyerId: 'buyer' });
    await setDoc(doc(db, 'sellerTransfers/earned'), { sellerId: 'seller', status: 'transferred', amountCents: 880 });
  });
  const seller = env.authenticatedContext('seller').firestore();
  await assertSucceeds(getDoc(doc(seller, 'sellerTransfers/earned')));
  await assertSucceeds(getDoc(doc(seller, 'sellerTransfers/unused')));
  for (const context of [env.authenticatedContext('seller'), env.authenticatedContext('buyer'), env.authenticatedContext('outsider'), env.unauthenticatedContext()]) {
    const db = context.firestore();
    await assertFails(setDoc(doc(db, 'sellerTransfers/unused'), { sellerId: 'seller', status: 'transferred' }));
    await assertFails(updateDoc(doc(db, 'sellerTransfers/earned'), { amountCents: 99000 }));
    await assertFails(deleteDoc(doc(db, 'sellerTransfers/earned')));
  }
  for (const context of [env.authenticatedContext('buyer'), env.authenticatedContext('outsider'), env.unauthenticatedContext()]) {
    await assertFails(getDoc(doc(context.firestore(), 'sellerTransfers/earned')));
    await assertFails(getDoc(doc(context.firestore(), 'sellerTransfers/unused')));
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

test('real booking, earnings and inbox queries are scoped to the signed-in participant', async () => {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    for (const id of ['one', 'two']) {
      await setDoc(doc(db, `bookings/${id}`), { buyerId: 'buyer', sellerId: 'seller', startTime: 1, status: 'confirmed' });
      await setDoc(doc(db, `conversations/${id}`), { buyerId: 'buyer', sellerId: 'seller', updatedAt: 1 });
    }
    await setDoc(doc(db, 'bookings/private'), { buyerId: 'other', sellerId: 'outsider', startTime: 1 });
  });
  for (const uid of ['buyer', 'seller']) {
    const db = env.authenticatedContext(uid).firestore();
    for (const [name, sort] of [['bookings', 'startTime'], ['conversations', 'updatedAt']]) {
      const results = await assertSucceeds(getDocs(query(collection(db, name), where(`${uid}Id`, '==', uid), orderBy(sort, 'desc'), limit(20))));
      assert.equal(results.size, 2);
      await assertFails(getDocs(query(collection(db, name), where(`${uid}Id`, '==', 'other'), orderBy(sort, 'desc'))));
    }
    await assertSucceeds(getDoc(doc(db, 'bookings/one')));
    await assertFails(getDoc(doc(db, 'bookings/private')));
    await assertFails(setDoc(doc(db, 'bookings/forged'), { buyerId: uid, sellerId: 'seller', status: 'confirmed' }));
    await assertFails(updateDoc(doc(db, 'bookings/one'), { status: 'completed' }));
    await assertFails(deleteDoc(doc(db, 'bookings/one')));
  }
});

test('Explore and Host sorted queries work with uploaded photo URLs', async () => {
  const owner = env.authenticatedContext('seller').firestore();
  for (const [id, active] of [['published', true], ['draft', false]]) {
    await assertSucceeds(setDoc(doc(owner, `spots/${id}`), { ownerId: 'seller', isActive: active, createdAt: serverTimestamp(),
      title: 'Parking', pricePerDay: 25, currency: 'cad', timeZone: 'America/Toronto', photoUrls: ['https://example.invalid/photo.png'],
      location: { latitude: 43.65, longitude: -79.38 } }));
  }
  const host = await assertSucceeds(getDocs(query(collection(owner, 'spots'), where('ownerId', '==', 'seller'), orderBy('createdAt', 'desc'))));
  assert.equal(host.size, 2);
  const guest = env.unauthenticatedContext().firestore();
  const explore = await assertSucceeds(getDocs(query(collection(guest, 'spots'), where('isActive', '==', true), orderBy('createdAt', 'desc'))));
  assert.deepEqual(explore.docs.map(d => d.id), ['published']);
  await assertFails(getDocs(query(collection(guest, 'spots'), where('ownerId', '==', 'seller'), orderBy('createdAt', 'desc'))));
});

test('own push token updates work but private profiles cannot be read or edited by others', async () => {
  await assertFails(updateDoc(ownRef(), { expoPushToken: 'synthetic-token' }));
  await assertSucceeds(setDoc(ownRef(), profile()));
  await assertSucceeds(updateDoc(ownRef(), { expoPushToken: 'replacement-token' }));
  for (const ctx of [env.authenticatedContext('other'), env.unauthenticatedContext()]) {
    const ref = doc(ctx.firestore(), 'users/seller');
    await assertFails(getDoc(ref));
    await assertFails(updateDoc(ref, { expoPushToken: 'stolen-token' }));
    await assertFails(getDocs(collection(ctx.firestore(), 'users')));
  }
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
