const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadBackend } = require('./helpers/backend.cjs');
const dependencies = { 'node:buffer': require('node:buffer'), 'node:crypto': require('node:crypto') };
const { evaluateReview, validateSubmission, DOCUMENTS, CONSENT_VERSION } = loadBackend('lib/documentReview.ts', dependencies);
const now = Date.parse('2026-10-16T12:00:00Z');
function response(role) {
  return { documents: DOCUMENTS[role].map(kind => ({ kind, readable: true, expectedType: true, nameMatchesId: true,
    appearsUnaltered: true, expiryDate: '2027-12-31', hasNoExpiry: false, issueDate: '2026-10-01' })),
    uncertain: false, addressesMatch: true, addressProofsDistinct: true, selfieMatchesId: true, vehicleMatches: true };
}
function submission(role = 'seller') {
  return { role, consentVersion: CONSENT_VERSION, images: DOCUMENTS[role].map((kind, i) => {
    const bytes = Buffer.alloc(200, i); bytes[0] = 255; bytes[1] = 216; bytes[2] = 255;
    return { kind, mimeType: 'image/jpeg', data: bytes.toString('base64') };
  }) };
}

test('requires consent, correct role, all unique documents and bounded actual image bytes', () => {
  assert.equal(validateSubmission(submission()).images.length, 4);
  assert.equal(validateSubmission(submission('buyer')).images.length, 3);
  for (const mutate of [
    data => { data.role = 'admin'; }, data => { delete data.consentVersion; }, data => { data.images.pop(); },
    data => { data.images[1].kind = 'id'; }, data => { data.images[1].data = data.images[0].data; },
    data => { data.images[0].mimeType = 'text/plain'; }, data => { data.images[0].data = Buffer.alloc(200).toString('base64'); },
    data => { data.images[0].data = 'a'.repeat(2_800_001); }, data => { data.images[0].data = 'not base64'; },
  ]) { const data = submission(); mutate(data); assert.throws(() => validateSubmission(data)); }
});

test('clear role-specific results pass and expire no later than supporting documents', () => {
  const seller = evaluateReview('seller', response('seller'), now);
  assert.equal(seller.status, 'checked');
  assert.equal(seller.expiresAt, Date.parse('2026-12-30T00:00:00Z'));
  const buyer = response('buyer'); buyer.documents.find(d => d.kind === 'insurance').expiryDate = '2026-11-01';
  assert.equal(evaluateReview('buyer', buyer, now).expiresAt, Date.parse('2026-11-02T00:00:00Z'));
});

test('missing, malformed, uncertain or forged model decisions fail closed', () => {
  for (const value of [null, {}, { approved: true }, { documents: [] }, { documents: 'approved' }]) {
    assert.equal(evaluateReview('seller', value, now).status, 'needs_resubmission');
  }
  for (const mutate of [
    value => { delete value.uncertain; }, value => { value.uncertain = true; }, value => { value.documents.pop(); },
    value => { value.documents[0].readable = false; }, value => { value.documents[0].expectedType = false; },
    value => { value.documents[0].appearsUnaltered = false; }, value => { value.documents[2].nameMatchesId = false; },
    value => { value.documents[1].kind = 'id'; }, value => { value.documents[1] = null; },
    value => { value.addressesMatch = false; }, value => { value.addressProofsDistinct = false; },
    value => { value.selfieMatchesId = false; }, value => { value.documents[0].readable = 'true'; },
  ]) { const value = response('seller'); mutate(value); const outcome = evaluateReview('seller', value, now); assert.equal(outcome.status, 'needs_resubmission'); assert.equal(outcome.expiresAt, null); }
  const buyer = response('buyer'); buyer.vehicleMatches = false;
  assert.ok(evaluateReview('buyer', buyer, now).reasons.includes('vehicle_mismatch'));
});

test('expired, impossible, missing dates and stale/future address proofs cannot pass', () => {
  for (const expiry of ['2026-10-15', '2027-02-30', 'tomorrow', null, undefined]) {
    const value = response('seller'); value.documents[0].expiryDate = expiry;
    assert.equal(evaluateReview('seller', value, now).status, 'needs_resubmission');
  }
  for (const issue of ['2026-07-01', '2026-10-17', '2026-09-31', null]) {
    const value = response('seller'); value.documents[2].issueDate = issue;
    assert.ok(evaluateReview('seller', value, now).reasons.includes('old_address_proof'));
  }
  const nonExpiringId = response('buyer'); nonExpiringId.documents[0].expiryDate = null; nonExpiringId.documents[0].hasNoExpiry = true;
  assert.equal(evaluateReview('buyer', nonExpiringId, now).status, 'checked');
  nonExpiringId.documents[1].expiryDate = null; nonExpiringId.documents[1].hasNoExpiry = true;
  assert.equal(evaluateReview('buyer', nonExpiringId, now).status, 'needs_resubmission');
});

function setup({ enabled = true, review = async () => response('seller') } = {}) {
  const records = new Map(); let calls = 0;
  const doc = path => ({ path });
  const db = { doc, runTransaction: async callback => {
    const writes = [];
    await callback({ get: async ref => ({ data: () => records.get(ref.path) }),
      set: (ref, value, options) => writes.push(() => records.set(ref.path, { ...(options?.merge ? records.get(ref.path) : {}), ...value })),
      update: (ref, value) => writes.push(() => records.set(ref.path, { ...records.get(ref.path), ...value })),
    });
    writes.forEach(write => write());
  } };
  class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const api = loadBackend('callable/verification.ts', { ...dependencies, '../admin': { db },
    'firebase-functions/v2/https': { HttpsError, onCall: (...args) => args.at(-1) },
    'firebase-functions/params': { defineBoolean: () => ({ value: () => enabled }), defineSecret: () => ({ value: () => 'synthetic-key' }) },
    '../lib/geminiReview': { reviewDocuments: async (...args) => { calls++; return review(...args); } },
  });
  return { records, api, calls: () => calls, request: { auth: { uid: 'owner' }, data: submission() } };
}
const rejects = (promise, code) => assert.rejects(promise, error => error.code === code);

test('backend blocks unauthenticated, disabled and invalid submissions before contacting Gemini', async () => {
  const s = setup();
  await rejects(s.api.submitDocumentCheck({ data: submission() }), 'unauthenticated');
  await rejects(s.api.submitDocumentCheck({ auth: { uid: 'owner' }, data: {} }), 'invalid-argument');
  const disabled = setup({ enabled: false }); await rejects(disabled.api.submitDocumentCheck(disabled.request), 'failed-precondition');
  assert.equal(s.calls(), 0); assert.equal(disabled.calls(), 0);
});

test('stores only the outcome and consent metadata; never images or provider output', async () => {
  const clear = response('seller');
  clear.documents.forEach(item => { item.issueDate = new Date().toISOString().slice(0, 10); item.expiryDate = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10); });
  const s = setup({ review: async () => ({ ...clear, extractedName: 'DO NOT STORE THIS' }) });
  await s.api.submitDocumentCheck(s.request);
  const stored = JSON.stringify([...s.records]);
  assert.equal(stored.includes(s.request.data.images[0].data), false);
  assert.equal(stored.includes('DO NOT STORE THIS'), false);
  assert.equal(s.records.get('documentChecks/owner/roles/seller').consentVersion, CONSENT_VERSION);
  assert.ok(s.records.has('documentBadges/owner'));
  assert.equal(s.records.get('documentBadges/owner').seller.status, 'checked');
  await rejects(s.api.submitDocumentCheck(s.request), 'resource-exhausted');
  assert.equal(s.calls(), 1);
});

test('provider failures remove processing state and do not approve a badge or expose error data', async () => {
  const s = setup({ review: async () => { throw Error('SECRET RAW PROVIDER ERROR'); } });
  await rejects(s.api.submitDocumentCheck(s.request), 'unavailable');
  assert.equal(s.records.get('documentChecks/owner/roles/seller').status, 'error');
  assert.equal(s.records.get('documentBadges/owner').seller.status, 'not_checked');
  assert.equal(JSON.stringify([...s.records]).includes('SECRET'), false);
});

test('removal prevents an in-flight review restoring a badge and preserves rate limits', async () => {
  let resolve; const promise = new Promise(r => { resolve = r; });
  const s = setup({ review: () => promise });
  const pending = s.api.submitDocumentCheck(s.request);
  await new Promise(r => setImmediate(r));
  await rejects(s.api.submitDocumentCheck(s.request), 'already-exists');
  await s.api.removeDocumentCheck({ auth: { uid: 'owner' }, data: { role: 'seller' } });
  resolve(response('seller')); await pending;
  assert.equal(s.records.get('documentBadges/owner').seller.status, 'not_checked');
  assert.equal(s.records.get('documentChecks/owner/roles/seller').status, 'not_checked');
  assert.equal(s.records.get('documentChecks/owner/roles/seller').attempts, 1);
  await rejects(s.api.submitDocumentCheck(s.request), 'resource-exhausted');
});

test('daily submission cap survives retries and resets on a new UTC day', async () => {
  const s = setup();
  const key = 'documentChecks/owner/roles/seller';
  s.records.set(key, { status: 'error', day: new Date().toISOString().slice(0, 10), attempts: 5, lastSubmittedAt: Date.now() - 61_000 });
  await rejects(s.api.submitDocumentCheck(s.request), 'resource-exhausted');
  s.records.get(key).day = '2000-01-01';
  await s.api.submitDocumentCheck(s.request);
  assert.equal(s.records.get(key).attempts, 1);
});
