// Pebble's language pipeline. No eval, Function constructor, or parser framework.
export class PebbleError extends Error {
  constructor(phase, message, token = { line: 1, col: 1 }) {
    super(message);
    this.phase = phase;
    this.line = token.line;
    this.col = token.col;
    this.frames = [];
  }
}
const digit = (c) => c >= '0' && c <= '9';
const alpha = (c) =>
  !!c && ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_');
const keywords = new Set([
  'let',
  'fn',
  'if',
  'else',
  'while',
  'return',
  'true',
  'false',
  'nil',
]);
export function lex(source) {
  if (source.length > 100000)
    throw new PebbleError('Lexer', 'Source is limited to 100,000 characters.');
  const tokens = [];
  let i = 0,
    line = 1,
    col = 1;
  const advance = () => {
    const c = source[i++];
    if (c === '\n') {
      line++;
      col = 1;
    } else col++;
    return c;
  };
  while (i < source.length) {
    const c = source[i];
    if (' \r\t\n'.includes(c)) {
      advance();
      continue;
    }
    if (c === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') advance();
      continue;
    }
    const start = i,
      loc = { line, col };
    let type, value;
    if (digit(c)) {
      while (digit(source[i])) advance();
      if (source[i] === '.' && digit(source[i + 1])) {
        advance();
        while (digit(source[i])) advance();
      }
      type = 'NUMBER';
      value = Number(source.slice(start, i));
    } else if (alpha(c)) {
      while (alpha(source[i]) || digit(source[i])) advance();
      value = source.slice(start, i);
      type = keywords.has(value) ? value : 'IDENT';
    } else if (c === '"' || c === "'") {
      const quote = advance();
      value = '';
      while (i < source.length && source[i] !== quote) {
        if (source[i] === '\\') {
          advance();
          const esc = advance();
          const escapes = {
            n: '\n',
            t: '\t',
            r: '\r',
            '\\': '\\',
            '"': '"',
            "'": "'",
          };
          if (!(esc in escapes))
            throw new PebbleError('Lexer', 'Unknown string escape.', loc);
          value += escapes[esc];
        } else value += advance();
      }
      if (i >= source.length)
        throw new PebbleError(
          'Lexer',
          'Unterminated string. Add a closing quote.',
          loc,
        );
      advance();
      type = 'STRING';
    } else {
      const pair = source.slice(i, i + 2);
      if (['==', '!=', '<=', '>=', '&&', '||'].includes(pair)) {
        advance();
        advance();
        type = pair;
      } else if ('+-*/%!=<>(){}[];,'.includes(c)) {
        type = advance();
      } else
        throw new PebbleError('Lexer', `Unexpected character '${c}'.`, loc);
      value = type;
    }
    tokens.push({
      type,
      value,
      text: source.slice(start, i),
      start,
      end: i,
      ...loc,
    });
  }
  tokens.push({
    type: 'EOF',
    value: null,
    text: '',
    start: i,
    end: i,
    line,
    col,
  });
  return tokens;
}
const precedence = {
  '=': 1,
  '||': 2,
  '&&': 3,
  '==': 4,
  '!=': 4,
  '<': 5,
  '<=': 5,
  '>': 5,
  '>=': 5,
  '+': 6,
  '-': 6,
  '*': 7,
  '/': 7,
  '%': 7,
};
export function parse(tokens) {
  let i = 0,
    fnDepth = 0,
    depth = 0;
  const peek = () => tokens[i],
    match = (t) => (peek().type === t ? (i++, true) : false);
  const need = (t) => {
    if (peek().type !== t)
      throw new PebbleError(
        'Parser',
        `Expected '${t}', found ${peek().type === 'EOF' ? 'end of input' : `'${peek().text}'`}.`,
        peek(),
      );
    return tokens[i++];
  };
  const node = (kind, t, fields = {}) => ({
    kind,
    line: t.line,
    col: t.col,
    ...fields,
  });
  function expr(min = 1) {
    if (++depth > 200)
      throw new PebbleError(
        'Parser',
        'Expression nesting is limited to 200 levels.',
        peek(),
      );
    const t = peek();
    i++;
    let left;
    if (['NUMBER', 'STRING', 'true', 'false', 'nil'].includes(t.type))
      left = node('Literal', t, {
        value:
          t.type === 'true'
            ? true
            : t.type === 'false'
              ? false
              : t.type === 'nil'
                ? null
                : t.value,
      });
    else if (t.type === 'IDENT')
      left = node('Identifier', t, { name: t.value });
    else if (t.type === '-' || t.type === '!')
      left = node('Unary', t, { operator: t.type, argument: expr(8) });
    else if (t.type === '(') {
      left = expr();
      need(')');
    } else if (t.type === '[') {
      const elements = [];
      if (peek().type !== ']') {
        do {
          elements.push(expr());
        } while (match(','));
      }
      need(']');
      left = node('List', t, { elements });
    } else
      throw new PebbleError(
        'Parser',
        `Expected an expression, found '${t.text || 'end of input'}'.`,
        t,
      );
    while (true) {
      if (peek().type === '(') {
        const call = peek();
        i++;
        const args = [];
        if (peek().type !== ')') {
          do {
            args.push(expr());
          } while (match(','));
        }
        need(')');
        left = node('Call', call, { callee: left, args });
        continue;
      }
      if (match('[')) {
        const index = expr();
        need(']');
        left = node('Index', t, { object: left, index });
        continue;
      }
      const op = peek(),
        p = precedence[op.type];
      if (!p || p < min) break;
      i++;
      const right = expr(p + (op.type === '=' ? 0 : 1));
      if (op.type === '=') {
        if (!['Identifier', 'Index'].includes(left.kind))
          throw new PebbleError(
            'Parser',
            'Assignment needs a variable or list index on the left.',
            op,
          );
        left = node('Assign', op, { target: left, value: right });
      } else left = node('Binary', op, { operator: op.type, left, right });
    }
    depth--;
    return left;
  }
  function block() {
    const t = need('{'),
      body = [];
    while (!['}', 'EOF'].includes(peek().type)) body.push(stmt());
    need('}');
    return node('Block', t, { body });
  }
  function stmt() {
    if (++depth > 200)
      throw new PebbleError(
        'Parser',
        'Statement nesting is limited to 200 levels.',
        peek(),
      );
    try {
      return statement();
    } finally {
      depth--;
    }
  }
  function statement() {
    const t = peek();
    if (match('let')) {
      const name = need('IDENT').value;
      need('=');
      const value = expr();
      need(';');
      return node('Let', t, { name, value });
    }
    if (match('fn')) {
      const name = need('IDENT').value;
      need('(');
      const params = [];
      if (peek().type !== ')') {
        do {
          const p = need('IDENT');
          if (params.includes(p.value))
            throw new PebbleError(
              'Parser',
              `Duplicate parameter '${p.value}'.`,
              p,
            );
          params.push(p.value);
        } while (match(','));
      }
      need(')');
      fnDepth++;
      const body = block();
      fnDepth--;
      return node('Function', t, { name, params, body });
    }
    if (match('if')) {
      need('(');
      const condition = expr();
      need(')');
      const then = block();
      const otherwise = match('else')
        ? peek().type === 'if'
          ? stmt()
          : block()
        : null;
      return node('If', t, { condition, then, otherwise });
    }
    if (match('while')) {
      need('(');
      const condition = expr();
      need(')');
      return node('While', t, { condition, body: block() });
    }
    if (match('return')) {
      if (!fnDepth)
        throw new PebbleError(
          'Parser',
          'Return can only be used inside a function.',
          t,
        );
      const value = peek().type === ';' ? null : expr();
      need(';');
      return node('Return', t, { value });
    }
    if (peek().type === '{') return block();
    const expression = expr();
    need(';');
    return node('Expression', t, { expression });
  }
  const body = [];
  while (peek().type !== 'EOF') body.push(stmt());
  return { kind: 'Program', line: 1, col: 1, body };
}
class Environment {
  constructor(parent = null) {
    this.parent = parent;
    this.values = new Map();
  }
  define(name, value, n) {
    if (this.values.has(name))
      throw new PebbleError(
        'Runtime',
        `'${name}' is already declared in this scope.`,
        n,
      );
    this.values.set(name, { value });
  }
  cell(name, n) {
    if (this.values.has(name)) return this.values.get(name);
    if (this.parent) return this.parent.cell(name, n);
    throw new PebbleError('Runtime', `Undefined variable '${name}'.`, n);
  }
  // Capture visible bindings by reference, preventing later declarations from changing lexical lookup.
  capture() {
    const copy = new Environment(this.parent?.capture());
    copy.values = new Map(this.values);
    return copy;
  }
}
export function format(value, seen = new Set()) {
  if (value === null) return 'nil';
  if (typeof value === 'object' && value?.call) return `<fn ${value.name}>`;
  if (Array.isArray(value)) {
    if (seen.has(value)) return '[…]';
    seen.add(value);
    const out = '[' + value.map((v) => format(v, seen)).join(', ') + ']';
    seen.delete(value);
    return out;
  }
  return String(value);
}
const truth = (v) => v !== false && v !== null;
class ReturnValue {
  constructor(value) {
    this.value = value;
  }
}
export function createRuntime() {
  const global = new Environment();
  let output = [],
    steps = 0,
    calls = 0,
    callDepth = 0,
    trace = [],
    started = 0;
  const fail = (message, n) => {
    throw new PebbleError('Runtime', message, n);
  };
  const number = (v, n) => {
    if (typeof v !== 'number') fail('Expected a number.', n);
    return v;
  };
  const sequence = (v, n) => {
    if (!Array.isArray(v) && typeof v !== 'string')
      fail('Expected a list or string.', n);
    return v;
  };
  function tick(n) {
    if (++steps > 200000 || performance.now() - started > 1500)
      fail(
        'Execution limit reached. Check for an endless loop or reduce the input.',
        n,
      );
    if (
      trace.length < 300 &&
      ['Let', 'Assign', 'Call', 'Return', 'If', 'While'].includes(n.kind)
    )
      trace.push({
        step: steps,
        kind: n.kind,
        line: n.line,
        detail: n.name || n.callee?.name || n.target?.name || '',
      });
  }
  function native(name, arity, call) {
    global.define(name, { name, arity, call });
  }
  native('print', -1, (args, n) => {
    if (output.length >= 1000) fail('Output limit reached (1,000 lines).', n);
    const text = args.map((v) => format(v)).join(' ');
    if (text.length > 100000) fail('Printed value is too large.', n);
    output.push(text);
    return null;
  });
  native('len', 1, ([v], n) => sequence(v, n).length);
  native('str', 1, ([v]) => format(v));
  native('type', 1, ([v]) =>
    v === null
      ? 'nil'
      : Array.isArray(v)
        ? 'list'
        : typeof v === 'object'
          ? 'function'
          : typeof v,
  );
  native('range', -1, (a, n) => {
    if (a.length !== 1 && a.length !== 2)
      fail('range expects 1 or 2 arguments.', n);
    const start = a.length === 1 ? 0 : number(a[0], n),
      end = number(a.at(-1), n);
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      end - start > 10000
    )
      fail('range needs integers and at most 10,000 items.', n);
    return Array.from(
      { length: Math.max(0, end - start) },
      (_, i) => start + i,
    );
  });
  native('push', 2, ([list, value], n) => {
    if (!Array.isArray(list)) fail('push expects a list.', n);
    if (list.length >= 10000) fail('List limit reached (10,000 items).', n);
    list.push(value);
    return list.length;
  });
  native('upper', 1, ([v], n) => {
    if (typeof v !== 'string') fail('upper expects a string.', n);
    return v.toUpperCase();
  });
  native('lower', 1, ([v], n) => {
    if (typeof v !== 'string') fail('lower expects a string.', n);
    return v.toLowerCase();
  });
  native('abs', 1, ([v], n) => Math.abs(number(v, n)));
  native('floor', 1, ([v], n) => Math.floor(number(v, n)));
  function index(n, e) {
    const object = sequence(evaluate(n.object, e), n),
      i = number(evaluate(n.index, e), n);
    if (!Number.isInteger(i) || i < 0 || i >= object.length)
      fail(`Index ${i} is outside this sequence (length ${object.length}).`, n);
    return { object, i };
  }
  function evaluate(n, e) {
    tick(n);
    switch (n.kind) {
      case 'Literal':
        return n.value;
      case 'Identifier':
        return e.cell(n.name, n).value;
      case 'List':
        return n.elements.map((x) => evaluate(x, e));
      case 'Index': {
        const { object, i } = index(n, e);
        return object[i];
      }
      case 'Assign': {
        if (n.target.kind === 'Identifier') {
          const cell = e.cell(n.target.name, n);
          cell.value = evaluate(n.value, e);
          return cell.value;
        }
        const { object, i } = index(n.target, e);
        if (!Array.isArray(object))
          fail('Strings cannot be changed by index.', n);
        return (object[i] = evaluate(n.value, e));
      }
      case 'Unary': {
        const v = evaluate(n.argument, e);
        return n.operator === '!' ? !truth(v) : -number(v, n);
      }
      case 'Binary': {
        const a = evaluate(n.left, e),
          op = n.operator;
        if (op === '&&') return truth(a) ? evaluate(n.right, e) : a;
        if (op === '||') return truth(a) ? a : evaluate(n.right, e);
        const b = evaluate(n.right, e);
        if (op === '==') return a === b;
        if (op === '!=') return a !== b;
        if (op === '+' && typeof a === 'string' && typeof b === 'string') {
          if (a.length + b.length > 100000)
            fail('String limit reached (100,000 characters).', n);
          return a + b;
        }
        number(a, n);
        number(b, n);
        if ((op === '/' || op === '%') && b === 0) fail('Division by zero.', n);
        const v =
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
                    : op === '<'
                      ? a < b
                      : op === '<='
                        ? a <= b
                        : op === '>'
                          ? a > b
                          : a >= b;
        if (typeof v === 'number' && !Number.isFinite(v))
          fail('Number is outside the supported range.', n);
        return v;
      }
      case 'Call': {
        const fn = evaluate(n.callee, e);
        if (!fn || typeof fn.call !== 'function')
          fail('This value is not callable.', n);
        const args = n.args.map((x) => evaluate(x, e));
        if (fn.arity >= 0 && args.length !== fn.arity)
          fail(
            `${fn.name} expects ${fn.arity} argument(s), got ${args.length}.`,
            n,
          );
        if (++callDepth > 100) {
          callDepth--;
          fail(
            'Call depth limit reached (100). Check your recursion base case.',
            n,
          );
        }
        calls++;
        try {
          return fn.call(args, n);
        } catch (err) {
          if (err instanceof PebbleError && err.frames.length < 12)
            err.frames.push({ name: fn.name, line: n.line });
          throw err;
        } finally {
          callDepth--;
        }
      }
      default:
        fail(`Unknown expression ${n.kind}.`, n);
    }
  }
  function execute(n, e) {
    tick(n);
    switch (n.kind) {
      case 'Program': {
        let v = null;
        for (const s of n.body) v = execute(s, e);
        return v;
      }
      case 'Block': {
        const local = new Environment(e);
        let v = null;
        for (const s of n.body) v = execute(s, local);
        return v;
      }
      case 'Let':
        e.define(n.name, evaluate(n.value, e), n);
        return null;
      case 'Expression':
        return evaluate(n.expression, e);
      case 'Function': {
        e.define(n.name, null, n);
        const closed = e.capture();
        e.cell(n.name, n).value = {
          name: n.name,
          arity: n.params.length,
          call(args) {
            const local = new Environment(closed);
            n.params.forEach((p, i) => local.define(p, args[i], n));
            try {
              for (const s of n.body.body) execute(s, local);
            } catch (r) {
              if (r instanceof ReturnValue) return r.value;
              throw r;
            }
            return null;
          },
        };
        return null;
      }
      case 'If':
        return truth(evaluate(n.condition, e))
          ? execute(n.then, e)
          : n.otherwise
            ? execute(n.otherwise, e)
            : null;
      case 'While':
        while (truth(evaluate(n.condition, e))) execute(n.body, e);
        return null;
      case 'Return':
        throw new ReturnValue(n.value ? evaluate(n.value, e) : null);
      default:
        fail(`Unknown statement ${n.kind}.`, n);
    }
  }
  return {
    run(source) {
      output = [];
      steps = 0;
      calls = 0;
      callDepth = 0;
      trace = [];
      started = performance.now();
      let tokens = [],
        ast = null;
      try {
        tokens = lex(source);
        ast = parse(tokens);
        const value = execute(ast, global);
        return {
          ok: true,
          output,
          tokens,
          ast,
          trace,
          steps,
          calls,
          value: format(value),
          duration: performance.now() - started,
        };
      } catch (e) {
        const error =
          e instanceof PebbleError
            ? e
            : new PebbleError('Runtime', e.message || 'Execution failed.');
        return {
          ok: false,
          output,
          tokens,
          ast,
          trace,
          steps,
          calls,
          duration: performance.now() - started,
          error: {
            phase: error.phase,
            message: error.message,
            line: error.line,
            col: error.col,
            frames: error.frames,
          },
        };
      }
    },
  };
}
export const run = (source) => createRuntime().run(source);
