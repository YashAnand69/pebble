// A hand-written language implementation. Pebble source never becomes JavaScript.
import { lex, parse, PebbleError } from './syntax.js';
import {
  Environment,
  Callable,
  ClassValue,
  Instance,
  Flow,
  truth,
  format,
  snapshot,
} from './values.js';
import { NativeValue } from './native.js';
import { installLibrary } from './stdlib.js';
export { lex, parse, PebbleError, format };
export const VERSION = '2.1.1';
export function resolveModule(path, from = 'main.pebble') {
  if (
    typeof path !== 'string' ||
    !path ||
    path.startsWith('/') ||
    path.includes('\\') ||
    path.includes(':')
  )
    throw new PebbleError('Module', 'Use a relative .pebble file path.', {
      file: from,
    });
  const parts = path.startsWith('.') ? from.split('/').slice(0, -1) : [];
  for (const p of path.split('/')) {
    if (p === '.' || !p) continue;
    if (p === '..') {
      if (!parts.length)
        throw new PebbleError('Module', 'Imports cannot leave the project.', {
          file: from,
        });
      parts.pop();
    } else parts.push(p);
  }
  const result = parts.join('/');
  if (!result.endsWith('.pebble'))
    throw new PebbleError('Module', 'Module paths must end in .pebble.', {
      file: from,
    });
  return result;
}
export function createRuntime(options = {}) {
  const builtins = new Environment(null, true),
    global = new Environment(builtins),
    files = options.files || {},
    modules = new Map();
  let output = [],
    steps = 0,
    calls = 0,
    callDepth = 0,
    trace = [],
    started = 0,
    outputChars = 0,
    moduleInfo = [],
    traceEnabled = true;
  const maxSteps = options.maxSteps ?? 1000000,
    maxTime = options.maxTimeMs ?? 2500;
  if (!(maxSteps > 0) || !(maxTime > 0))
    throw new Error('Execution budgets must be positive.');
  const fail = (m, n, fatal = false) => {
    throw new PebbleError('Runtime', m, n, fatal);
  };
  const number = (v, n) => {
    if (typeof v !== 'number' || !Number.isFinite(v))
      fail('Expected a finite number.', n);
    return v;
  };
  const integer = (v, n) => {
    number(v, n);
    if (!Number.isSafeInteger(v)) fail('Expected a safe integer.', n);
    return v;
  };
  const string = (v, n) => {
    if (typeof v !== 'string') fail('Expected a string.', n);
    return v;
  };
  const list = (v, n) => {
    if (!Array.isArray(v)) fail('Expected a list.', n);
    return v;
  };
  const sequence = (v, n) => {
    if (!Array.isArray(v) && typeof v !== 'string')
      fail('Expected a list or string.', n);
    return v;
  };
  function tick(n) {
    if (
      ++steps > maxSteps ||
      (steps % 128 === 0 && performance.now() - started > maxTime)
    )
      fail(
        'Execution limit reached. Check for an endless loop or reduce the input.',
        n,
        true,
      );
  }
  function record(n, e, detail = '') {
    if (traceEnabled && trace.length < 500)
      trace.push({
        step: steps,
        kind: n.kind,
        line: n.line,
        col: n.col,
        file: n.file,
        detail: detail || n.name || n.target?.name || '',
        depth: callDepth,
        variables: snapshot(e),
        outputCount: output.length,
      });
  }
  function print(text, n) {
    outputChars += text.length;
    if (output.length >= 1000 || outputChars > 200000)
      fail('Output limit reached (1,000 lines / 200,000 characters).', n, true);
    output.push(text);
    options.onOutput?.(text);
  }
  const methods = {
    list: new Set([
      'len',
      'push',
      'pop',
      'slice',
      'reverse',
      'concat',
      'includes',
      'indexOf',
      'join',
      'map',
      'filter',
      'each',
      'find',
      'some',
      'every',
      'reduce',
      'sort',
      'unique',
      'zip',
      'enumerate',
      'sum',
    ]),
    string: new Set([
      'len',
      'slice',
      'reverse',
      'includes',
      'indexOf',
      'split',
      'upper',
      'lower',
      'trim',
      'replace',
      'startsWith',
      'endsWith',
      'repeat',
    ]),
    dictionary: new Set([
      'len',
      'keys',
      'values',
      'entries',
      'has',
      'get',
      'set',
      'delete',
    ]),
  };
  function boundBuiltin(object, name, n) {
    const fn = builtins.cell(name, n).value;
    return new Callable(
      name,
      Math.max(0, fn.min - 1),
      fn.max - 1,
      (args, site) => fn.call([object, ...args], site),
    );
  }
  function property(object, key, n) {
    if (object instanceof NativeValue) {
      try {
        return object.property(key);
      } catch (error) {
        fail(error.message, n);
      }
    }
    if (object instanceof Instance) {
      if (object.fields.has(key)) return object.fields.get(key);
      if (object.klass.methods.has(key)) {
        const method = object.klass.methods.get(key);
        return makeFunction(method.node, method.env, object);
      }
      fail(`Unknown property '${key}' on ${object.klass.name}.`, n);
    }
    if (object instanceof Map) {
      if (object.has(key)) return object.get(key);
      if (methods.dictionary.has(key)) return boundBuiltin(object, key, n);
      return null;
    }
    if (Array.isArray(object) || typeof object === 'string') {
      if (key === 'length') return object.length;
      const set = Array.isArray(object) ? methods.list : methods.string;
      if (set.has(key)) return boundBuiltin(object, key, n);
      fail(`Unknown property '${key}'.`, n);
    }
    fail('Property access expects a dictionary, instance, list, or string.', n);
  }
  function reference(n, e) {
    if (n.kind === 'Identifier') {
      const cell = e.cell(n.name, n);
      return {
        get: () => cell.value,
        set: (v) => {
          if (cell.constant) fail(`Cannot reassign constant '${n.name}'.`, n);
          cell.value = v;
          return v;
        },
      };
    }
    const object = evaluate(n.object, e),
      key = n.kind === 'Member' ? n.name : evaluate(n.index, e);
    if (object instanceof Map) {
      if (!['string', 'number'].includes(typeof key))
        fail('Dictionary keys must be strings or numbers.', n);
      return {
        get: () =>
          n.kind === 'Member'
            ? property(object, key, n)
            : (object.get(key) ?? null),
        set: (v) => {
          if (!object.has(key) && object.size >= 10000)
            fail('Dictionary limit reached.', n, true);
          object.set(key, v);
          return v;
        },
      };
    }
    if (object instanceof Instance) {
      string(key, n);
      return {
        get: () => property(object, key, n),
        set: (v) => {
          if (!object.fields.has(key) && object.fields.size >= 10000)
            fail('Instance field limit reached.', n, true);
          object.fields.set(key, v);
          return v;
        },
      };
    }
    if (n.kind === 'Member')
      return {
        get: () => property(object, key, n),
        set: () => fail('This property is read-only.', n),
      };
    sequence(object, n);
    integer(key, n);
    const i = key < 0 ? object.length + key : key;
    if (i < 0 || i >= object.length)
      fail(
        `Index ${key} is outside this sequence (length ${object.length}).`,
        n,
      );
    return {
      get: () => object[i],
      set: (v) => {
        if (typeof object === 'string')
          fail('Strings cannot be changed by index.', n);
        object[i] = v;
        return v;
      },
    };
  }
  function binary(op, a, b, n) {
    if (op === '==') return a === b;
    if (op === '!=') return a !== b;
    if (op === 'in') {
      if (b instanceof Map) return b.has(a);
      if (typeof b === 'string') return b.includes(string(a, n));
      return list(b, n).includes(a);
    }
    if (op === '+' && typeof a === 'string' && typeof b === 'string') {
      if (a.length + b.length > 100000) fail('String limit reached.', n, true);
      return a + b;
    }
    if (op === '+' && Array.isArray(a) && Array.isArray(b)) {
      if (a.length + b.length > 10000) fail('List limit reached.', n, true);
      return [...a, ...b];
    }
    if (
      ['<', '<=', '>', '>='].includes(op) &&
      typeof a === 'string' &&
      typeof b === 'string'
    )
      return op === '<'
        ? a < b
        : op === '<='
          ? a <= b
          : op === '>'
            ? a > b
            : a >= b;
    number(a, n);
    number(b, n);
    if ((op === '/' || op === '%') && b === 0) fail('Division by zero.', n);
    const value =
      op === '+'
        ? a + b
        : op === '-'
          ? a - b
          : op === '*'
            ? a * b
            : op === '/'
              ? a / b
              : op === '%'
                ? a % b
                : op === '**'
                  ? a ** b
                  : op === '<'
                    ? a < b
                    : op === '<='
                      ? a <= b
                      : op === '>'
                        ? a > b
                        : a >= b;
    if (typeof value === 'number' && !Number.isFinite(value))
      fail('Number is outside the supported range.', n);
    return value;
  }
  function invoke(fn, args, n) {
    if (fn instanceof ClassValue) {
      const instance = new Instance(fn),
        init = fn.methods.get('init');
      if (init) invoke(makeFunction(init.node, init.env, instance), args, n);
      else if (args.length) fail(`${fn.name} expects 0 arguments.`, n);
      return instance;
    }
    if (!(fn instanceof Callable)) fail('This value is not callable.', n);
    if (args.length < fn.min || args.length > fn.max)
      fail(
        `${fn.name} expects ${fn.min === fn.max ? fn.min : `${fn.min}–${fn.max === Infinity ? 'many' : fn.max}`} argument(s), got ${args.length}.`,
        n,
      );
    if (++callDepth > 128) {
      callDepth--;
      fail(
        'Call depth limit reached (128). Check your recursion base case.',
        n,
        true,
      );
    }
    calls++;
    tick(n);
    try {
      const result = fn.call(args, n);
      if (typeof result === 'number' && !Number.isFinite(result))
        fail('Number is outside the supported range.', n);
      return result;
    } catch (err) {
      if (err instanceof PebbleError && err.frames.length < 16)
        err.frames.push({ name: fn.name, line: n.line, file: n.file });
      throw err;
    } finally {
      callDepth--;
    }
  }
  function makeFunction(n, closed, self = null) {
    const required = n.params.filter((p) => !p.value && !p.rest).length,
      rest = n.params.some((p) => p.rest);
    return new Callable(
      n.name || '<anonymous>',
      required,
      rest ? Infinity : n.params.length,
      (args) => {
        const local = new Environment(closed);
        if (self) local.define('this', self, n, true);
        n.params.forEach((p, i) =>
          local.define(
            p.name,
            p.rest
              ? args.slice(i)
              : i < args.length
                ? args[i]
                : evaluate(p.value, local),
            n,
          ),
        );
        try {
          if (n.body.kind === 'ExpressionBody') {
            const value = evaluate(n.body.expression, local);
            record(n, local, 'return ' + format(value).slice(0, 80));
            return value;
          }
          executeList(n.body.body, local);
        } catch (flow) {
          if (flow instanceof Flow && flow.kind === 'return') return flow.value;
          throw flow;
        }
        return null;
      },
    );
  }
  function spreadValues(nodes, e) {
    const result = [];
    for (const node of nodes) {
      const values =
        node.kind === 'Spread'
          ? list(evaluate(node.argument, e), node)
          : [evaluate(node, e)];
      if (result.length + values.length > 10000)
        fail(
          'Collection or argument limit reached (10,000 items).',
          node,
          true,
        );
      result.push(...values);
    }
    return result;
  }
  function evaluate(n, e) {
    tick(n);
    switch (n.kind) {
      case 'Literal':
        return n.value;
      case 'Identifier':
        return e.cell(n.name, n).value;
      case 'Lambda':
        return makeFunction(n, e.capture());
      case 'List':
        return spreadValues(n.elements, e);
      case 'Dictionary': {
        const out = new Map();
        for (const item of n.entries) {
          if (item.spread) {
            const other = evaluate(item.spread, e);
            if (!(other instanceof Map))
              fail('Dictionary spread expects a dictionary.', n);
            for (const [k, v] of other) out.set(k, v);
          } else out.set(item.key, evaluate(item.value, e));
          if (out.size > 10000) fail('Dictionary limit reached.', n, true);
        }
        return out;
      }
      case 'Index':
      case 'Member':
        return reference(n, e).get();
      case 'Assign': {
        const target = reference(n.target, e),
          old = n.operator === '=' ? null : target.get(),
          right = evaluate(n.value, e);
        const result = target.set(
          n.operator === '=' ? right : binary(n.operator[0], old, right, n),
        );
        record(n, e);
        return result;
      }
      case 'Update': {
        const target = reference(n.target, e),
          old = number(target.get(), n);
        target.set(binary(n.operator === '++' ? '+' : '-', old, 1, n));
        record(n, e);
        return old;
      }
      case 'Unary': {
        const v = evaluate(n.argument, e);
        return n.operator === '!'
          ? !truth(v)
          : n.operator === '-'
            ? -number(v, n)
            : number(v, n);
      }
      case 'Conditional':
        return evaluate(
          truth(evaluate(n.condition, e)) ? n.then : n.otherwise,
          e,
        );
      case 'Binary': {
        const a = evaluate(n.left, e),
          op = n.operator;
        if (op === '&&') return truth(a) ? evaluate(n.right, e) : a;
        if (op === '||') return truth(a) ? a : evaluate(n.right, e);
        if (op === '??') return a === null ? evaluate(n.right, e) : a;
        return binary(op, a, evaluate(n.right, e), n);
      }
      case 'Call': {
        const fn = evaluate(n.callee, e),
          args = spreadValues(n.args, e),
          value = invoke(fn, args, n);
        record(n, e, `${fn.name || '<call>'} → ${format(value).slice(0, 80)}`);
        return value;
      }
      default:
        fail(`Unknown expression ${n.kind}.`, n);
    }
  }
  function executeList(body, e, exports = null) {
    // Reserve function bindings so mutually recursive functions can see each other.
    for (const raw of body) {
      const n = raw.kind === 'Export' ? raw.declaration : raw;
      if (n.kind === 'Function') e.define(n.name, null, n);
    }
    let value = null;
    for (const n of body) value = execute(n, e, exports);
    return value;
  }
  function loadModule(path, from, n) {
    const file = resolveModule(path, from);
    if (modules.get(file)?.loading)
      throw new PebbleError(
        'Module',
        `Circular import involving '${file}'.`,
        n,
      );
    if (modules.has(file)) return modules.get(file).exports;
    if (!Object.hasOwn(files, file) || typeof files[file] !== 'string')
      throw new PebbleError(
        'Module',
        `Cannot find module '${file}'. Add it to the project.`,
        n,
      );
    if (modules.size >= 30) fail('Module limit reached (30 files).', n, true);
    const exp = new Map();
    modules.set(file, { loading: true, exports: exp });
    try {
      const ast = parse(lex(files[file], file));
      executeList(ast.body, new Environment(builtins), exp);
      modules.set(file, { loading: false, exports: exp });
      moduleInfo.push({ file, exports: [...exp.keys()] });
      return exp;
    } catch (err) {
      modules.delete(file);
      throw err;
    }
  }
  function execute(n, e, exports = null) {
    tick(n);
    switch (n.kind) {
      case 'Empty':
        return null;
      case 'Program':
        return executeList(n.body, e, exports);
      case 'Block':
        return executeList(n.body, new Environment(e));
      case 'Let':
        e.define(n.name, evaluate(n.value, e), n, n.constant);
        record(n, e);
        return null;
      case 'Function':
        e.cell(n.name, n).value = makeFunction(n, e.capture());
        record(n, e);
        return null;
      case 'Class': {
        const cell = e.define(n.name, null, n);
        const closed = e.capture(),
          methods = new Map(
            n.methods.map((m) => [m.name, { node: m, env: closed }]),
          );
        cell.value = new ClassValue(n.name, methods);
        record(n, e);
        return null;
      }
      case 'Expression':
        return evaluate(n.expression, e);
      case 'If': {
        const yes = truth(evaluate(n.condition, e));
        record(n, e, yes ? 'true branch' : 'false branch');
        return yes
          ? execute(n.then, e)
          : n.otherwise
            ? execute(n.otherwise, e)
            : null;
      }
      case 'While': {
        while (truth(evaluate(n.condition, e))) {
          record(n, e, 'iteration');
          try {
            execute(n.body, e);
          } catch (flow) {
            if (flow instanceof Flow && flow.kind === 'break') break;
            if (flow instanceof Flow && flow.kind === 'continue') continue;
            throw flow;
          }
        }
        return null;
      }
      case 'For': {
        const iterable = evaluate(n.iterable, e);
        const values =
          iterable instanceof Map
            ? [...iterable.keys()]
            : typeof iterable === 'string'
              ? iterable.split('')
              : list(iterable, n).slice();
        for (const value of values) {
          tick(n);
          const local = new Environment(e);
          local.define(n.name, value, n);
          record(n, local, 'iteration');
          try {
            executeList(n.body.body, local);
          } catch (flow) {
            if (flow instanceof Flow && flow.kind === 'break') break;
            if (flow instanceof Flow && flow.kind === 'continue') continue;
            throw flow;
          }
        }
        return null;
      }
      case 'Return': {
        const value = n.value ? evaluate(n.value, e) : null;
        record(n, e, 'return ' + format(value).slice(0, 80));
        throw new Flow('return', value);
      }
      case 'Break':
      case 'Continue':
        record(n, e);
        throw new Flow(n.kind.toLowerCase());
      case 'Throw': {
        const value = evaluate(n.value, e),
          err = new PebbleError('Runtime', format(value), n);
        err.thrownValue = value;
        throw err;
      }
      case 'Try': {
        try {
          return execute(n.body, e);
        } catch (err) {
          if (!(err instanceof PebbleError) || err.fatal) throw err;
          const local = new Environment(e);
          local.define(
            n.name,
            new Map([
              ['message', err.message],
              ['phase', err.phase],
              ['line', err.line],
              ['file', err.file],
              ['value', err.thrownValue ?? null],
            ]),
            n,
          );
          record(n, local, 'caught ' + err.message);
          return executeList(n.handler.body, local);
        }
      }
      case 'Import': {
        const imported = loadModule(n.path, n.file, n);
        for (const item of n.names) {
          if (item.name === '*')
            e.define(item.alias, new Map(imported), n, true);
          else {
            if (!imported.has(item.name))
              throw new PebbleError(
                'Module',
                `'${n.path}' does not export '${item.name}'.`,
                n,
              );
            e.define(item.alias, imported.get(item.name), n, true);
          }
        }
        record(n, e, n.path);
        return null;
      }
      case 'Export': {
        if (!exports) fail('Exports are only allowed in imported modules.', n);
        execute(n.declaration, e);
        exports.set(n.declaration.name, e.cell(n.declaration.name, n).value);
        return null;
      }
      default:
        fail(`Unknown statement ${n.kind}.`, n);
    }
  }
  installLibrary(builtins, {
    fail,
    number,
    integer,
    string,
    list,
    sequence,
    invoke,
    tick,
    print,
  });
  for (const extension of options.extensions || []) {
    extension({
      define: (name, value) => builtins.define(name, value, undefined, true),
      invoke,
      fail,
      tick,
    });
  }
  return {
    run(source, runOptions = {}) {
      output = [];
      steps = 0;
      calls = 0;
      callDepth = 0;
      trace = [];
      moduleInfo = [];
      outputChars = 0;
      started = performance.now();
      traceEnabled = runOptions.trace !== false;
      let tokens = [],
        ast = null;
      const file = runOptions.file || options.entry || 'main.pebble';
      const base = () => ({
        output,
        tokens,
        ast,
        trace,
        traceTruncated: trace.length >= 500,
        steps,
        calls,
        duration: performance.now() - started,
        variables: snapshot(global),
        modules: moduleInfo,
      });
      try {
        tokens = lex(source, file);
        ast = parse(tokens);
        const value = execute(ast, global);
        return { ok: true, ...base(), value: format(value) };
      } catch (err) {
        const error =
          err instanceof PebbleError
            ? err
            : new PebbleError('Runtime', err.message || 'Execution failed.', {
                file,
              });
        return {
          ok: false,
          ...base(),
          error: {
            phase: error.phase,
            message: error.message,
            line: error.line,
            col: error.col,
            file: error.file,
            frames: error.frames,
            fatal: error.fatal,
          },
        };
      }
    },
  };
}
export const run = (source, options = {}) =>
  createRuntime(options).run(source, options);
