# Pebble — Language Studio

A small, real programming language, with a browser studio that lets you see how it works. There is no `eval`, JavaScript code generation, or parser framework in the engine.

## Try it

Open the web app, pick Fibonacci, and press **Run code** (or ⌘/Ctrl + Enter). Edit the source, inspect **Tokens**, expand the **AST**, or follow the first 300 events in **Trace**. Click an event or token to jump to its source. The REPL continues the last run's environment: try `fib(12)`.

Code drafts are saved only on the current device. Download exports a `.pebble` file. Reset restores the selected example. A Web Worker keeps execution off the main browser thread, with both interpreter budgets and a termination timeout.

## How it works

```
source → lexer → tokens → Pratt parser → syntax tree → interpreter → output
                                                        ↕
                                              lexical environments
```

`lib/pebble/engine.js` contains a character-by-character lexer, recursive descent statements, Pratt expression parsing, and a tree-walking interpreter. Every token and node carries source positions. Environments hold mutable binding cells. Functions capture the visible cells, so returned closures retain state without allowing later declarations to change lexical lookup. Each phase produces its own diagnostics.

## Language

- Numbers, strings with escapes, booleans, `nil`, mutable lists, functions.
- `let`, assignment, arithmetic, remainder, comparisons, short-circuit `&&` / `||`.
- Braced `if` / `else`, `while`, block scopes, functions, return, recursion, closures.
- Built-ins: `print`, `len`, `range`, `push`, `str`, `type`, `upper`, `lower`, `abs`, `floor`.
- Only `false` and `nil` are falsy. Arithmetic is numeric; `+` also joins two strings. Use `str` for explicit conversion.

## Run locally

Use Node 22.13+ (Node 24 recommended).

```sh
npm install
npm run dev
node bin/pebble.mjs examples/fibonacci.pebble
node bin/pebble.mjs  # persistent, multiline terminal REPL
node --test tests/engine.test.mjs
npm run build
```

The app uses the generated Sites/Vinext/React scaffold. The language core has no dependencies and can run independently in Node or a Web Worker.

## Limits and verification

28 engine regression tests cover the required Fibonacci demo, independent closures, lexical shadowing, lists, REPL persistence, parser precedence, diagnostics, and runaway programs. Runtime budgets: 200,000 node visits, 100 nested calls, 1,000 output lines, 10,000 list items. A browser worker is terminated after 3 seconds. Results are for the last run; edited code is marked until run again.

This release intentionally delivers the full interpreter rather than claiming a bytecode VM. Hash maps, static typing, optimizations, and a VM remain future work. Forward references to functions declared later are not supported; define a function before capturing it. Numbers use JavaScript's IEEE-754 representation. Runtime errors preserve mutations already performed, including in the REPL.

An optional WebMCP `run_pebble_program` tool uses the same execution path when the browser supports it. The current development environment had no supported WebMCP validation context, so its contract has not been verified in-browser.
