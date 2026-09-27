import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run, createRuntime, resolveModule } from '../lib/pebble/engine.js';
function out(source, expected, options = {}) {
  const r = run(source, options);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.deepEqual(r.output, expected.map(String));
  return r;
}
function error(source, pattern, options = {}) {
  const r = run(source, options);
  assert.equal(r.ok, false);
  assert.match(r.error.message, pattern);
  return r;
}
test('constants and compound assignments', () => {
  out('const pi=3;let x=2;x+=3;x*=4;x-=2;x/=2;x%=4;print(x,pi);', ['1 3']);
  error('const a=2;a++;', /constant/);
});
test('exponent precedence and right associativity', () =>
  out('print(2**3**2,-2**2,(-2)**2,2**-2);', ['512 -4 4 0.25']));
test('coalescing preserves false and zero; conditional is lazy', () =>
  out('print(nil??42,false??42,0??42,true?1:nope(),false?nope():2);', [
    '42 false 0 1 2',
  ]));
test('hex binary exponents unicode and nested comments', () =>
  out(
    '/* outer /* nested */ done */ print(0xff,0b101,1_000,2.5e2,"\\u0041");',
    ['255 5 1000 250 A'],
  ));
test('for loop break continue and fresh iteration binding', () =>
  out(
    'let result=[];for (let n in range(10)){if(n==2){continue;}if(n==5){break;}push(result,fn()=>n);}print(result.map(fn(f)=>f()));',
    ['[0, 1, 3, 4]'],
  ));
test('for dictionary keys and string characters', () =>
  out('let d={a:1,b:2};for k in d {print(k,d[k]);}for c in "hi"{print(c);}', [
    'a 1',
    'b 2',
    'h',
    'i',
  ]));
test('loop control cannot escape function boundary', () =>
  error('for n in [1]{let f=fn(){break;};}', /only be used inside a loop/));
test('function defaults evaluated at call and rest parameters', () =>
  out('let n=1;fn f(a=n,...rest){return [a,rest];}n=2;print(f(),f(4,5,6));', [
    '[2, []] [4, [5, 6]]',
  ]));
test('default may use previous parameter', () =>
  out('fn f(a,b=a*2){return b;}print(f(3));', [6]));
test('anonymous functions and chained calls', () =>
  out('let add=fn(a)=>fn(b)=>a+b;print(add(2)(5));', [7]));
test('mutual recursion after declarations', () =>
  out(
    'fn even(n){return n==0?true:odd(n-1);}fn odd(n){return n==0?false:even(n-1);}print(even(10),odd(10));',
    ['true false'],
  ));
test('dictionary shorthand spreads property and indexed mutation', () =>
  out(
    'let x=2;let a={x,label:"ok"};let b={...a,x:4};b.count=3;b["count"]+=1;print(b.x,b.count,b.missing,"label" in b);',
    ['4 4 nil true'],
  ));
test('no JavaScript prototype access', () =>
  out('let d={"__proto__":42};print(d.__proto__,d.constructor);', ['42 nil']));
test('list and call spreads, negative indexing', () =>
  out(
    'fn add(a,b,c){return a+b+c;}let a=[1,...[2,3],];print(add(...a),a[-1],a.length);a[-1]=9;print(a);',
    ['6 3 3', '[1, 2, 9]'],
  ));
test('assignment reference evaluated once', () =>
  out('let n=0;fn index(){n++;return 0;}let a=[1];a[index()]+=2;print(a,n);', [
    '[3] 1',
  ]));
test('classes methods return values and bound this', () =>
  out(
    'class Counter {fn init(n=0){this.n=n;}fn next(){this.n++;return this.n;}}let a=Counter();let b=Counter(10);let next=a.next;print(next(),next(),b.next());',
    ['1 2 11'],
  ));
test('class method closure keeps this', () =>
  out(
    'class Box {fn init(v){this.v=v;}fn reader(){return fn()=>this.v;}}let b=Box(7);let f=b.reader();b.v=8;print(f());',
    [8],
  ));
test('catch runtime errors and user throws', () =>
  out(
    'try{print(1/0);}catch(e){print(e.message);}try{throw "bad input";}catch(e){print(e.value,e.phase);}',
    ['Division by zero.', 'bad input Runtime'],
  ));
test('return passes through try', () =>
  out('fn f(){try{return 3;}catch(e){return 4;}}print(f());', [3]));
test('budget errors cannot be swallowed', () => {
  const r = error('try{while(true){}}catch(e){print("hidden");}', /limit/);
  assert.equal(r.error.fatal, true);
  assert.deepEqual(r.output, []);
});
test('map filter reduce with unary and indexed callbacks', () =>
  out(
    'let a=range(6).map(fn(n)=>n*n).filter(fn(n)=>n%2==0);print(a,a.reduce(fn(a,b)=>a+b,0));print([10,20].map(fn(v,i)=>v+i));',
    ['[0, 4, 16] 20', '[10, 21]'],
  ));
test('sorting custom comparator and input preservation', () =>
  out('let a=[3,1,2];print(a.sort(),a.sort(fn(a,b)=>b-a),a);', [
    '[1, 2, 3] [3, 2, 1] [3, 1, 2]',
  ]));
test('predicate and list utility library', () =>
  out(
    'print([1,2,2].unique(),zip([1,2],[3]),enumerate("ab"));print([1,2].some(fn(x)=>x>1),[].every(fn(x)=>false),[1,2].find(fn(x)=>x>5));',
    ['[1, 2] [[1, 3]] [[0, a], [1, b]]', 'true true nil'],
  ));
test('string utilities and method syntax', () =>
  out(
    'print("  Pebble  ".trim().lower().replace("pe","ru"));print("a,b".split(",").join(" / "));print("abc".startsWith("a"),"abc".endsWith("c"),"x".repeat(3));',
    ['rubble', 'a / b', 'true true xxx'],
  ));
test('dictionary library', () =>
  out(
    'let d={a:1};set(d,"b",2);print(keys(d),values(d),entries(d),get(d,"z",7),has(d,"a"));delete(d,"a");print(len(d));',
    ['[a, b] [1, 2] [[a, 1], [b, 2]] 7 true', '1'],
  ));
test('math and conversions', () =>
  out(
    'print(sqrt(9),ceil(1.2),floor(1.8),round(1.5),pow(2,3),clamp(10,0,5),min(2,3),max(2,3),num("42"));',
    ['3 2 1 2 8 5 2 3 42'],
  ));
test('negative range step', () =>
  out('print(range(5,0,-2),range(0,5,-1));', ['[5, 3, 1] []']));
test('JSON roundtrip and special keys', () =>
  out(
    'let d=parseJSON("{\\"name\\":\\"Pebble\\",\\"v\\":[1,true,null],\\"__proto__\\":3}");print(d.name,d.v[2],d.__proto__);print(stringifyJSON({a:[1,true,nil]}));',
    ['Pebble nil 3', '{"a":[1,true,null]}'],
  ));
test('JSON cycles rejected with diagnostic', () =>
  error('let a=[];push(a,a);stringifyJSON(a);', /cyclic/));
test('module named imports aliases and private bindings', () =>
  out(
    'import { twice as double } from "./math.pebble";print(double(21));',
    [42],
    {
      files: {
        'math.pebble': 'let secret=2;export fn twice(n){return secret*n;}',
      },
    },
  ));
test('namespace imports and exported class', () =>
  out(
    'import util from "./util.pebble";let b=util.Box(3);print(b.value,util.answer);',
    ['3 42'],
    {
      files: {
        'util.pebble':
          'export const answer=42;export class Box {fn init(x){this.value=x;}}',
      },
    },
  ));
test('module evaluated once and relative nested imports', () =>
  out(
    'import a from "./lib/a.pebble";import b from "./lib/a.pebble";print(a.n,b.n);',
    ['loaded', '6 6'],
    {
      files: {
        'lib/a.pebble':
          'import { n as base } from "../n.pebble";print("loaded");export const n=base*2;',
        'n.pebble': 'export const n=3;',
      },
    },
  ));
test('imported bindings read only', () =>
  error('import {x} from "./a.pebble";x=2;', /constant/, {
    files: { 'a.pebble': 'export let x=1;' },
  }));
test('missing export diagnostic', () =>
  error('import {secret} from "./a.pebble";', /does not export/, {
    files: { 'a.pebble': 'let secret=1;' },
  }));
test('circular imports reported', () =>
  error('import a from "./a.pebble";', /Circular/, {
    files: {
      'a.pebble': 'import b from "./b.pebble";',
      'b.pebble': 'import a from "./a.pebble";',
    },
  }));
test('import errors identify originating source file', () => {
  const r = error('import a from "./a.pebble";', /Division/, {
    files: { 'a.pebble': 'export const x=1/0;' },
  });
  assert.equal(r.error.file, 'a.pebble');
});
test('module traversal constrained to project', () => {
  assert.equal(resolveModule('../b.pebble', 'lib/a.pebble'), 'b.pebble');
  assert.throws(
    () => resolveModule('../../a.pebble', 'lib/main.pebble'),
    /cannot leave/,
  );
});
test('REPL v2 retains class and instance state', () => {
  const runtime = createRuntime();
  assert.equal(
    runtime.run('class A {fn init(){this.x=1;}}let a=A();').ok,
    true,
  );
  assert.equal(runtime.run('a.x+=2; a.x;').value, '3');
});
test('trace snapshots are historical and record variables', () => {
  const r = out('let x=1;x=2;print(x);', [2]);
  assert.equal(r.trace[0].variables.find((v) => v.name === 'x').value, '1');
  assert.equal(r.variables.find((v) => v.name === 'x').value, '2');
});
test('trace capped without stopping successful program', () => {
  const r = run('for n in range(600){let x=n;}');
  assert.equal(r.ok, true);
  assert.equal(r.trace.length, 500);
  assert.equal(r.traceTruncated, true);
});
for (const [source, pattern] of [
  ['fn f(...a,b){}', /rest parameter/],
  ['fn f(a=1,b){}', /Required/],
  ['break;', /inside a loop/],
  ['range(0,10,0);', /zero/],
  ['sqrt(-1);', /supported range/],
  ['1e999;', /supported range/],
  ['0b102;', /numeric/],
  ['let a=[1];a[-2];', /outside/],
  ['const d={a:1};d=2;', /constant/],
  ['class A{fn x(){}fn x(){}}', /Duplicate/],
  ['"x".constructor;', /Unknown property/],
])
  test('reject ' + source, () => error(source, pattern));
