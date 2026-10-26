const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mount, flush } = require('./helpers/react-hooks.cjs');

function fixture({ reject = false } = {}) {
  const alerts = [], calls = [];
  const view = mount('src/screens/Profile/DeleteAccountScreen.tsx', 'default', {
    'react-native': { Alert: { alert: (...args) => alerts.push(args) }, KeyboardAvoidingView: 'Keyboard', Platform: { OS: 'android' }, ScrollView: 'Scroll', Text: 'Text', TextInput: 'Input', View: 'View', StyleSheet: { create: value => value } },
    '../../hooks/useAuth': { useAuth: () => ({ user: { email: 'owner@example.com' } }) },
    '../../services/accountDeletion': { requestAccountDeletion: async password => { calls.push(['delete', password]); if (reject) throw Error('Finish active bookings first.'); }, accountActionError: e => e.message, resetAccountPassword: async email => calls.push(['reset', email]) },
    '../../services/auth': { logOut: async () => calls.push(['logout']) },
    '../../components/ui': { Action: 'Action', ui: {} },
    '../../constants/theme': { colors: {}, radius: {}, spacing: {} },
    '../../constants/publicLinks': { SUPPORT_EMAIL: 'support@example.com', PRIVACY_POLICY_URL: 'https://example.com/privacy' },
    '../../utils/openPublicLink': { openPublicLink: async () => {} },
  });
  const nodes = value => Array.isArray(value) ? value.flatMap(nodes) : value && typeof value === 'object' ? [value, ...nodes(value.children)] : [];
  const render = () => nodes(view.render());
  const action = label => render().find(n => n.type === 'Action' && n.props.label === label);
  return { view, alerts, calls, render, action };
}
test('deletion requires a password and a separate destructive confirmation; cancellation sends nothing', async () => {
  const f = fixture(); assert.equal(f.action('Delete my account').props.disabled, true);
  f.render().find(n => n.type === 'Input').props.onChangeText('example-password');
  assert.equal(f.action('Delete my account').props.disabled, false);
  f.action('Delete my account').props.onPress();
  assert.equal(f.alerts[0][2][0].style, 'cancel');
  assert.equal(f.calls.length, 0);
  f.alerts[0][2][1].onPress(); await flush();
  assert.deepEqual(f.calls, [['delete', 'example-password'], ['logout']]);
  assert.equal(f.action('Delete my account'), undefined);
});
test('a blocked deletion preserves the session and explains how to resolve it', async () => {
  const f = fixture({ reject: true });
  f.render().find(n => n.type === 'Input').props.onChangeText('password');
  f.action('Delete my account').props.onPress(); f.alerts[0][2][1].onPress(); await flush();
  assert.deepEqual(f.calls, [['delete', 'password']]);
  const error = f.render().find(n => n.props.accessibilityRole === 'alert');
  assert.ok(error.children.includes('Finish active bookings first.'));
  assert.equal(f.action('Delete my account').props.busy, false);
});
test('password recovery uses the signed-in email without requesting deletion', async () => {
  const f = fixture(); f.action('Reset my password').props.onPress(); await flush();
  assert.deepEqual(f.calls, [['reset', 'owner@example.com']]);
});
