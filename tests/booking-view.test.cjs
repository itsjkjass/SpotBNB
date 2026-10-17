const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const moduleExports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/utils/bookingView.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: moduleExports });
const { selectBookings } = moduleExports;
const booking = (id, data = {}) => ({ id, buyerId: 'me', sellerId: 'host', startTime: 200, endTime: 300, status: 'confirmed', ...data });
const ids = rows => Array.from(rows, row => row.id);

test('parking and hosting remain separate and duplicate snapshots appear once', () => {
  const rows = [booking('parking'), booking('parking'), booking('hosting', { buyerId: 'guest', sellerId: 'me' }), booking('other', { buyerId: 'guest' })];
  assert.deepEqual(ids(selectBookings(rows, 'me', 'buyer', 'upcoming', 100)), ['parking']);
  assert.deepEqual(ids(selectBookings(rows, 'me', 'seller', 'upcoming', 100)), ['hosting']);
});
test('current bookings remain upcoming until the exclusive end; cancelled and completed go to past', () => {
  const rows = [booking('current', { startTime: 50 }), booking('ended', { endTime: 100 }), booking('cancelled', { status: 'cancelled' }), booking('completed', { status: 'completed' })];
  assert.deepEqual(ids(selectBookings(rows, 'me', 'buyer', 'upcoming', 100)), ['current']);
  assert.equal(selectBookings(rows, 'me', 'buyer', 'past', 100).length, 3);
});
test('upcoming is nearest first and history is newest first', () => {
  const rows = [booking('later', { startTime: 200 }), booking('next', { startTime: 150 })];
  assert.deepEqual(ids(selectBookings(rows, 'me', 'buyer', 'upcoming', 100)), ['next', 'later']);
  assert.deepEqual(ids(selectBookings(rows, 'me', 'buyer', 'past', 400)), ['later', 'next']);
});
