const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadBackend } = require('./helpers/backend.cjs');

function fixture({ failLink = false } = {}) {
  const calls = [];
  const secret = 'test-only-signing-secret';
  const dependencies = {
    'node:crypto': require('node:crypto'),
    'node:buffer': require('node:buffer'),
    'firebase-functions/v2/https': {
      onCall: (_, handler) => handler,
      onRequest: (_, handler) => handler,
      HttpsError: class extends Error { constructor(code, message) { super(message); this.code = code; } },
    },
    '../config': { stripeSecretKey: { value: () => secret } },
    '../admin': { app: { options: { projectId: 'spotbnb-test' } }, db: {
      collection: () => ({ doc: () => ({ get: async () => ({ data: () => ({ stripeConnectAccountId: 'acct_seller' }) }) }) }),
    } },
    '../stripeClient': { getStripeClient: () => ({ accountLinks: { create: async data => {
      calls.push(data);
      if (failLink) throw new Error('Stripe unavailable');
      return { url: 'https://connect.stripe.com/setup/fixture' };
    } } }) },
  };
  const helpers = loadBackend('connectOnboarding.ts', dependencies);
  const callback = loadBackend('http/connectOnboardingCallback.ts', dependencies).connectOnboardingCallback;
  const create = loadBackend('callable/connect.ts', dependencies).createConnectOnboardingLink;
  async function visit(query, method = 'GET') {
    const response = { headers: {}, set(k, v) { this.headers[k] = v; return this; },
      status(n) { this.code = n; return this; }, type(v) { this.contentType = v; return this; },
      send(v) { this.body = v; return this; }, redirect(n, v) { this.code = n; this.location = v; } };
    await callback({ method, query }, response);
    return response;
  }
  return { ...helpers, secret, create, calls, visit };
}

test('authenticated onboarding uses server HTTPS callbacks, ignoring caller redirect URLs', async () => {
  const f = fixture();
  await f.create({ auth: { uid: 'seller' }, data: { returnUrl: 'spotbnb://onboarding-complete', refreshUrl: 'https://untrusted.example' } });
  const link = f.calls[0];
  const refresh = new URL(link.refresh_url);
  assert.equal(new URL(link.return_url).protocol, 'https:');
  assert.equal(refresh.host, 'us-central1-spotbnb-test.cloudfunctions.net');
  assert.equal(f.readRefreshToken(refresh.searchParams.get('token'), f.secret), 'acct_seller');
  await assert.rejects(f.create({ data: {} }), { code: 'unauthenticated' });
});

test('expired Stripe link regenerates for the signed account without extending its session', async () => {
  const f = fixture();
  const token = f.createRefreshToken('acct_seller', f.secret);
  const response = await f.visit({ action: 'refresh', token });
  assert.equal(response.code, 303);
  assert.equal(response.location, 'https://connect.stripe.com/setup/fixture');
  assert.equal(f.calls[0].account, 'acct_seller');
  assert.equal(new URL(f.calls[0].refresh_url).searchParams.get('token'), token);
  assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.equal(response.headers['Referrer-Policy'], 'no-referrer');
});

test('invalid, tampered, expired and wrong-secret refresh tokens cannot create links', async () => {
  const f = fixture();
  const token = f.createRefreshToken('acct_seller', f.secret);
  const tokens = [undefined, ['bad'], 'bad', token.replace('acct_seller', 'acct_other'),
    f.createRefreshToken('acct_seller', 'wrong-secret'),
    f.createRefreshToken('acct_seller', f.secret, Date.now() - 3600001)];
  for (const value of tokens) assert.equal((await f.visit({ action: 'refresh', token: value })).code, 400);
  assert.equal(f.calls.length, 0);
});

test('return callback provides app recovery without claiming onboarding completion', async () => {
  const f = fixture();
  const response = await f.visit({ action: 'return', redirect: 'https://untrusted.example' });
  assert.equal(response.code, 200);
  assert.match(response.body, /spotbnb:\/\/onboarding-complete/);
  assert.match(response.body, /Refresh status/);
  assert.doesNotMatch(response.body, /untrusted.example/);
  assert.equal(f.calls.length, 0);
  assert.equal((await f.visit({ action: 'refresh' }, 'POST')).code, 405);
});

test('Stripe refresh failure offers recovery without leaking API errors', async () => {
  const f = fixture({ failLink: true });
  const response = await f.visit({ action: 'refresh', token: f.createRefreshToken('acct_seller', f.secret) });
  assert.equal(response.code, 502);
  assert.match(response.body, /Start onboarding again/);
  assert.doesNotMatch(response.body, /test-only-signing-secret/);
});

test('racing onboarding requests reuse the account and cannot replace an attached payout destination', async () => {
  const user = { email: 'seller@example.com' };
  const accountCalls = []; const linkAccounts = [];
  const userRef = { get: async () => ({ data: () => ({ ...user }) }) };
  let queue = Promise.resolve();
  const { createConnectOnboardingLink } = loadBackend('callable/connect.ts', {
    'firebase-functions/v2/https': { onCall: (_, handler) => handler, HttpsError: Error },
    '../config': { stripeSecretKey: { value: () => 'fixture-only' } },
    '../connectOnboarding': { createRefreshToken: () => 'fixture-token', onboardingCallbacks: () => ({}) },
    '../admin': { app: { options: { projectId: 'fixture-project' } }, db: {
      collection: () => ({ doc: () => userRef }),
      runTransaction: fn => {
        const run = queue.then(() => fn({ get: ref => ref.get(), update: (_, changes) => Object.assign(user, changes) }));
        queue = run.catch(() => {}); return run;
      },
    } },
    '../stripeClient': { getStripeClient: () => ({
      accounts: { create: async (params, options) => { accountCalls.push({ params, options }); return { id: 'acct_first' }; } },
      accountLinks: { create: async params => { linkAccounts.push(params.account); return { url: 'https://connect.stripe.com/fixture' }; } },
    }) },
  });
  const request = { auth: { uid: 'seller' } };
  await Promise.all([createConnectOnboardingLink(request), createConnectOnboardingLink(request)]);
  assert.equal(user.stripeConnectAccountId, 'acct_first');
  assert.ok(accountCalls.every(call => call.options.idempotencyKey === 'seller-connect-seller'));
  assert.deepEqual(linkAccounts, ['acct_first', 'acct_first']);
  const callsBefore = accountCalls.length;
  user.stripeConnectAccountId = 'acct_existing';
  await createConnectOnboardingLink(request);
  assert.equal(accountCalls.length, callsBefore);
  assert.equal(linkAccounts.at(-1), 'acct_existing');
});
