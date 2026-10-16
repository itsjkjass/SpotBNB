const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const output = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/utils/earnings.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const result = {};
vm.runInNewContext(output, { exports: result });
const state = (fields = {}, transfer = null) => result.earningsState({
  booking: { paymentFlow: 'separate_v1', status: 'confirmed', endTime: 10, ...fields }, transfer,
}, 20);

test('withdrawal appears only after the booking ends and never for refunded, unpaid or legacy bookings', () => {
  assert.equal(state().canWithdraw, true);
  for (const fields of [{ endTime: 30 }, { endTime: undefined }, { paymentFlow: undefined }, { status: 'pending_payment' },
    { status: 'cancelled' }, { cancellationRequestedAt: 1 }, { refundedCents: 1 }, { paymentDisputed: true }]) {
    assert.equal(state(fields).canWithdraw, false);
  }
});

test('processing, transferred and held earnings cannot be requested again; Stripe transfer is not bank arrival', () => {
  for (const status of ['processing', 'transferred', 'held', 'reversed', 'reversal_pending', 'unknown']) {
    assert.equal(state({}, { status }).canWithdraw, false);
  }
  assert.match(state({}, { status: 'transferred' }).label, /bank arrival follows/);
});
