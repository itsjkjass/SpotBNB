const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, dependencies = {}, globals = {}) {
  const exports = {};
  const { outputText } = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } });
  vm.runInNewContext(outputText, { exports, require: name => dependencies[name], ...globals });
  return exports;
}
const photos = load('src/utils/listingPhoto.ts');
test('generic or missing native MIME types resolve from the selected local file', () => {
  for (const type of ['', 'application/octet-stream']) {
    const metadata = photos.listingPhotoMetadata('file:///cache/PHOTO.PNG?version=1', { size: 100, type });
    assert.equal(metadata.contentType, 'image/png');
    assert.equal(metadata.extension, 'png');
  }
  assert.equal(photos.listingPhotoMetadata('content://photos/123', { size: 100, type: '' }, 'image/heic').contentType, 'image/heic');
});
test('processed image type takes precedence over the original picker MIME type', () => {
  assert.equal(photos.listingPhotoMetadata('file:///photo.jpg', { size: 100, type: '' }, 'image/heic').contentType, 'image/jpeg');
  assert.equal(photos.listingPhotoMetadata('file:///photo.png', { size: 100, type: 'image/jpeg' }).extension, 'jpg');
});
test('large, empty and unsupported photos fail before uploading', () => {
  for (const size of [10 * 1024 * 1024, 11 * 1024 * 1024]) {
    assert.throws(() => photos.listingPhotoMetadata('file:///photo.jpg', { size, type: 'image/jpeg' }), /smaller than 10 MB/);
  }
  assert.throws(() => photos.listingPhotoMetadata('file:///photo.jpg', { size: 0, type: 'image/jpeg' }), /empty/);
  assert.throws(() => photos.listingPhotoMetadata('file:///photo.jpg', { size: 10, type: 'text/html' }), /format/);
  assert.throws(() => photos.listingPhotoMetadata('content://photos/123', { size: 10, type: '' }), /format/);
});
test('listing upload sends explicit image metadata and preserves owner path', async () => {
  const writes = [];
  const blob = { size: 100, type: 'application/octet-stream' };
  const api = load('src/services/spots.ts', {
    'firebase/firestore': { collection: () => 'spots' },
    'firebase/storage': { ref: (_, name) => name, uploadBytes: async (...args) => writes.push(args), getDownloadURL: async () => 'https://image.example/photo' },
    './firebase': { db: {}, storage: {} }, '../utils/listingPhoto': photos,
  }, { fetch: async () => ({ blob: async () => blob }) });
  assert.equal(await api.uploadSpotPhoto('owner', 'file:///cache/selected.png'), 'https://image.example/photo');
  assert.match(writes[0][0], /^spots\/owner\/.+\.png$/);
  assert.equal(writes[0][1], blob);
  assert.equal(writes[0][2].contentType, 'image/png');
  blob.size = 10 * 1024 * 1024;
  await assert.rejects(api.uploadSpotPhoto('owner', 'file:///cache/selected.png'), /smaller than 10 MB/);
  assert.equal(writes.length, 1);
});
test('storage denial messages do not expose internal object paths', () => {
  const message = photos.listingSaveError({ code: 'storage/unauthorized', message: 'spots/private-user/file.jpg' });
  assert.match(message, /hasn't been saved/);
  assert.ok(!message.includes('private-user'));
});
