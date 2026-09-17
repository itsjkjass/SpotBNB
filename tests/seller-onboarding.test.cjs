const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mount, flush } = require('./helpers/react-hooks.cjs');

function fixture({ statusFails = false, linkFails = false } = {}) {
  let statusCalls = 0;
  let refreshes = 0;
  const refreshProfile = async () => { refreshes++; };
  const view = mount('src/screens/Profile/SellerOnboardingScreen.tsx', 'default', {
    'react-native': { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner',
      StyleSheet: { create: value => value }, Linking: { openURL: async () => {
        if (linkFails) throw new Error('Cannot open link');
      } } },
    '../../services/stripeConnect': {
      getSellerConnectStatus: async () => { statusCalls++; if (statusFails) throw new Error('Offline');
        return { onboarded: false, payoutsEnabled: false }; },
      getSellerOnboardingLink: async () => 'https://example.com/onboarding',
    },
    '../../hooks/useAuth': { useAuth: () => ({ refreshProfile }) },
    '../../constants/theme': { colors: {}, spacing: {}, radius: {} },
  });
  const nodes = tree => tree && typeof tree === 'object' ? [tree, ...tree.children.flatMap(nodes)] : [];
  return { view, nodes, calls: () => statusCalls, refreshes: () => refreshes };
}

test('onboarding status loads once across ordinary rerenders', async () => {
  const f = fixture();
  f.view.render();
  await flush();
  for (let i = 0; i < 4; i++) { f.view.render(); await flush(); }
  assert.equal(f.calls(), 1);
  assert.equal(f.refreshes(), 1);
});

test('failed onboarding status request displays a retry error and releases buttons', async () => {
  const f = fixture({ statusFails: true });
  f.view.render();
  await flush();
  const nodes = f.nodes(f.view.render());
  assert.ok(nodes.some(n => n.props.accessibilityRole === 'alert'));
  assert.ok(nodes.filter(n => n.type === 'Button').every(n => n.props.disabled === false));
  assert.equal(nodes.filter(n => n.type === 'Spinner').length, 0);
});

test('failed onboarding link opening displays a retry error', async () => {
  const f = fixture({ linkFails: true });
  f.view.render();
  await flush();
  const button = f.nodes(f.view.render()).find(n => n.type === 'Button');
  await button.props.onPress();
  const nodes = f.nodes(f.view.render());
  assert.ok(nodes.some(n => n.props.accessibilityRole === 'alert'));
  assert.ok(nodes.filter(n => n.type === 'Button').every(n => !n.props.disabled));
});
