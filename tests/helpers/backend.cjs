const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

exports.loadBackend = function loadBackend(entry, dependencies, globals = {}) {
  const root = path.resolve(__dirname, '../../functions/src');
  const cache = new Map();
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename);
    const exports = {};
    cache.set(filename, exports);
    const source = fs.readFileSync(filename, 'utf8');
    const { outputText } = ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021,
    } });
    vm.runInNewContext(outputText, { ...globals, exports, Date, require(name) {
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      if (!name.startsWith('.')) throw new Error(`Unexpected dependency: ${name}`);
      const resolved = path.resolve(path.dirname(filename), `${name}.ts`);
      if (!resolved.startsWith(root + path.sep)) throw new Error('Import outside backend');
      return load(resolved);
    } });
    return exports;
  }
  return load(path.resolve(root, entry));
};
