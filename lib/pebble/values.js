import { PebbleError } from './syntax.js';
export class Environment {
  constructor(parent = null, builtin = false) {
    this.parent = parent;
    this.values = new Map();
    this.builtin = builtin;
  }
  define(name, value, n, constant = false) {
    if (this.values.has(name))
      throw new PebbleError(
        'Runtime',
        `'${name}' is already declared in this scope.`,
        n,
      );
    this.values.set(name, { value, constant });
    return this.values.get(name);
  }
  cell(name, n) {
    if (this.values.has(name)) return this.values.get(name);
    if (this.parent) return this.parent.cell(name, n);
    throw new PebbleError('Runtime', `Undefined variable '${name}'.`, n);
  }
  capture() {
    const copy = new Environment(this.parent?.capture(), this.builtin);
    copy.values = new Map(this.values);
    return copy;
  }
}
export class Callable {
  constructor(name, min, max, call) {
    Object.assign(this, { name, min, max, call });
  }
}
export class ClassValue {
  constructor(name, methods) {
    this.name = name;
    this.methods = methods;
  }
}
export class Instance {
  constructor(klass) {
    this.klass = klass;
    this.fields = new Map();
  }
}
export const truth = (v) => v !== false && v !== null;
export const typeOf = (v) =>
  v === null
    ? 'nil'
    : Array.isArray(v)
      ? 'list'
      : v instanceof Map
        ? 'dictionary'
        : v instanceof ClassValue
          ? 'class'
          : v instanceof Instance
            ? 'instance'
            : v instanceof Callable
              ? 'function'
              : typeof v;
export function format(
  value,
  seen = new Set(),
  budget = { left: 20000 },
  depth = 0,
) {
  if (budget.left <= 0 || depth > 16) return '…';
  budget.left--;
  if (value === null) return 'nil';
  if (value instanceof Callable) return `<fn ${value.name}>`;
  if (value instanceof ClassValue) return `<class ${value.name}>`;
  if (value instanceof Instance)
    return `<${value.klass.name} ${format(value.fields, seen, budget, depth + 1)}>`;
  if (Array.isArray(value) || value instanceof Map) {
    if (seen.has(value)) return Array.isArray(value) ? '[…]' : '{…}';
    seen.add(value);
    const parts = [];
    for (const entry of value) {
      if (budget.left <= 0) {
        parts.push('…');
        break;
      }
      parts.push(
        value instanceof Map
          ? `${String(entry[0])}: ${format(entry[1], seen, budget, depth + 1)}`
          : format(entry, seen, budget, depth + 1),
      );
    }
    seen.delete(value);
    return (
      (Array.isArray(value) ? '[' : '{') +
      parts.join(', ') +
      (Array.isArray(value) ? ']' : '}')
    );
  }
  const text = String(value);
  budget.left -= text.length;
  return text.length > 100000 ? text.slice(0, 100000) + '…' : text;
}
export function snapshot(env) {
  const values = new Map();
  for (let e = env; e && !e.builtin; e = e.parent)
    for (const [name, cell] of e.values)
      if (!values.has(name) && values.size < 30)
        values.set(name, {
          name,
          type: typeOf(cell.value),
          value: format(cell.value, new Set(), { left: 180 }).slice(0, 240),
          constant: cell.constant,
        });
  return [...values.values()];
}
export class Flow {
  constructor(kind, value = null) {
    this.kind = kind;
    this.value = value;
  }
}
