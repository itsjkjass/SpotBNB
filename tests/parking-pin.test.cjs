const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { mount, flush } = require('./helpers/react-hooks.cjs');
function load(file) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports });
  return exports;
}
const location = load('src/utils/parkingLocation.ts');
const theme = load('src/constants/theme.ts');
const native = { View: 'View', Text: 'Text', Modal: 'Modal', ActivityIndicator: 'Spinner', TextInput: 'Input', ScrollView: 'Scroll', Image: 'Image',
  StyleSheet: { create: x => x, absoluteFill: {} }, Keyboard: { dismiss() {} }, Alert: { alert() {} } };
function find(tree, type, predicate = () => true) {
  if (!tree || typeof tree !== 'object') return null;
  if (tree.type === type && predicate(tree.props)) return tree;
  for (const child of (tree.children || []).flat(Infinity)) { const result = find(child, type, predicate); if (result) return result; }
  return null;
}
const initial = { latitude: 43.65, longitude: -79.38 };
const entrance = { latitude: 43.65123, longitude: -79.38123 };
function picker(initialCoordinate) {
  let resolve, reject;
  const lookup = new Promise((yes, no) => { resolve = yes; reject = no; });
  const confirmed = []; let closed = 0;
  const view = mount('src/components/ParkingLocationPicker.tsx', 'default', {
    'react-native': native, 'react-native-maps': { __esModule: true, default: 'Map', Marker: 'Marker' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 24 }) },
    '../constants/theme': theme, '../services/parkingLocation': { findParkingAddress: () => lookup },
    '../utils/parkingLocation': location, './Motion': { MotionPressable: 'Press', useReducedMotion: () => false }, './ui': { Action: 'Action', Icon: 'Icon' },
  });
  const props = { address: 'Street address', initialCoordinate, onConfirm: p => confirmed.push(p), onClose: () => closed++ };
  const tree = () => view.render(props);
  tree();
  return { view, tree, resolve, reject, confirmed, closed: () => closed };
}
test('address centres the map, dragging selects the entrance and confirmation returns that point', async () => {
  const f = picker();
  assert.equal(find(f.tree(), 'Action').props.disabled, true);
  f.resolve(initial); await flush();
  assert.equal(find(f.tree(), 'Map').props.region.latitude, initial.latitude);
  find(f.tree(), 'Map').props.onMapReady();
  find(f.tree(), 'Marker').props.onDragStart();
  assert.equal(find(f.tree(), 'Action').props.disabled, true);
  find(f.tree(), 'Marker').props.onDragEnd({ nativeEvent: { coordinate: entrance } });
  assert.equal(f.confirmed.length, 0);
  find(f.tree(), 'Action').props.onPress();
  assert.equal(f.confirmed[0].latitude, entrance.latitude);
  assert.equal(f.confirmed[0].longitude, entrance.longitude);
  f.view.unmount();
});
test('a late address result cannot overwrite a manually chosen pin', async () => {
  const f = picker();
  find(f.tree(), 'Map').props.onPress({ nativeEvent: { coordinate: entrance } });
  f.resolve(initial); await flush();
  assert.equal(find(f.tree(), 'Marker').props.coordinate.latitude, entrance.latitude);
  f.view.unmount();
});
test('lookup failures allow manual placement and cancelling never commits a draft', async () => {
  const f = picker(); f.reject(new Error('No address match')); await flush();
  find(f.tree(), 'Map').props.onPress({ nativeEvent: { coordinate: entrance } });
  find(f.tree(), 'Press', p => p.accessibilityLabel === 'Cancel pin selection').props.onPress();
  assert.equal(f.closed(), 1); assert.equal(f.confirmed.length, 0);
  f.view.unmount();
  const restored = picker(initial);
  assert.equal(find(restored.tree(), 'Marker').props.coordinate.latitude, initial.latitude);
  restored.view.unmount();
});
function listing(existing) {
  const writes = [];
  const view = mount('src/screens/CreateListing/CreateListingScreen.tsx', 'default', {
    'react-native': native, 'expo-image-picker': {}, '../../components/Motion': { MotionPressable: 'Press' },
    '../../services/spots': { getSpot: async () => existing, createSpot: async (...args) => writes.push(args), updateSpot: async (...args) => writes.push(args), uploadSpotPhoto: async () => 'url' },
    '../../utils/calendarDays': { dailyRateCents: n => n * 100, DEFAULT_PARKING_TIME_ZONE: 'America/Toronto', PARKING_TIME_ZONES: [] },
    '../../hooks/useAuth': { useAuth: () => ({ user: { uid: 'owner' } }) }, '../../constants/theme': theme,
    '../../utils/listingPhoto': { listingSaveError: e => e.message }, '../../utils/parkingLocation': location,
    '../../components/ParkingLocationPicker': { __esModule: true, default: 'Picker' }, '../../components/ui': { Action: 'Action', Icon: 'Icon' },
    '../../components/AddressSearch': { __esModule: true, default: 'Input' },
  });
  const props = { navigation: { goBack() {} }, route: { params: existing ? { spotId: 'spot' } : {} } };
  const tree = () => view.render(props);
  tree();
  const fill = (placeholder, value) => find(tree(), 'Input', p => p.placeholder === placeholder).props.onChangeText(value);
  const save = () => find(tree(), 'Press', p => Object.hasOwn(p, 'disabled')).props.onPress();
  // The submit button is the only MotionPressable with a disabled prop in this form.
  return { view, tree, fill, writes, save };
}
test('publishing requires a confirmed pin and saves it instead of re-geocoding the address', async () => {
  const f = listing();
  f.fill('Driveway near BMO Field', 'Parking'); f.fill('123 Main St, Toronto, ON', '123 Street'); f.fill('25.00', '25');
  await f.save(); assert.equal(f.writes.length, 0);
  find(f.tree(), 'Picker').props.onConfirm(entrance);
  await f.save();
  assert.equal(f.writes.length, 1); assert.equal(f.writes[0][1].location.latitude, entrance.latitude);
  assert.equal(f.writes[0][1].locationConfirmed, true);
  f.fill('123 Main St, Toronto, ON', '456 New Street');
  await f.save(); assert.equal(f.writes.length, 1); assert.ok(find(f.tree(), 'Picker'));
  f.view.unmount();
});
test('editing a confirmed listing preserves its chosen coordinates', async () => {
  const f = listing({ title: 'Parking', ownerId: 'owner', description: '', address: '123 Street', pricePerDay: 25, spotType: 'driveway',
    location: entrance, locationConfirmed: true, vehicleSizes: ['standard'], photoUrls: [], isActive: true, availability: { type: 'always' } });
  await flush(); f.tree(); f.fill('Driveway near BMO Field', 'New title'); await f.save();
  assert.equal(f.writes[0][1].location.longitude, entrance.longitude);
  f.view.unmount();
});

test('a chosen address seeds its exact point but still requires entrance confirmation; typing invalidates that point', async () => {
  const f = listing(); f.fill('Driveway near BMO Field', 'Parking'); f.fill('25.00', '25');
  find(f.tree(), 'Input', p => p.placeholder === '123 Main St, Toronto, ON').props.onSelect({ address: '100 Queen Street', coordinate: entrance, attributions: [] });
  await f.save();
  assert.equal(f.writes.length, 0);
  assert.equal(find(f.tree(), 'Picker').props.initialCoordinate, entrance);
  find(f.tree(), 'Picker').props.onConfirm(entrance); await f.save();
  assert.equal(f.writes[0][1].address, '100 Queen Street');
  assert.equal(f.writes[0][1].location.longitude, entrance.longitude);
  f.fill('123 Main St, Toronto, ON', '200 King Street'); await f.save();
  assert.equal(find(f.tree(), 'Picker').props.initialCoordinate, undefined);
  assert.equal(f.writes.length, 1); f.view.unmount();
});
test('directions use exact coordinates including negative signs and reject invalid destinations', () => {
  const url = new URL(location.parkingDirectionsUrl(entrance));
  assert.equal(url.searchParams.get('destination'), `${entrance.latitude},${entrance.longitude}`);
  assert.equal(url.searchParams.get('travelmode'), 'driving');
  for (const value of [null, {}, { latitude: '43', longitude: 1 }, { latitude: NaN, longitude: 1 }, { latitude: 91, longitude: 0 }, { latitude: 1, longitude: -181 }]) {
    assert.equal(location.isParkingCoordinate(value), false);
    assert.throws(() => location.parkingDirectionsUrl(value));
  }
});

test('booking directions prefer the saved snapshot, with a safe fallback for older bookings', async () => {
  const opened = []; const alerts = []; const reads = [];
  const view = mount('src/components/ParkingDirections.tsx', 'default', {
    'react-native': { Linking: { openURL: async url => opened.push(url) }, Alert: { alert: (...args) => alerts.push(args) } },
    '../services/spots': { getSpot: async id => { reads.push(id); return id === 'old-spot' ? { location: initial } : null; } },
    '../utils/parkingLocation': location, './ui': { Action: 'Action' },
  });
  let props = { coordinate: entrance, spotId: 'new-spot' };
  await view.render(props).props.onPress();
  assert.equal(reads.length, 0);
  assert.equal(new URL(opened[0]).searchParams.get('destination'), `${entrance.latitude},${entrance.longitude}`);
  props = { spotId: 'old-spot' };
  view.render(props); await flush(); await view.render(props).props.onPress();
  assert.equal(new URL(opened[1]).searchParams.get('destination'), `${initial.latitude},${initial.longitude}`);
  props = { spotId: 'deleted-spot' };
  view.render(props); await flush(); await view.render(props).props.onPress();
  assert.equal(opened.length, 2); assert.equal(alerts.length, 1);
  view.unmount();
});
