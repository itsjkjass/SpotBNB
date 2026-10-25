const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mount, flush } = require('./helpers/react-hooks.cjs');
function find(tree, type, predicate = () => true) {
  if (!tree || typeof tree !== 'object') return null;
  if (tree.type === type && predicate(tree.props)) return tree;
  for (const child of (tree.children || []).flat(Infinity)) { const result = find(child, type, predicate); if (result) return result; }
  return null;
}
const waitSearch = () => new Promise(resolve => setTimeout(resolve, 375));
function fixture() {
  let props, nextToken = 0;
  const requests = [], details = [], selections = [];
  const view = mount('src/components/AddressSearch.tsx', 'default', {
    'react-native': { View: 'View', Text: 'Text', TextInput: 'Input', Modal: 'Modal', ScrollView: 'Scroll', KeyboardAvoidingView: 'Keyboard', ActivityIndicator: 'Spinner', Platform: { OS: 'android' }, StyleSheet: { create: x => x }, Linking: {} },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '../constants/theme': { colors: {}, radius: {}, spacing: {} },
    './ui': { Action: 'Action', Icon: 'Icon' }, './Motion': { MotionPressable: 'Press' },
    '../services/addresses': {
      newAddressSession: () => `session-${++nextToken}`,
      suggestAddresses: (input, token) => new Promise((resolve, reject) => requests.push({ input, token, resolve, reject })),
      resolveAddress: (id, token) => new Promise((resolve, reject) => details.push({ id, token, resolve, reject })),
    },
  });
  props = { value: '', placeholder: 'Address', onChangeText: value => { props.value = value; }, onSelect: result => selections.push(result) };
  const tree = () => view.render(props);
  const open = () => { find(tree(), 'Press', p => p.accessibilityLabel === 'Address' || p.accessibilityLabel.startsWith('Change address:')).props.onPress(); tree(); };
  const type = value => { find(tree(), 'Input').props.onChangeText(value); tree(); };
  const close = () => { find(tree(), 'Modal').props.onRequestClose(); tree(); };
  return { view, tree, open, type, close, requests, details, selections };
}
test('autocomplete debounces typing and discards results for an old address', async () => {
  const f = fixture(); f.open(); f.type('100'); f.type('100 Queen');
  await waitSearch(); assert.equal(f.requests.length, 1); assert.equal(f.requests[0].input, '100 Queen');
  f.type('200 King'); await waitSearch();
  f.requests[1].resolve([{ placeId: 'new', address: '200 King' }]); await flush();
  f.requests[0].resolve([{ placeId: 'old', address: '100 Queen' }]); await flush();
  assert.ok(find(f.tree(), 'Press', p => p.accessibilityLabel === '200 King'));
  assert.equal(find(f.tree(), 'Press', p => p.accessibilityLabel === '100 Queen'), null);
  f.view.unmount();
});
test('selection resolves the chosen ID in the same session and returns the exact point', async () => {
  const f = fixture(); f.open(); f.type('100 Queen'); await waitSearch();
  f.requests[0].resolve([{ placeId: 'chosen', address: '100 Queen' }]); await flush();
  find(f.tree(), 'Press', p => p.accessibilityLabel === '100 Queen').props.onPress();
  assert.equal(f.details[0].id, 'chosen'); assert.equal(f.details[0].token, f.requests[0].token);
  const selected = { address: '100 Queen', coordinate: { latitude: 43.65, longitude: -79.38 }, attributions: [] };
  f.details[0].resolve(selected); await flush();
  assert.equal(f.selections[0], selected); assert.equal(find(f.tree(), 'Modal'), null);
  f.view.unmount();
});
test('closing during resolution discards the late point; provider failures keep manual fallback', async () => {
  const f = fixture(); f.open(); f.type('100 Queen'); await waitSearch();
  f.requests[0].resolve([{ placeId: 'chosen', address: '100 Queen' }]); await flush();
  find(f.tree(), 'Press', p => p.accessibilityLabel === '100 Queen').props.onPress(); f.close();
  f.details[0].resolve({ coordinate: { latitude: 1, longitude: 1 } }); await flush();
  assert.equal(f.selections.length, 0); f.open(); await waitSearch();
  f.requests[1].reject(Error('unavailable')); await flush();
  assert.ok(find(f.tree(), 'Text', p => p.accessibilityRole === 'alert'));
  assert.equal(find(f.tree(), 'Action', p => p.label === 'Keep typed address').props.disabled, false);
  f.view.unmount();
});
