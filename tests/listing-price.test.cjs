const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function fixture() {
  const writes = [];
  const dependencies = {
    'firebase/firestore': {
      collection: () => 'spots', serverTimestamp: () => 'server-time',
      addDoc: async (_, data) => {
        // Firestore rejects undefined field values by default.
        assert.ok(!Object.values(data).includes(undefined), 'unsupported undefined field');
        writes.push(data);
        return { id: 'new-spot' };
      },
    },
    'firebase/storage': {}, './firebase': { db: {}, storage: {} },
  };
  const exports = {};
  const source = fs.readFileSync(path.resolve(__dirname, '../src/services/spots.ts'), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
  vm.runInNewContext(outputText, { exports, require: name => dependencies[name] });
  return { writes, create: (data, active) => exports.createSpot('owner', data, active) };
}

test('blank optional daily price is omitted and hourly listing can be created', async () => {
  const f = fixture();
  const input = { title: 'Driveway', pricePerHour: 5, pricePerDay: undefined };
  assert.equal(await f.create(input), 'new-spot');
  assert.equal(Object.hasOwn(f.writes[0], 'pricePerDay'), false);
  assert.equal(f.writes[0].pricePerHour, 5);
  assert.equal(f.writes[0].ownerId, 'owner');
  assert.equal(f.writes[0].isActive, false);
  assert.equal(Object.hasOwn(input, 'pricePerDay'), true);
});

test('a seller ready to publish can explicitly make the new listing active', async () => {
  const f = fixture();
  await f.create({ title: 'Garage', pricePerHour: 5 }, true);
  assert.equal(f.writes[0].isActive, true);
});

test('supplied daily price and listing fields are preserved', async () => {
  const f = fixture();
  await f.create({ title: 'Garage', pricePerHour: 5, pricePerDay: 25 });
  assert.equal(f.writes[0].pricePerDay, 25);
  assert.equal(f.writes[0].title, 'Garage');
});

test('callers that omit the optional property can still create listings', async () => {
  const f = fixture();
  await f.create({ title: 'Garage', pricePerHour: 5 });
  assert.equal(Object.hasOwn(f.writes[0], 'pricePerDay'), false);
});
