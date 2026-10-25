const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Small deterministic hook harness: explicit renders and controlled async
// dependencies exercise lifecycle races without loading React Native.
exports.mount = function mount(file, exportName, dependencies, sourceOverride) {
  const slots = [];
  let cursor = 0;
  let pending = [];
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    createContext: () => ({ Provider: 'Provider' }),
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = initial;
      return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }];
    },
    useRef(initial) {
      const i = cursor++;
      return slots[i] || (slots[i] = { current: initial });
    },
    useCallback(fn, deps) {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { deps, fn };
      return slots[i].fn;
    },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) pending.push(() => {
        slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: fn() };
      });
    },
  };
  const exports = {};
  const source = sourceOverride || fs.readFileSync(path.resolve(__dirname, '../../', file), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } });
  vm.runInNewContext(outputText, { exports, setTimeout, clearTimeout, require(name) {
    if (name === 'react') return react;
    if (Object.hasOwn(dependencies, name)) return dependencies[name];
    throw new Error(`Unexpected dependency ${name}`);
  } });
  return {
    render(props = { children: null }) {
      cursor = 0;
      const tree = exports[exportName](props);
      const effects = pending; pending = []; effects.forEach(fn => fn());
      return tree;
    },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
  };
};
exports.flush = async () => { await new Promise(resolve => setImmediate(resolve)); };
