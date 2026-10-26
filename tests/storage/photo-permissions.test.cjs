const { before, after, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { ref, uploadBytes, getBytes, getDownloadURL, deleteObject } = require('firebase/storage');
const { doc, setDoc } = require('firebase/firestore');
let env;
before(async () => {
  assert.ok(process.env.FIREBASE_STORAGE_EMULATOR_HOST, 'Run with npm run test:rules.');
  env = await initializeTestEnvironment({ projectId: 'demo-spotbnb-rules', firestore: {
    rules: fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8'),
  }, storage: {
    rules: fs.readFileSync(path.resolve(__dirname, '../../storage.rules'), 'utf8'),
  } });
});
beforeEach(async () => { await env.clearStorage(); await env.clearFirestore(); });
after(async () => { if (env) await env.cleanup(); });
const image = new Uint8Array([137, 80, 78, 71]);
const object = (context, name = 'spots/seller/photo.png') => ref(context.storage(), name);
test('deletion prevents old sessions from uploading or changing photos', async () => {
  const context = env.authenticatedContext('seller');
  await assertSucceeds(uploadBytes(object(context), image, { contentType: 'image/png' }));
  await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'accountDeletions/seller'), { status: 'pending' }));
  await assertFails(uploadBytes(object(context, 'spots/seller/late.png'), image, { contentType: 'image/png' }));
  await assertFails(uploadBytes(object(context), image, { contentType: 'image/png' }));
  await assertFails(deleteObject(object(context)));
});
test('owner can upload, replace, obtain a photo URL and delete before creating a listing or payouts', async () => {
  const photo = object(env.authenticatedContext('seller'));
  await assertSucceeds(uploadBytes(photo, image, { contentType: 'image/png' }));
  await assertSucceeds(uploadBytes(photo, image, { contentType: 'image/jpeg' }));
  await assertSucceeds(getDownloadURL(photo));
  await assertSucceeds(getBytes(object(env.unauthenticatedContext())));
  await assertSucceeds(deleteObject(photo));
});
test('other accounts and guests cannot create, replace or delete owner photos', async () => {
  await uploadBytes(object(env.authenticatedContext('seller')), image, { contentType: 'image/png' });
  for (const ctx of [env.authenticatedContext('other'), env.unauthenticatedContext()]) {
    await assertFails(uploadBytes(object(ctx, 'spots/seller/new.png'), image, { contentType: 'image/png' }));
    await assertFails(uploadBytes(object(ctx), image, { contentType: 'image/png' }));
    await assertFails(deleteObject(object(ctx)));
  }
});
test('generic files and photos at the 10 MB boundary are rejected, while smaller images work', async () => {
  const photo = object(env.authenticatedContext('seller'));
  for (const contentType of ['application/octet-stream', 'text/html']) {
    await assertFails(uploadBytes(photo, image, { contentType }));
  }
  await assertFails(uploadBytes(photo, new Uint8Array(10 * 1024 * 1024), { contentType: 'image/png' }));
  await assertSucceeds(uploadBytes(photo, new Uint8Array(10 * 1024 * 1024 - 1), { contentType: 'image/png' }));
});
test('paths outside public listing photos remain inaccessible', async () => {
  const ctx = env.authenticatedContext('seller');
  for (const name of ['users/seller/id.png', 'documentChecks/seller/selfie.png', 'private/file.png']) {
    await assertFails(uploadBytes(object(ctx, name), image, { contentType: 'image/png' }));
    await assertFails(getBytes(object(ctx, name)));
  }
});
