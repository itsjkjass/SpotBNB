const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mount, flush } = require('./helpers/react-hooks.cjs');
async function register(status, profile = { uid: 'owner' }) {
  const calls = [];
  const view = mount('src/hooks/usePushNotifications.ts', 'usePushNotifications', {
    '@react-navigation/native': { useNavigation: () => ({ navigate() {} }) },
    'expo-device': { isDevice: true }, 'react-native': { Platform: { OS: 'android' } },
    './useAuth': { useAuth: () => ({ user: { uid: 'owner' }, profile }) }, '../services/firebase': { db: {} },
    'firebase/firestore': { doc: (_, name, uid) => `${name}/${uid}`, updateDoc: async target => calls.push(target) },
    'expo-notifications': {
      setNotificationHandler() {}, addNotificationResponseReceivedListener: () => ({ remove() {} }),
      getLastNotificationResponseAsync: async () => null, AndroidImportance: { DEFAULT: 3 },
      setNotificationChannelAsync: async () => calls.push('channel'),
      getPermissionsAsync: async () => ({ status: 'undetermined' }),
      requestPermissionsAsync: async () => { assert.equal(calls[0], 'channel'); calls.push('permission'); return { status }; },
      getExpoPushTokenAsync: async () => { calls.push('token'); return { data: 'test-token' }; },
    },
  });
  view.render(); await flush(); view.unmount(); return calls;
}
test('Android creates a channel before asking permission and saves token to own profile', async () => {
  assert.deepEqual(await register('granted'), ['channel', 'permission', 'token', 'users/owner']);
});
test('declined notification permission skips token registration without blocking the app', async () => {
  assert.deepEqual(await register('denied'), ['channel', 'permission']);
});
test('notification registration waits for the matching signup profile', async () => {
  assert.deepEqual(await register('granted', null), []);
  assert.deepEqual(await register('granted', { uid: 'previous-account' }), []);
});
