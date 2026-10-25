const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadBackend } = require('./helpers/backend.cjs');
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
const https = { HttpsError, onCall: (_options, handler) => handler };
const { parseAddressQuery, lookupAddress } = loadBackend('services/places.ts', { 'firebase-functions/v2/https': https }, { AbortSignal });
const sessionToken = '1234567890abcdef1234567890abcdef';

test('address requests reject invalid input and path injection before provider access', () => {
  for (const data of [null, {}, { action: 'suggest', input: 'ab', sessionToken },
    { action: 'resolve', placeId: '../secret?key=x', sessionToken },
    { action: 'suggest', input: 'a'.repeat(257), sessionToken },
    { action: 'resolve', placeId: 'valid', sessionToken: 'short' }]) {
    assert.throws(() => parseAddressQuery(data), e => e.code === 'invalid-argument');
  }
  assert.equal(parseAddressQuery({ action: 'suggest', input: '  100 Queen St  ', sessionToken }).input, '100 Queen St');
});

test('suggestions are Canadian, use a session and expose only matching addresses', async () => {
  const result = await lookupAddress({ action: 'suggest', input: '100 Queen', sessionToken }, 'server-key', async (url, request) => {
    assert.equal(url, 'https://places.googleapis.com/v1/places:autocomplete');
    const body = JSON.parse(request.body);
    assert.equal(body.sessionToken, sessionToken); assert.deepEqual(body.includedRegionCodes, ['ca']);
    assert.equal(request.headers['X-Goog-Api-Key'], 'server-key');
    return { ok: true, json: async () => ({ suggestions: [
      { placePrediction: { placeId: 'exact', text: { text: '100 Queen St W, Toronto' } } },
      { queryPrediction: {} }, { placePrediction: { placeId: 'missing-text' } },
    ] }) };
  });
  assert.equal(result.suggestions.length, 1); assert.equal(result.suggestions[0].placeId, 'exact');
});

test('resolving uses selected place ID, preserves exact coordinates and handles unavailable results', async () => {
  const query = { action: 'resolve', placeId: 'selected', sessionToken };
  const data = { id: 'selected', formattedAddress: '100 Queen St W, Toronto', location: { latitude: 43.653439, longitude: -79.38409 } };
  const point = await lookupAddress(query, 'secret', async (url, request) => {
    assert.ok(url.includes('/selected?sessionToken=' + sessionToken));
    assert.equal(request.method, 'GET');
    assert.equal(request.headers['X-Goog-FieldMask'], 'id,formattedAddress,location,attributions');
    return { ok: true, json: async () => data };
  });
  assert.equal(point.coordinate.latitude, 43.653439);
  for (const result of [{ ...data, id: 'different' }, { ...data, location: null }, { ...data, location: { latitude: 100, longitude: 1 } }]) {
    await assert.rejects(lookupAddress(query, 'secret', async () => ({ ok: true, json: async () => result })), e => e.code === 'unavailable');
  }
  await assert.rejects(lookupAddress(query, 'secret', async () => { throw Error('secret provider diagnostic'); }), e => e.code === 'unavailable' && !e.message.includes('secret'));
});

test('guest search is rate limited, records no raw IP/address and never calls provider when capped', async () => {
  const store = new Map(); let calls = 0;
  const { searchAddresses } = loadBackend('callable/addresses.ts', {
    'firebase-functions/v2/https': https, 'node:crypto': require('node:crypto'),
    'firebase-functions/params': { defineSecret: () => ({ value: () => 'private-key' }) },
    '../admin': { db: { doc: path => path, runTransaction: fn => fn({ get: async ref => ({ data: () => store.get(ref) }), set: (ref, data) => store.set(ref, data) }) } },
    '../services/places': { parseAddressQuery, lookupAddress: async () => { calls++; return { suggestions: [] }; } },
  });
  const request = { data: { action: 'suggest', input: '100 Queen St', sessionToken }, rawRequest: { ip: '192.0.2.1' } };
  await searchAddresses(request); assert.equal(calls, 1);
  const saved = JSON.stringify([...store.entries()]);
  assert.ok(!saved.includes('192.0.2.1')); assert.ok(!saved.includes('100 Queen'));
  const personal = [...store.keys()].find(key => !key.endsWith('dailyTotal'));
  store.get(personal).count = 60;
  await assert.rejects(searchAddresses(request), e => e.code === 'resource-exhausted'); assert.equal(calls, 1);
  store.get(personal).count = 0; store.get('addressSearchLimits/dailyTotal').count = 5000;
  await assert.rejects(searchAddresses(request), e => e.code === 'resource-exhausted'); assert.equal(calls, 1);
  await assert.rejects(searchAddresses({ ...request, rawRequest: {} }), e => e.code === 'unavailable');
});
