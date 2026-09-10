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
    'react-native': { Platform: { OS: platform }, Text: 'Text', TouchableOpacity: 'Button' },
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

test('Android opens date then time and commits only the completed selection', () => {
  const fixture = render('android');
  assert.equal(fixture.opened.length, 0);
  fixture.element.props.onPress();
  assert.equal(fixture.opened[0].mode, 'date');
  assert.equal(fixture.opened[0].minimumDate, fixture.minimumDate);
  const date = new Date('2026-10-02T10:00:00Z');
  fixture.opened[0].onChange({ type: 'set' }, date);
  assert.equal(fixture.selected.length, 0);
  assert.equal(fixture.opened[1].mode, 'time');
  assert.equal(fixture.opened[1].value, date);
  const time = new Date('2026-10-02T14:30:00Z');
  fixture.opened[1].onChange({ type: 'set' }, time);
  assert.equal(fixture.selected[0], time);
});
test('dismissing the Android date dialog does not open time or change the booking', () => {
  const fixture = render('android');
  fixture.element.props.onPress();
  fixture.opened[0].onChange({ type: 'dismissed' }, fixture.value);
  assert.equal(fixture.opened.length, 1);
  assert.equal(fixture.selected.length, 0);
});
test('dismissing the Android time dialog leaves the booking unchanged', () => {
  const fixture = render('android');
  fixture.element.props.onPress();
  fixture.opened[0].onChange({ type: 'set' }, fixture.value);
  fixture.opened[1].onChange({ type: 'dismissed' }, fixture.value);
  assert.equal(fixture.selected.length, 0);
});
test('iOS retains the native combined datetime picker', () => {
  const fixture = render('ios');
  assert.equal(fixture.element.type, 'NativePicker');
  assert.equal(fixture.element.props.mode, 'datetime');
  assert.equal(fixture.opened.length, 0);
});
