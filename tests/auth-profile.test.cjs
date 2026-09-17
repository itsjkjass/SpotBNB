const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mount, flush } = require('./helpers/react-hooks.cjs');

function fixture() {
  let notify;
  let unsubscribed = false;
  const requests = [];
  const view = mount('src/hooks/useAuth.tsx', 'AuthProvider', {
    '../services/auth': {
      subscribeToAuthState: callback => { notify = callback; return () => { unsubscribed = true; }; },
      getUserProfile: uid => new Promise((resolve, reject) => requests.push({ uid, resolve, reject })),
    },
  });
  view.render();
  return { requests, emit: user => notify(user), view,
    state: () => view.render().props.value, unsubscribed: () => unsubscribed };
}

test('failed initial profile read exits authentication loading', async () => {
  const f = fixture();
  f.emit({ uid: 'a' });
  f.requests[0].reject(new Error('offline'));
  await flush();
  assert.equal(f.state().loading, false);
  assert.equal(f.state().profile, null);
});

test('late profile cannot restore a signed-out user', async () => {
  const f = fixture();
  f.emit({ uid: 'a' });
  f.emit(null);
  f.requests[0].resolve({ uid: 'a' });
  await flush();
  assert.equal(f.state().user, null);
  assert.equal(f.state().profile, null);
  assert.equal(f.state().loading, false);
});

test('switching accounts clears profile and ignores the older account response', async () => {
  const f = fixture();
  f.emit({ uid: 'a' });
  f.emit({ uid: 'b' });
  f.requests[0].resolve({ uid: 'a' });
  await flush();
  assert.equal(f.state().loading, true);
  assert.equal(f.state().profile, null);
  f.requests[1].resolve({ uid: 'b' });
  await flush();
  assert.equal(f.state().profile.uid, 'b');
});

test('refresh callback remains stable after profile changes and concurrent refresh keeps newest result', async () => {
  const f = fixture();
  f.emit({ uid: 'a' });
  const refresh = f.state().refreshProfile;
  f.requests[0].resolve({ uid: 'a' });
  await flush();
  assert.equal(f.state().refreshProfile, refresh);
  const first = refresh();
  const second = refresh();
  f.requests[2].resolve({ uid: 'a', displayName: 'new' });
  await second;
  f.requests[1].resolve({ uid: 'a', displayName: 'old' });
  await first;
  assert.equal(f.state().profile.displayName, 'new');
  assert.equal(f.state().refreshProfile, refresh);
});

test('manual profile refresh can retry after initial read failure', async () => {
  const f = fixture();
  f.emit({ uid: 'a' });
  f.requests[0].reject(new Error('offline'));
  await flush();
  const retry = f.state().refreshProfile();
  f.requests[1].resolve({ uid: 'a' });
  await retry;
  assert.equal(f.state().profile.uid, 'a');
});

test('unmount unsubscribes and ignores outstanding profile requests', async () => {
  const f = fixture();
  f.emit({ uid: 'a' });
  f.view.unmount();
  f.requests[0].resolve({ uid: 'a' });
  await flush();
  assert.equal(f.unsubscribed(), true);
  assert.equal(f.state().profile, null);
});
