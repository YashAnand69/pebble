import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run, lex, parse, createRuntime } from '../lib/pebble/engine.js';
import { examples } from '../lib/pebble/examples.js';
function out(src, expected) {
  const r = run(src);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.deepEqual(r.output, expected.map(String));
}
test('required Fibonacci demo', () =>
  out(examples[0].source, [0, 1, 1, 2, 3, 5, 8, 13, 21, 34]));
test('independent mutable closures', () =>
  out(examples[1].source, [1, 2, 101, 3]));
test('FizzBuzz integration', () =>
  out(examples[2].source, [
    1,
    2,
    'Fizz',
    4,
    'Buzz',
    'Fizz',
    7,
    8,
    'Fizz',
    'Buzz',
    11,
    'Fizz',
    13,
    14,
    'FizzBuzz',
    16,
    17,
    'Fizz',
    19,
    'Buzz',
  ]));
test('lists and string standard library', () =>
  out(examples[3].source, [
    'HELLO, PEBBLE',
    '[0, 1, 4, 9, 16, 25, 36, 49]',
    'Items: 8',
    'Last square: 49',
  ]));
test('precedence and right associative assignment', () =>
  out('let a=0; let b=0; a=b=3; print(a,b,2+3*4, -2*4, 7%3);', [
    '3 3 14 -8 1',
  ]));
test('short circuit avoids undefined calls', () =>
  out('print(false && nope(), true || nope(), !nil, !0);', [
    'false true true false',
  ]));
test('block shadowing and lexical binding', () =>
  out(
    'let a="global"; { fn show(){print(a);} show(); let a="block"; show(); }',
    ['global', 'global'],
  ));
test('nested closures retain bindings', () =>
  out(
    'fn outer(x){fn middle(y){fn inner(z){return x+y+z;}return inner;}return middle;} print(outer(1)(2)(3));',
    [6],
  ));
test('list assignment and cyclic printing', () =>
  out('let a=[1];a[0]=a;print(a);', ['[[…]]']));
test('REPL retains definitions and expression values', () => {
  const r = createRuntime();
  assert.equal(r.run('let x=41;').ok, true);
  assert.equal(r.run('x+1;').value, '42');
  assert.equal(r.run('print(x);').output[0], '41');
});
test('lexer positions and escaped strings', () => {
  const t = lex('// hi\nlet x="a\\nb";');
  assert.equal(t[0].line, 2);
  assert.equal(t[0].col, 1);
  assert.equal(t[3].value, 'a\nb');
});
test('Pratt tree multiplication binds tighter', () => {
  const a = parse(lex('1+2*3;'));
  assert.equal(a.body[0].expression.right.operator, '*');
});
for (const [name, source, phase, message] of [
  ['invalid character', '@', 'Lexer', 'Unexpected'],
  ['unterminated string', 'print("abc);', 'Lexer', 'Unterminated'],
  ['missing semicolon', 'let x=1', 'Parser', 'Expected'],
  ['invalid assignment', '1=2;', 'Parser', 'Assignment'],
  ['top level return', 'return 1;', 'Parser', 'Return'],
  ['duplicate params', 'fn f(x,x){}', 'Parser', 'Duplicate'],
  ['undefined variable', 'print(nope);', 'Runtime', 'Undefined'],
  ['arity', 'fn f(x){} f();', 'Runtime', 'expects'],
  ['zero divisor', 'print(1/0);', 'Runtime', 'Division'],
  ['bad type', 'print("x"+1);', 'Runtime', 'number'],
  ['bounds', 'print([1][2]);', 'Runtime', 'outside'],
  ['loop limit', 'while(true){}', 'Runtime', 'limit'],
  ['recursion limit', 'fn f(){f();}f();', 'Runtime', 'depth'],
  ['duplicate declaration', 'let x=1;let x=2;', 'Runtime', 'already'],
])
  test(name, () => {
    const r = run(source);
    assert.equal(r.ok, false);
    assert.equal(r.error.phase, phase);
    assert.match(r.error.message, new RegExp(message));
    assert.ok(r.error.line >= 1);
  });
test('runtime error includes line and call trace', () => {
  const r = run(examples[4].source);
  assert.equal(r.error.line, 3);
  assert.equal(r.error.frames[0].name, 'divide');
});
test('parser rejects excessive nesting cleanly', () => {
  const r = run('('.repeat(300) + '1' + ')'.repeat(300) + ';');
  assert.equal(r.error.phase, 'Parser');
});
