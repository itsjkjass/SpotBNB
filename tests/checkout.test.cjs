const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

test('checkout reaches server reservation and PaymentSheet without reading private bookings', async () => {
  const calls = [];
  const start = new Date(Date.now() + 3600000);
  const end = new Date(start.getTime() + 3600000);
  const states = [{ id: 'spot', title: 'Parking', address: 'Test', pricePerHour: 5 }, start, end, false, null, new Date()];
  let stateIndex = 0;
  const react = {
    useEffect() {},
    useState() { return [states[stateIndex++], () => {}]; },
    createElement(type, props, ...children) { return { type, props, children }; },
  };
  const dependencies = {
    react,
    'react-native': { View: 'View', Text: 'Text', ActivityIndicator: 'ActivityIndicator',
      TouchableOpacity: 'Button', Platform: { OS: 'ios' }, StyleSheet: { create: (styles) => styles } },
    '../../components/BookingDateTimePicker': { default: 'DateTimePicker' },
    '@stripe/stripe-react-native': { useStripe: () => ({
      initPaymentSheet: async (params) => { calls.push(['init', params]); return {}; },
      presentPaymentSheet: async () => { calls.push(['present']); return {}; },
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
  const screen = exports.default({ route: { params: { spotId: 'spot' } }, navigation: {
    getParent: () => ({ navigate: (tab) => calls.push(['navigate', tab]) }),
  } });
  const button = screen.children.find((element) => element?.type === 'Button');
  assert.ok(button, 'Checkout button rendered');
  await button.props.onPress();
  assert.deepEqual(calls.map(([operation]) => operation), ['reserve', 'init', 'present', 'navigate']);
  assert.equal(calls[0][1].startTime, start.getTime());
  assert.equal(calls[1][1].paymentIntentClientSecret, 'test_secret');
});
