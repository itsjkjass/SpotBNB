const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { loadBackend } = require('./helpers/backend.cjs');

function fixture({ unavailable = false } = {}) {
  const slots = [], calls = [], effects = [];
  let cursor = 0, mounted = false;
  const react = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef(value) { const index = cursor++; return slots[index] ?? (slots[index] = { current: value }); },
    useEffect(effect) { if (!mounted) effects.push(effect); },
  };
  const dependencies = {
    react,
    'react-native': { View: 'View', Text: 'Text', ScrollView: 'ScrollView', ActivityIndicator: 'Spinner', TouchableOpacity: 'Button', StyleSheet: { create: s => s } },
    '../../components/BookingDateTimePicker': { __esModule: true, default: 'DatePicker' },
    '../../constants/theme': { colors: {}, spacing: {}, radius: {} },
    '../../utils/calendarDays': { ...loadBackend('lib/calendarDays.ts'), pickerDate: value => new Date(value), pickerDateString: value => value.toISOString().slice(0, 10) },
    '../../services/spots': { getSpot: async () => { if (unavailable) throw new Error('Offline'); return { id: 's', pricePerDay: 19.99 }; } },
    '../../services/bookings': { requestBooking: async data => { calls.push(data); return { bookingId: 'b', paymentIntentClientSecret: 'secret' }; } },
    '@stripe/stripe-react-native': { useStripe: () => ({ initPaymentSheet: async () => ({}), presentPaymentSheet: async () => ({}) }) },
  };
  const source = fs.readFileSync('src/screens/SpotDetail/BookSpotScreen.tsx', 'utf8');
  const exports = {};
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  vm.runInNewContext(compiled, { exports, Date, require: name => {
    assert.ok(name in dependencies, name); return dependencies[name];
  } });
  return { calls, render() {
    cursor = 0;
    const tree = exports.default({ route: { params: { spotId: 's', startDate: '2090-10-24', endDate: '2090-10-26' } }, navigation: { getParent: () => ({ navigate() {} }) } });
    mounted = true; effects.splice(0).forEach(effect => effect()); return tree;
  } };
}
function elements(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(elements);
  return [tree, ...(tree.children || []).flatMap(elements)];
}
test('dates selected in Explore survive listing load and reach payment as three days', async () => {
  const f = fixture(); f.render(); await new Promise(resolve => setImmediate(resolve));
  const tree = f.render();
  const dates = elements(tree).filter(e => e.type === 'DatePicker');
  assert.equal(dates[0].props.value.toISOString().slice(0, 10), '2090-10-24');
  assert.equal(dates[1].props.value.toISOString().slice(0, 10), '2090-10-26');
  await elements(tree).find(e => e.type === 'Button').props.onPress();
  assert.equal(f.calls[0].expectedTotalPriceCents, 5997);
  assert.equal(f.calls[0].endDate, '2090-10-26');
});
test('listing load failure leaves checkout with retry instead of an endless spinner', async () => {
  const f = fixture({ unavailable: true }); f.render(); await new Promise(resolve => setImmediate(resolve));
  const nodes = elements(f.render());
  assert.equal(nodes.some(e => e.type === 'Spinner'), false);
  assert.equal(nodes.some(e => e.type === 'Button'), true);
  assert.equal(f.calls.length, 0);
});
