const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, dependencies = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, esModuleInterop: true,
  } }).outputText;
  vm.runInNewContext(code, { exports, require: name => {
    assert.ok(name in dependencies, name); return dependencies[name];
  } });
  return exports;
}
function progress({ fails = false } = {}) {
  const saved = new Map();
  return { saved, ...load('src/services/guideProgress.ts', {
    '@react-native-async-storage/async-storage': {
      getItem: async key => { if (fails) throw new Error('Unavailable'); return saved.get(key); },
      setItem: async (key, value) => { if (fails) throw new Error('Unavailable'); saved.set(key, value); },
    },
  }) };
}
test('skipping or finishing a flow persists it without suppressing other screen guides', async () => {
  const p = progress();
  assert.equal(await p.shouldShowGuide('explore', false), true);
  p.finishGuide('explore');
  assert.equal(await p.shouldShowGuide('explore', false), false);
  assert.equal(await p.shouldShowGuide('host', false), true);
  assert.equal(p.saved.get('spotbnb:guide:v2:explore'), 'seen');
});
test('manual replay works after dismissal and does not reset saved progress', async () => {
  const p = progress(); p.finishGuide('host');
  assert.equal(await p.shouldShowGuide('host', true), true);
  assert.equal(await p.shouldShowGuide('host', false), false);
  assert.equal(p.saved.size, 1);
});
test('storage failures suppress automatic popups, allow manual replay and never reject dismissal', async () => {
  const p = progress({ fails: true });
  assert.equal(await p.shouldShowGuide('profile', false), false);
  assert.equal(await p.shouldShowGuide('profile', true), true);
  assert.doesNotThrow(() => p.finishGuide('profile'));
  await new Promise(resolve => setImmediate(resolve));
});
const { guideLayout } = load('src/utils/guideLayout.ts');
test('highlight callouts stay outside the target and inside screen safe areas', () => {
  for (const rect of [{ x: 20, y: 150, width: 320, height: 54 }, { x: 120, y: 680, width: 120, height: 44 }]) {
    const layout = guideLayout(rect, 360, 800, 24, 24);
    assert.ok(layout.hole);
    assert.ok(layout.cardTop >= 40);
    assert.ok(layout.cardTop + layout.cardMaxHeight <= 760);
    const cardBottom = layout.cardTop + layout.cardMaxHeight;
    assert.ok(cardBottom <= layout.hole.y || layout.cardTop >= layout.hole.y + layout.hole.height);
  }
});
test('clipped, missing or oversized targets fall back to a readable scrollable explanation', () => {
  for (const rect of [null, { x: 0, y: -10, width: 250, height: 100 }, { x: 0, y: 100, width: 250, height: 400 }, { x: NaN, y: 100, width: 250, height: 100 }]) {
    const layout = guideLayout(rect, 320, 480, 24, 24);
    assert.equal(layout.hole, null);
    assert.equal(layout.cardTop, 40);
    assert.equal(layout.cardMaxHeight, 400);
  }
});

test('replay survives a focus change while loading; stale reads cannot open an overlay', async () => {
  const slots = [], reads = [], completed = [];
  let cursor = 0, focused = true, focusEffect;
  const request = { flow: 'explore', id: 1 };
  const react = {
    createContext: () => ({}), useContext: () => ({ request }),
    createElement: (type, props) => ({ type, props }), useCallback: fn => fn,
    useRef(initial) { const index = cursor++; return slots[index] ?? (slots[index] = { current: initial }); },
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], value => { slots[index] = value; }]; },
  };
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync('src/components/ScreenGuide.tsx', 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText;
  const dependencies = {
    react,
    'react-native': { StyleSheet: { create: value => value } },
    '@react-navigation/native': { useIsFocused: () => focused, useFocusEffect: effect => { focusEffect = effect; } },
    'react-native-safe-area-context': {},
    '../constants/theme': { colors: {}, radius: {}, spacing: {} },
    './ui': { ui: {} }, '../utils/guideLayout': {},
    '../services/guideProgress': {
      shouldShowGuide: (flow, manual) => new Promise(resolve => reads.push({ flow, manual, resolve })),
      finishGuide: flow => completed.push(flow),
    },
  };
  vm.runInNewContext(code, { exports, require: name => { assert.ok(name in dependencies, name); return dependencies[name]; } });
  const render = (ready = true) => { cursor = 0; return exports.useScreenGuide('explore', ready); };
  render(false); focusEffect(); assert.equal(reads.length, 0);
  render(); const blur = focusEffect(); assert.equal(reads[0].manual, true);
  blur(); render(); focusEffect(); assert.equal(reads[1].manual, true);
  reads[0].resolve(true); await Promise.resolve(); assert.equal(render().overlay, null);
  reads[1].resolve(true); await Promise.resolve(); assert.ok(render().overlay);
  focused = false; assert.equal(render().overlay, null);
  focused = true; render().overlay.props.onClose(); assert.equal(render().overlay, null);
  assert.deepEqual(completed, ['explore']);
});
