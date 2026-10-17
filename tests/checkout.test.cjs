const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { loadBackend } = require('./helpers/backend.cjs');

for (const dismissed of [false, true]) test(`checkout ${dismissed ? 'retries the same reservation after dismissal' : 'reaches payment without reading private bookings'}`, async () => {
  const calls = [];
  const start = '2090-10-24';
  const end = '2090-10-25';
  const states = [{ id: 'spot', title: 'Parking', address: 'Test', pricePerDay: 5 }, start, end, false, null, false, 0, null, '2090-10-24'];
  let stateIndex = 0;
  const react = {
    useEffect() {},
    useRef(value) { return { current: value }; },
    useState() { const index = stateIndex++; return [states[index], value => { states[index] = value; }]; },
    createElement(type, props, ...children) { return { type, props, children }; },
  };
  const dependencies = {
    react,
    'react-native': { View: 'View', Text: 'Text', ActivityIndicator: 'ActivityIndicator',
      TouchableOpacity: 'Button', Platform: { OS: 'ios' }, StyleSheet: { create: (styles) => styles } },
    '../../components/BookingDateTimePicker': { default: 'DateTimePicker' },
    '@stripe/stripe-react-native': { useStripe: () => ({
      initPaymentSheet: async (params) => { calls.push(['init', params]); return {}; },
      presentPaymentSheet: async () => { calls.push(['present']); return dismissed ? { error: { code: 'Canceled' } } : {}; },
    }) },
    '../../services/spots': { getSpot: async () => states[0] },
    '../../services/bookings': {
      // This query cannot be authorized by the existing participant-only rules.
      getSpotBookingsInRange: async () => { throw new Error('permission-denied'); },
      requestBooking: async (params) => {
        calls.push(['reserve', params]);
        return { bookingId: 'booking', paymentIntentClientSecret: 'test_secret' };
      },
    },
    '../../utils/calendarDays': { ...loadBackend('lib/calendarDays.ts'), pickerDate: value => new Date(value), pickerDateString: value => value.toISOString().slice(0, 10) },
    '../../constants/theme': { colors: {}, spacing: {}, radius: {} },
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/screens/SpotDetail/BookSpotScreen.tsx'), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } });
  const exports = {};
  vm.runInNewContext(outputText, { exports, Date, require(name) {
    assert.ok(name in dependencies, `Unexpected dependency ${name}`);
    return dependencies[name];
  } });
  const render = () => { stateIndex = 0; return exports.default({ route: { params: { spotId: 'spot' } }, navigation: {
    getParent: () => ({ navigate: (tab) => calls.push(['navigate', tab]) }),
  } }); };
  const screen = render();
  const button = screen.children.find((element) => element?.type === 'Button');
  assert.ok(button, 'Checkout button rendered');
  await button.props.onPress();
  assert.deepEqual(calls.map(([operation]) => operation), dismissed ? ['reserve', 'init', 'present'] : ['reserve', 'init', 'present', 'navigate']);
  assert.equal(calls[0][1].startDate, start);
  assert.equal(calls[0][1].endDate, end);
  assert.equal(calls[0][1].expectedTotalPriceCents, 1000);
  assert.equal(calls[1][1].paymentIntentClientSecret, 'test_secret');
  if (dismissed) {
    await render().children.find(element => element?.type === 'Button').props.onPress();
    assert.equal(calls.filter(([op]) => op === 'reserve').length, 1);
    assert.equal(calls.filter(([op]) => op === 'present').length, 2);
  }
});
