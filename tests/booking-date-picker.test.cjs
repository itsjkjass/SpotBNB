const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { loadBackend } = require('./helpers/backend.cjs');

function load(file, dependencies) {
  const exports = {};
  const { outputText } = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } });
  vm.runInNewContext(outputText, { exports, Date, require: name => {
    assert.ok(name in dependencies, `Unexpected dependency ${name}`); return dependencies[name];
  } });
  return exports;
}
const calendarDays = load('src/utils/calendarDays.ts', {
  '../../functions/src/lib/calendarDays': loadBackend('lib/calendarDays.ts', {}),
});
const calendarPicker = load('src/utils/calendarPicker.ts', { './calendarDays': calendarDays });
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...(tree.children || []).flatMap(nodes)];
}
function fixture(file, props) {
  const slots = []; let cursor = 0;
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
  };
  const component = load(file, {
    react,
    'react-native': { Modal: 'Modal', View: 'View', Text: 'Text', StyleSheet: { create: s => s }, useWindowDimensions: () => ({ width: 384, height: 832 }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }) },
    './Motion': { MotionPressable: 'Button', useReducedMotion: () => false },
    './BookingCalendar': { __esModule: true, default: 'Calendar' },
    './ui': { Action: 'Action', Icon: 'Icon' },
    '../constants/theme': { colors: {}, depth: {}, radius: {} },
    '../utils/calendarDays': calendarDays,
    '../utils/calendarPicker': calendarPicker,
  }).default;
  return { render() { cursor = 0; return nodes(component(props)); } };
}
function button(f, label) { return f.render().find(n => n.props.accessibilityLabel === label); }
function day(f, value) {
  return button(f, calendarDays.pickerDate(value).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));
}
test('month grid handles leap years, six-week months and year transitions', () => {
  const feb = calendarPicker.monthCells('2028-02-01').filter(Boolean);
  assert.equal(feb.length, 29); assert.equal(feb.at(-1), '2028-02-29');
  assert.equal(calendarPicker.monthCells('2027-02-01').filter(Boolean).length, 28);
  const aug = calendarPicker.monthCells('2026-08-01');
  assert.equal(aug.length, 42); assert.equal(aug[6], '2026-08-01'); assert.equal(aug[36], '2026-08-31');
  assert.equal(calendarPicker.shiftMonth('2026-12-01', 1), '2027-01-01');
  assert.equal(calendarPicker.shiftMonth('2027-01-01', -1), '2026-12-01');
});
test('range selection is a draft until confirmed, including across a month boundary', () => {
  const confirmed = [];
  const f = fixture('src/components/BookingCalendar.tsx', {
    startDate: '2026-10-18', endDate: '2026-10-18', minimumDate: '2026-10-18', onClose() {},
    onConfirm: (...dates) => confirmed.push(dates),
  });
  assert.equal(day(f, '2026-10-17').props.disabled, true);
  assert.equal(button(f, 'Previous month').props.disabled, true);
  day(f, '2026-10-31').props.onPress();
  assert.equal(day(f, '2026-10-30').props.disabled, true);
  button(f, 'Next month').props.onPress();
  day(f, '2026-11-02').props.onPress();
  assert.equal(confirmed.length, 0);
  f.render().find(n => n.type === 'Action').props.onPress();
  assert.deepEqual(confirmed, [['2026-10-31', '2026-11-02']]);
  assert.equal(calendarDays.calendarDayCount(...confirmed[0]), 3);
});
test('same-date booking remains one day and moving first date clamps an earlier last date', () => {
  let confirmed;
  const f = fixture('src/components/BookingCalendar.tsx', {
    startDate: '2026-10-18', endDate: '2026-10-20', minimumDate: '2026-10-18', onClose() {},
    onConfirm: (...dates) => { confirmed = dates; },
  });
  day(f, '2026-10-25').props.onPress();
  day(f, '2026-10-25').props.onPress();
  f.render().find(n => n.type === 'Action').props.onPress();
  assert.deepEqual(confirmed, ['2026-10-25', '2026-10-25']);
});
test('cancel and Android back dismiss a draft without committing dates', () => {
  let closed = 0, committed = 0;
  const f = fixture('src/components/BookingCalendar.tsx', {
    startDate: '2026-10-18', endDate: '2026-10-18', minimumDate: '2026-10-18',
    onClose: () => closed++, onConfirm: () => committed++,
  });
  day(f, '2026-10-22').props.onPress();
  button(f, 'Cancel date selection').props.onPress();
  f.render().find(n => n.type === 'Modal').props.onRequestClose();
  assert.equal(closed, 2); assert.equal(committed, 0);
});
test('checkout field opens the custom calendar and commits a local calendar date only on confirm', () => {
  const changed = [];
  const f = fixture('src/components/BookingDateTimePicker.tsx', {
    value: calendarDays.pickerDate('2026-11-01'), minimumDate: calendarDays.pickerDate('2026-10-18'),
    onChange: date => changed.push(calendarDays.pickerDateString(date)),
  });
  f.render().find(n => n.type === 'Button').props.onPress();
  let calendar = f.render().find(n => n.type === 'Calendar');
  assert.equal(calendar.props.startDate, '2026-11-01');
  assert.equal(calendar.props.minimumDate, '2026-10-18');
  calendar.props.onClose();
  assert.equal(changed.length, 0);
  f.render().find(n => n.type === 'Button').props.onPress();
  calendar = f.render().find(n => n.type === 'Calendar');
  calendar.props.onConfirm('2026-11-02', '2026-11-02');
  assert.deepEqual(changed, ['2026-11-02']);
  assert.equal(f.render().some(n => n.type === 'Calendar'), false);
});
test('payment in progress keeps the checkout date field disabled', () => {
  const f = fixture('src/components/BookingDateTimePicker.tsx', {
    value: calendarDays.pickerDate('2026-11-01'), minimumDate: calendarDays.pickerDate('2026-10-18'), disabled: true, onChange() {},
  });
  assert.equal(f.render().find(n => n.type === 'Button').props.disabled, true);
  assert.equal(f.render().some(n => n.type === 'Calendar'), false);
});
