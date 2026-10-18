const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function render(platform) {
  const opened = [];
  const selected = [];
  const exports = {};
  const dependencies = {
    react: { createElement: (type, props, ...children) => ({ type, props, children }) },
    'react-native': { Platform: { OS: platform }, Text: 'Text' },
    './Motion': { MotionPressable: 'Button' },
    '../constants/theme': { colors: { text: '#1A2420', primary: '#0B6E4F' } },
    '@react-native-community/datetimepicker': {
      __esModule: true, default: 'NativePicker',
      DateTimePickerAndroid: { open: (options) => opened.push(options) },
    },
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/components/BookingDateTimePicker.tsx'), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } });
  vm.runInNewContext(outputText, { exports, require: (name) => dependencies[name] });
  const value = new Date('2026-10-01T10:00:00Z');
  const minimumDate = new Date('2026-09-01T10:00:00Z');
  return { opened, selected, value, minimumDate, element: exports.default({
    value, minimumDate, onChange: (date) => selected.push(date),
  }) };
}

test('Android commits one calendar date without opening an hourly picker', () => {
  const fixture = render('android');
  assert.equal(fixture.opened.length, 0);
  fixture.element.props.onPress();
  assert.equal(fixture.opened[0].mode, 'date');
  assert.equal(fixture.opened[0].minimumDate, fixture.minimumDate);
  const date = new Date('2026-10-02T10:00:00Z');
  fixture.opened[0].onChange({ type: 'set' }, date);
  assert.equal(fixture.opened.length, 1);
  assert.equal(fixture.selected[0], date);
});
test('dismissing the Android date dialog does not open time or change the booking', () => {
  const fixture = render('android');
  fixture.element.props.onPress();
  fixture.opened[0].onChange({ type: 'dismissed' }, fixture.value);
  assert.equal(fixture.opened.length, 1);
  assert.equal(fixture.selected.length, 0);
});
test('iOS uses a date-only picker', () => {
  const fixture = render('ios');
  assert.equal(fixture.element.type, 'NativePicker');
  assert.equal(fixture.element.props.mode, 'date');
  assert.equal(fixture.opened.length, 0);
});
