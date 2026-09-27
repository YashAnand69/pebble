export const KEYWORDS = new Set([
  'let',
  'const',
  'fn',
  'if',
  'else',
  'while',
  'for',
  'in',
  'break',
  'continue',
  'return',
  'true',
  'false',
  'nil',
  'try',
  'catch',
  'throw',
  'class',
  'this',
  'import',
  'from',
  'as',
  'export',
]);
export class PebbleError extends Error {
  constructor(phase, message, token = { line: 1, col: 1 }, fatal = false) {
    super(message);
    this.phase = phase;
    this.line = token.line || 1;
    this.col = token.col || 1;
    this.file = token.file || 'main.pebble';
    this.frames = [];
    this.fatal = fatal;
  }
}
const digit = (c) => c >= '0' && c <= '9';
const alpha = (c) =>
  !!c && ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_');
export function lex(source, file = 'main.pebble') {
  if (typeof source !== 'string' || source.length > 100000)
    throw new PebbleError('Lexer', 'Source is limited to 100,000 characters.', {
      file,
    });
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
  const fail = (m, t) => {
    throw new PebbleError('Lexer', m, t);
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
    if (c === '/' && source[i + 1] === '*') {
      const loc = { line, col, file };
      advance();
      advance();
      let nesting = 1;
      while (i < source.length && nesting) {
        if (source.slice(i, i + 2) === '/*') {
          advance();
          advance();
          nesting++;
        } else if (source.slice(i, i + 2) === '*/') {
          advance();
          advance();
          nesting--;
        } else advance();
      }
      if (nesting) fail('Unterminated block comment.', loc);
      continue;
    }
    const start = i,
      loc = { line, col, file };
    let type, value;
    if (digit(c)) {
      if (c === '0' && ['x', 'b'].includes(source[i + 1])) {
        const base = source[i + 1];
        advance();
        advance();
        const begin = i;
        while (
          digit(source[i]) ||
          (base === 'x' && source[i] && 'abcdefABCDEF'.includes(source[i]))
        )
          advance();
        const raw = source.slice(begin, i);
        if (
          !raw ||
          (base === 'b' && raw.split('').some((c) => c !== '0' && c !== '1'))
        )
          fail('Invalid numeric literal.', loc);
        value = parseInt(raw, base === 'x' ? 16 : 2);
      } else {
        while (digit(source[i]) || source[i] === '_') advance();
        if (source[i] === '.' && digit(source[i + 1])) {
          advance();
          while (digit(source[i]) || source[i] === '_') advance();
        }
        if (source[i] === 'e' || source[i] === 'E') {
          advance();
          if (source[i] === '+' || source[i] === '-') advance();
          if (!digit(source[i]))
            fail('Expected digits after the exponent.', loc);
          while (digit(source[i])) advance();
        }
        const raw = source.slice(start, i);
        if (
          raw.endsWith('_') ||
          raw.includes('__') ||
          raw.includes('_.') ||
          raw.includes('._') ||
          raw.includes('_e') ||
          raw.includes('_E')
        )
          fail('Place numeric separators between digits.', loc);
        value = Number(raw.replaceAll('_', ''));
      }
      if (!Number.isFinite(value))
        fail('Number is outside the supported range.', loc);
      type = 'NUMBER';
    } else if (alpha(c)) {
      while (alpha(source[i]) || digit(source[i])) advance();
      value = source.slice(start, i);
      type = KEYWORDS.has(value) ? value : 'IDENT';
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
          if (esc === 'u') {
            const hex = source.slice(i, i + 4);
            if (
              hex.length !== 4 ||
              hex.split('').some((x) => !'0123456789abcdefABCDEF'.includes(x))
            )
              fail('Unicode escapes need four hexadecimal digits.', loc);
            for (let k = 0; k < 4; k++) advance();
            value += String.fromCharCode(parseInt(hex, 16));
          } else {
            if (!(esc in escapes)) fail('Unknown string escape.', loc);
            value += escapes[esc];
          }
        } else value += advance();
      }
      if (i >= source.length)
        fail('Unterminated string. Add a closing quote.', loc);
      advance();
      type = 'STRING';
    } else {
      const triple = source.slice(i, i + 3),
        pair = source.slice(i, i + 2);
      if (triple === '...') {
        advance();
        advance();
        advance();
        type = triple;
      } else if (
        [
          '==',
          '!=',
          '<=',
          '>=',
          '&&',
          '||',
          '+=',
          '-=',
          '*=',
          '/=',
          '%=',
          '++',
          '--',
          '**',
          '??',
          '=>',
        ].includes(pair)
      ) {
        advance();
        advance();
        type = pair;
      } else if ('+-*/%!=<>(){}[];,:.?'.includes(c)) type = advance();
      else fail(`Unexpected character '${c}'.`, loc);
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
    file,
  });
  return tokens;
}
const precedence = {
  '=': 1,
  '+=': 1,
  '-=': 1,
  '*=': 1,
  '/=': 1,
  '%=': 1,
  '??': 3,
  '||': 4,
  '&&': 5,
  '==': 6,
  '!=': 6,
  '<': 7,
  '<=': 7,
  '>': 7,
  '>=': 7,
  in: 7,
  '+': 8,
  '-': 8,
  '*': 9,
  '/': 9,
  '%': 9,
  '**': 11,
};
export function parse(tokens) {
  let i = 0,
    fnDepth = 0,
    loopDepth = 0,
    depth = 0,
    scopeDepth = 0;
  const peek = () => tokens[Math.min(i, tokens.length - 1)],
    match = (t) => (peek().type === t ? (i++, true) : false);
  const fail = (m, t = peek()) => {
    throw new PebbleError('Parser', m, t);
  };
  const need = (t) => {
    if (peek().type !== t)
      fail(
        `Expected '${t}', found ${peek().type === 'EOF' ? 'end of input' : `'${peek().text}'`}.`,
      );
    return tokens[i++];
  };
  const node = (kind, t, fields = {}) => ({
    kind,
    line: t.line,
    col: t.col,
    file: t.file,
    ...fields,
  });
  const assignable = (n) => ['Identifier', 'Index', 'Member'].includes(n.kind);
  function items(end, read) {
    const result = [];
    while (peek().type !== end) {
      result.push(read());
      if (!match(',')) break;
    }
    need(end);
    return result;
  }
  function fn(t, name = null) {
    need('(');
    let optional = false,
      restSeen = false;
    const params = items(')', () => {
      if (restSeen) fail('A rest parameter must be last.');
      const rest = match('...'),
        p = need('IDENT');
      const value = match('=') ? expr() : null;
      if (rest && value) fail('A rest parameter cannot have a default.', p);
      if (!rest && !value && optional)
        fail('Required parameters must come before defaults.', p);
      optional ||= !!value;
      restSeen = rest;
      return { name: p.value, value, rest };
    });
    const names = params.map((p) => p.name);
    if (new Set(names).size !== names.length)
      fail('Duplicate parameter name.', t);
    const oldLoop = loopDepth;
    loopDepth = 0;
    fnDepth++;
    let body;
    if (match('=>')) body = node('ExpressionBody', t, { expression: expr() });
    else body = block();
    fnDepth--;
    loopDepth = oldLoop;
    return node(name ? 'Function' : 'Lambda', t, { name, params, body });
  }
  function expr(min = 1) {
    if (++depth > 200) fail('Expression nesting is limited to 200 levels.');
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
    else if (t.type === 'IDENT' || t.type === 'this')
      left = node('Identifier', t, { name: t.value });
    else if (['-', '!', '+'].includes(t.type))
      left = node('Unary', t, { operator: t.type, argument: expr(10) });
    else if (t.type === '(') {
      left = expr();
      need(')');
    } else if (t.type === 'fn') left = fn(t);
    else if (t.type === '[')
      left = node('List', t, { elements: items(']', spreadItem) });
    else if (t.type === '{')
      left = node('Dictionary', t, {
        entries: items('}', () => {
          if (match('...')) return { spread: expr() };
          const key = peek();
          if (!['IDENT', 'STRING', 'NUMBER'].includes(key.type))
            fail('Dictionary keys must be names, strings, or numbers.');
          i++;
          const value = match(':')
            ? expr()
            : key.type === 'IDENT'
              ? node('Identifier', key, { name: key.value })
              : fail("Expected ':' after dictionary key.");
          return { key: key.value, value };
        }),
      });
    else
      fail(`Expected an expression, found '${t.text || 'end of input'}'.`, t);
    while (true) {
      if (peek().type === '(') {
        const call = peek();
        i++;
        left = node('Call', call, {
          callee: left,
          args: items(')', spreadItem),
        });
        continue;
      }
      if (match('[')) {
        const idx = expr();
        need(']');
        left = node('Index', t, { object: left, index: idx });
        continue;
      }
      if (match('.')) {
        const prop = need('IDENT');
        left = node('Member', prop, { object: left, name: prop.value });
        continue;
      }
      if (['++', '--'].includes(peek().type)) {
        const op = peek();
        i++;
        if (!assignable(left))
          fail('Update needs a variable, property, or index.', op);
        left = node('Update', op, { target: left, operator: op.type });
        continue;
      }
      if (peek().type === '?' && min <= 2) {
        i++;
        const then = expr();
        need(':');
        left = node('Conditional', t, {
          condition: left,
          // oxlint-disable-next-line unicorn/no-thenable -- AST child node, never a callable Promise method.
          then,
          otherwise: expr(2),
        });
        continue;
      }
      const op = peek(),
        p = precedence[op.type];
      if (!p || p < min) break;
      i++;
      const right = expr(p + (p === 1 || op.type === '**' ? 0 : 1));
      if (p === 1) {
        if (!assignable(left))
          fail(
            'Assignment needs a variable, property, or list index on the left.',
            op,
          );
        left = node('Assign', op, {
          target: left,
          value: right,
          operator: op.type,
        });
      } else left = node('Binary', op, { operator: op.type, left, right });
    }
    depth--;
    return left;
  }
  function spreadItem() {
    const t = peek();
    return match('...') ? node('Spread', t, { argument: expr() }) : expr();
  }
  function block() {
    const t = need('{'),
      body = [];
    scopeDepth++;
    while (!['}', 'EOF'].includes(peek().type)) body.push(stmt());
    need('}');
    scopeDepth--;
    return node('Block', t, { body });
  }
  function stmt() {
    if (++depth > 200) fail('Statement nesting is limited to 200 levels.');
    try {
      return statement();
    } finally {
      depth--;
    }
  }
  function statement() {
    const t = peek();
    if (match(';')) return node('Empty', t);
    if (['let', 'const'].includes(t.type)) {
      i++;
      const name = need('IDENT').value;
      need('=');
      const value = expr();
      need(';');
      return node('Let', t, { name, value, constant: t.type === 'const' });
    }
    if (t.type === 'fn' && tokens[i + 1]?.type === 'IDENT') {
      i++;
      const f = fn(t, need('IDENT').value);
      if (f.body.kind === 'ExpressionBody') need(';');
      return f;
    }
    if (match('if')) {
      need('(');
      const condition = expr();
      need(')');
      const then = block(),
        otherwise = match('else')
          ? peek().type === 'if'
            ? stmt()
            : block()
          : null;
      // oxlint-disable-next-line unicorn/no-thenable -- AST child node, never a callable Promise method.
      return node('If', t, { condition, then, otherwise });
    }
    if (match('while')) {
      need('(');
      const condition = expr();
      need(')');
      loopDepth++;
      const body = block();
      loopDepth--;
      return node('While', t, { condition, body });
    }
    if (match('for')) {
      const parens = match('(');
      match('let');
      const name = need('IDENT').value;
      need('in');
      const iterable = expr();
      if (parens) need(')');
      loopDepth++;
      const body = block();
      loopDepth--;
      return node('For', t, { name, iterable, body });
    }
    if (match('break') || match('continue')) {
      if (!loopDepth) fail(`${t.type} can only be used inside a loop.`, t);
      need(';');
      return node(t.type === 'break' ? 'Break' : 'Continue', t);
    }
    if (match('return')) {
      if (!fnDepth) fail('Return can only be used inside a function.', t);
      const value = peek().type === ';' ? null : expr();
      need(';');
      return node('Return', t, { value });
    }
    if (match('throw')) {
      const value = expr();
      need(';');
      return node('Throw', t, { value });
    }
    if (match('try')) {
      const body = block();
      need('catch');
      need('(');
      const name = need('IDENT').value;
      need(')');
      return node('Try', t, { body, name, handler: block() });
    }
    if (match('class')) {
      const name = need('IDENT').value;
      need('{');
      const methods = [];
      while (!['}', 'EOF'].includes(peek().type)) {
        const m = need('fn');
        const method = fn(m, need('IDENT').value);
        if (method.body.kind === 'ExpressionBody') need(';');
        methods.push(method);
      }
      need('}');
      if (new Set(methods.map((m) => m.name)).size !== methods.length)
        fail('Duplicate method name.', t);
      return node('Class', t, { name, methods });
    }
    if (match('import')) {
      if (scopeDepth || fnDepth) fail('Imports must be at the top level.', t);
      const names = [];
      if (match('{')) {
        names.push(
          ...items('}', () => {
            const name = need('IDENT').value;
            return { name, alias: match('as') ? need('IDENT').value : name };
          }),
        );
      } else {
        const alias = need('IDENT').value;
        names.push({ name: '*', alias });
      }
      need('from');
      const path = need('STRING').value;
      need(';');
      return node('Import', t, { names, path });
    }
    if (match('export')) {
      if (scopeDepth || fnDepth) fail('Exports must be at the top level.', t);
      const declaration = stmt();
      if (!['Let', 'Function', 'Class'].includes(declaration.kind))
        fail('Export a variable, function, or class declaration.', t);
      return node('Export', t, { declaration });
    }
    if (peek().type === '{') return block();
    const expression = expr();
    need(';');
    return node('Expression', t, { expression });
  }
  const body = [];
  while (peek().type !== 'EOF') body.push(stmt());
  return node('Program', tokens[0], { body });
}
