const { before, after, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, setDoc, updateDoc, getDoc, deleteDoc, deleteField, serverTimestamp } = require('firebase/firestore');

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
