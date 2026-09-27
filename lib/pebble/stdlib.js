import { Callable, truth, typeOf, format } from './values.js';
export function installLibrary(env, api) {
  const { fail, number, integer, string, list, sequence, invoke, tick, print } =
    api;
  const native = (name, min, max, call) => {
    const fn = new Callable(name, min, max, call);
    env.define(name, fn, undefined, true);
    return fn;
  };
  const unary = (name, fn) => native(name, 1, 1, ([v], n) => fn(number(v, n)));
  const callback = (fn, args, n) =>
    invoke(fn, args.slice(0, fn instanceof Callable ? fn.max : args.length), n);
  const dict = (v, n) => {
    if (!(v instanceof Map)) fail('Expected a dictionary.', n);
    return v;
  };
  const checked = (v) => {
    if (typeof v === 'number' && !Number.isFinite(v))
      fail('Number is outside the supported range.');
    return v;
  };
  native('print', 0, Infinity, (a, n) => {
    print(a.map((v) => format(v)).join(' '), n);
    return null;
  });
  native('str', 1, 1, ([v]) => format(v));
  native('type', 1, 1, ([v]) => typeOf(v));
  native('num', 1, 1, ([v], n) => {
    if (typeof v !== 'string' && typeof v !== 'number')
      fail('num expects a numeric string or number.', n);
    if (typeof v === 'string' && !v.trim())
      fail('Cannot convert an empty string to a number.', n);
    const x = Number(v);
    if (!Number.isFinite(x))
      fail(`Cannot convert '${format(v)}' to a number.`, n);
    return x;
  });
  native('len', 1, 1, ([v], n) =>
    v instanceof Map ? v.size : sequence(v, n).length,
  );
  native('range', 1, 3, (a, n) => {
    const start = a.length === 1 ? 0 : integer(a[0], n),
      end = integer(a.length === 1 ? a[0] : a[1], n),
      step = a.length === 3 ? integer(a[2], n) : 1;
    if (!step) fail('range step cannot be zero.', n);
    const length = Math.max(0, Math.ceil((end - start) / step));
    if (length > 10000) fail('range is limited to 10,000 items.', n);
    return Array.from({ length }, (_, i) => start + i * step);
  });
  native('push', 2, 2, ([v, x], n) => {
    list(v, n);
    if (v.length >= 10000) fail('List limit reached (10,000 items).', n);
    return v.push(x);
  });
  native('pop', 1, 1, ([v], n) => list(v, n).pop() ?? null);
  native('slice', 2, 3, ([v, start, end], n) =>
    sequence(v, n).slice(
      integer(start, n),
      end === undefined ? undefined : integer(end, n),
    ),
  );
  native('reverse', 1, 1, ([v], n) =>
    typeof v === 'string'
      ? v.split('').reverse().join('')
      : list(v, n).slice().reverse(),
  );
  native('concat', 2, 2, ([a, b], n) => {
    list(a, n);
    list(b, n);
    if (a.length + b.length > 10000)
      fail('List limit reached (10,000 items).', n);
    return [...a, ...b];
  });
  native('includes', 2, 2, ([v, x], n) =>
    typeof v === 'string' ? v.includes(string(x, n)) : list(v, n).includes(x),
  );
  native('indexOf', 2, 2, ([v, x], n) =>
    typeof v === 'string' ? v.indexOf(string(x, n)) : list(v, n).indexOf(x),
  );
  native('join', 1, 2, ([v, sep = ', '], n) => {
    const out = list(v, n)
      .map((x) => format(x))
      .join(string(sep, n));
    if (out.length > 100000) fail('String limit reached.', n);
    return out;
  });
  native('split', 2, 2, ([v, sep], n) => {
    const out = string(v, n).split(string(sep, n));
    if (out.length > 10000) fail('List limit reached.', n);
    return out;
  });
  native('upper', 1, 1, ([v], n) => string(v, n).toUpperCase());
  native('lower', 1, 1, ([v], n) => string(v, n).toLowerCase());
  native('trim', 1, 1, ([v], n) => string(v, n).trim());
  native('replace', 3, 3, ([v, from, to], n) => {
    const out = string(v, n).replaceAll(string(from, n), string(to, n));
    if (out.length > 100000) fail('String limit reached.', n);
    return out;
  });
  native('startsWith', 2, 2, ([v, x], n) =>
    string(v, n).startsWith(string(x, n)),
  );
  native('endsWith', 2, 2, ([v, x], n) => string(v, n).endsWith(string(x, n)));
  native('repeat', 2, 2, ([v, count], n) => {
    string(v, n);
    integer(count, n);
    if (count < 0 || count > 100000 || v.length * count > 100000)
      fail('Invalid repeat count or string too large.', n);
    return v.repeat(count);
  });
  for (const name of ['map', 'filter', 'each', 'find', 'some', 'every'])
    native(name, 2, 2, ([v, fn], n) => {
      const input = list(v, n).slice(),
        out = [];
      let found = false;
      for (let i = 0; i < input.length; i++) {
        tick(n);
        const result = callback(fn, [input[i], i], n);
        if (name === 'map') out.push(result);
        if (name === 'filter' && truth(result)) out.push(input[i]);
        if (name === 'find' && truth(result)) return input[i];
        if (name === 'some' && truth(result)) return true;
        if (name === 'every' && !truth(result)) return false;
        found ||= truth(result);
      }
      return name === 'find'
        ? null
        : name === 'some'
          ? found
          : name === 'every'
            ? true
            : name === 'each'
              ? null
              : out;
    });
  native('reduce', 3, 3, ([v, fn, initial], n) => {
    let acc = initial;
    const input = list(v, n).slice();
    for (let i = 0; i < input.length; i++) {
      tick(n);
      acc = callback(fn, [acc, input[i], i], n);
    }
    return acc;
  });
  native('sort', 1, 2, ([v, fn], n) => {
    const result = list(v, n).slice();
    return result.sort((a, b) => {
      tick(n);
      if (fn !== undefined) return number(callback(fn, [a, b], n), n);
      if (typeof a !== typeof b || !['number', 'string'].includes(typeof a))
        fail('Default sort expects only numbers or only strings.', n);
      return a < b ? -1 : a > b ? 1 : 0;
    });
  });
  native('unique', 1, 1, ([v], n) => [...new Set(list(v, n))]);
  native('zip', 2, 2, ([a, b], n) => {
    list(a, n);
    list(b, n);
    return a.slice(0, Math.min(a.length, b.length)).map((v, i) => [v, b[i]]);
  });
  native('enumerate', 1, 1, ([v], n) =>
    Array.from({ length: sequence(v, n).length }, (_, i) => [i, v[i]]),
  );
  native('sum', 1, 1, ([v], n) =>
    checked(list(v, n).reduce((a, b) => a + number(b, n), 0)),
  );
  native('keys', 1, 1, ([v], n) => [...dict(v, n).keys()]);
  native('values', 1, 1, ([v], n) => [...dict(v, n).values()]);
  native('entries', 1, 1, ([v], n) => [...dict(v, n).entries()]);
  native('has', 2, 2, ([v, k], n) => dict(v, n).has(k));
  native(
    'get',
    2,
    3,
    ([v, k, fallback = null], n) => dict(v, n).get(k) ?? fallback,
  );
  native('set', 3, 3, ([v, k, x], n) => {
    dict(v, n);
    if (!['string', 'number'].includes(typeof k))
      fail('Dictionary keys must be strings or numbers.', n);
    if (!v.has(k) && v.size >= 10000) fail('Dictionary limit reached.', n);
    v.set(k, x);
    return x;
  });
  native('delete', 2, 2, ([v, k], n) => dict(v, n).delete(k));
  for (const [name, fn] of Object.entries({
    abs: Math.abs,
    floor: Math.floor,
    ceil: Math.ceil,
    round: Math.round,
    sqrt: Math.sqrt,
    sin: Math.sin,
    cos: Math.cos,
    log: Math.log,
  }))
    unary(name, fn);
  native('pow', 2, 2, ([a, b], n) => checked(number(a, n) ** number(b, n)));
  native('min', 1, Infinity, (a, n) => Math.min(...a.map((v) => number(v, n))));
  native('max', 1, Infinity, (a, n) => Math.max(...a.map((v) => number(v, n))));
  native('clamp', 3, 3, ([v, lo, hi], n) => {
    number(v, n);
    number(lo, n);
    number(hi, n);
    if (lo > hi) fail('clamp minimum must not exceed maximum.', n);
    return Math.max(lo, Math.min(hi, v));
  });
  native('assert', 1, 2, ([condition, message = 'Assertion failed.'], n) => {
    if (!truth(condition)) fail(format(message), n);
    return null;
  });
  native('parseJSON', 1, 1, ([v], n) => {
    let parsed;
    try {
      parsed = JSON.parse(string(v, n));
    } catch {
      fail('Invalid JSON.', n);
    }
    let count = 0;
    function convert(x, depth = 0) {
      tick(n);
      if (++count > 10000 || depth > 100)
        fail('JSON is too large or deeply nested.', n);
      if (typeof x === 'number' && !Number.isFinite(x))
        fail('JSON number is outside the supported range.', n);
      if (Array.isArray(x)) return x.map((y) => convert(y, depth + 1));
      if (x !== null && typeof x === 'object')
        return new Map(
          Object.entries(x).map(([k, y]) => [k, convert(y, depth + 1)]),
        );
      return x;
    }
    return convert(parsed);
  });
  native('stringifyJSON', 1, 1, ([v], n) => {
    const seen = new Set();
    let count = 0;
    function convert(x, depth = 0) {
      tick(n);
      if (++count > 10000 || depth > 100)
        fail('Value is too large or deeply nested for JSON.', n);
      if (x === null || ['string', 'number', 'boolean'].includes(typeof x))
        return x;
      if (!Array.isArray(x) && !(x instanceof Map))
        fail('Functions, classes, and instances cannot be encoded as JSON.', n);
      if (seen.has(x)) fail('Cannot encode a cyclic value as JSON.', n);
      seen.add(x);
      let out;
      if (Array.isArray(x)) out = x.map((y) => convert(y, depth + 1));
      else {
        out = Object.create(null);
        for (const [k, y] of x) {
          if (typeof k !== 'string')
            fail('JSON dictionary keys must be strings.', n);
          out[k] = convert(y, depth + 1);
        }
      }
      seen.delete(x);
      return out;
    }
    const out = JSON.stringify(convert(v));
    if (out.length > 100000) fail('JSON string is too large.', n);
    return out;
  });
  env.define('PI', Math.PI, undefined, true);
  env.define('E', Math.E, undefined, true);
}
