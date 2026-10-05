# Pebble 2.1 — Language Studio

A real programming language and a browser workspace for building, running, and understanding small programs. The engine has a hand-written lexer, Pratt parser, and tree-walking interpreter. Pebble source never becomes JavaScript: no `eval`, code generation, or parser framework.

**[Open the studio](https://pebble-peach-kappa.vercel.app/)** · [Language grammar](docs/grammar.md) · [Version 2 changes](CHANGELOG.md)

## What's new

Version 2.1 adds an opt-in Node tensor/autodiff extension, AdamW, project-confined file I/O and binary checkpoints. [PebbleLM](https://github.com/YashAnand69/pebble-llm) defines and trains an exactly 2,000,000-parameter transformer in Pebble. See the [machine-learning guide](docs/machine-learning.md) and run `node bin/pebble.mjs examples/ml/regression.pebble --ml --compute`.


- **Modules:** multiple files, named and namespace imports, aliases, isolated module scope, exports, and a per-session module cache.
- **Objects:** dictionaries with dot/index access, classes, constructors, mutable fields, and automatically bound methods.
- **Functions:** anonymous functions, expression bodies, defaults, rest parameters, spread calls, closures, and mutual recursion.
- **Control flow:** `for … in`, `break`, `continue`, `try`/`catch`, and `throw`.
- **Expressions:** constants, compound assignments, postfix updates, exponentiation, membership, ternaries, and nil coalescing.
- **Standard library:** functional pipelines, sorting, dictionary utilities, string transformations, math, assertions, and JSON.
- **Studio:** independent saved projects, file management, project import/export, variables, execution replay, live syntax inspection, and a searchable library guide.
- **Terminal:** multi-file execution, syntax checking, syntax tree/token output, and a persistent multiline REPL.

## Try a program

The studio opens **Mission control**, a two-file project that transforms records into a report. Choose from 13 projects, including classes, data pipelines, JSON, error handling, Fibonacci, and closures. One example deliberately raises an error to demonstrate diagnostics.

```pebble
class Counter {
  fn init(start = 0) { this.value = start; }
  fn next() { this.value++; return this.value; }
}

const counter = Counter(10);
const next = counter.next;
print(range(3).map(fn(_) => next())); // [11, 12, 13]

try {
  assert(counter.value < 10, "Counter is too high");
} catch (error) {
  print(error.message);
}
```

A module exports declarations explicitly:

```pebble
// math.pebble
export fn double(n) => n * 2;

// main.pebble
import { double } from "./math.pebble";
print([1, 2, 3].map(double));
```

## Studio workflow

**Run project** executes the selected entry file in a fresh worker environment. Use ⌘/Ctrl + Enter in the editor. The REPL then continues that environment; the Variables panel reflects its mutations. Editing source marks results as stale until the next run.

**Replay** explores up to 500 recorded events from a completed run, with historical local variables and output at each event. Clicking an event navigates to its source file. This is execution replay, not a live breakpoint debugger. **Syntax** shows the currently open file's tokens and syntax tree as you edit.

Projects autosave in this browser on this device. Version 1 drafts are recovered as a separate personal project. **Export project** downloads every file as JSON; **Import** accepts that JSON or a single `.pebble` file. Export is your portable backup: clearing browser storage or switching devices does not transfer projects. Invalid stored data is preserved and autosaving pauses rather than overwriting it. Personal projects can be deleted from the Projects dialog after confirmation.

The editor supports two-space Tab indentation, automatic indentation on Enter, and Shift + Tab to move focus out. The interface also stacks for smaller screens.

## Language semantics

- Numbers are finite IEEE-754 numbers. Only `false` and `nil` are falsy; `0`, `""`, and empty collections are truthy.
- `+` adds numbers, joins two strings, or concatenates two lists. Mixed operands need explicit conversion.
- `const` prevents rebinding; it does not freeze a list, dictionary, or instance. Containers compare by identity.
- Negative list/string indices count from the end. Strings use UTF-16 code units for length, indexing, slicing, enumeration, reversal, and iteration.
- Dictionaries preserve insertion order and accept string or numeric keys. A missing index returns `nil`. With dot access, stored keys take priority over available dictionary methods; use the global function to avoid a name collision.
- Closures retain the binding cells visible at declaration. Later ordinary declarations do not change lexical lookup. Function slots are reserved within a block, so mutual recursion works after both function declarations execute.
- Functions require all non-default arguments and reject excess arguments unless they declare a rest parameter. Defaults evaluate at call time; explicit `nil` does not activate a default.
- Loops and functional collection operations iterate a shallow snapshot. `sort`, `reverse`, `slice`, and `concat` return new values; `push`, `pop`, and dictionary `set`/`delete` mutate.
- Imports beginning `./` or `../` resolve relative to the importing file; other relative paths resolve from the project root. Paths cannot escape that root. Cycles are diagnosed. Imported bindings are constant; exported containers remain shared, while primitive exports are snapshots.
- Errors retain mutations already performed. `catch` receives `message`, `phase`, `file`, `line`, and `value`. Execution, recursion, and fatal budget limits cannot be swallowed by `catch`.

The in-app **Language guide** documents syntax, function signatures, and studio controls. This release does not implement inheritance, static methods, async execution, static types, or a bytecode VM.

## Run locally

Use Node 22.13+ (Node 24 recommended).

```sh
npm ci
npm run dev:netlify
npm test
npm run typecheck
npm run build:vercel
```

A [standalone runtime package](https://github.com/YashAnand69/pebble/releases/tag/v2.1.0) bundles the interpreter and optional ML extension without UI dependencies. Build it with `npm run pack:runtime`.

The core language engine has no dependencies. The optional ML extension uses TensorFlow.js/WASM. Run ordinary programs directly with Node:

```sh
node bin/pebble.mjs examples/v2/launch/main.pebble
node bin/pebble.mjs examples/v2/launch/main.pebble --check
node bin/pebble.mjs examples/fibonacci.pebble --tokens
node bin/pebble.mjs examples/fibonacci.pebble --ast
node bin/pebble.mjs --version
node bin/pebble.mjs
```

The terminal REPL supports `.help`, `.load FILE`, `.vars`, `.reset`, and `.exit`. `.load` executes a project and keeps its environment for further expressions. `--check` checks syntax of the entry and discovered imports; it does not execute or perform static type checking. CLI imports are also checked against symlinks escaping the entry file's directory.

For embedding:

```js
import { run, createRuntime } from './lib/pebble/engine.js';

const result = run('print(2 ** 8);'); // fresh environment
const session = createRuntime({ entry: 'main.pebble', files: {} });
session.run('let score = 40;');
session.run('score += 2; score;').value; // "42"
```

## Architecture and limits

```text
source → syntax.js lexer → Pratt parser → engine.js interpreter → output
                                               ↕
                                    values.js lexical environments
                                               ↕
                                      stdlib.js built-ins
```

`worker.js` isolates browser execution. `app/studio/use-runtime.ts` manages worker lifecycle, cancellation, and a hard timeout. The UI, CLI, and optional WebMCP tool share the language engine.

| Resource                      | Limit                                                           |
| ----------------------------- | --------------------------------------------------------------- |
| Source                        | 100,000 characters per file; 30 project files                   |
| Imported project              | 500,000 characters; 100 saved projects                          |
| Execution                     | 1,000,000 steps; approximately 2.5 seconds checked periodically |
| Browser worker                | Terminated after 5 seconds; Stop terminates immediately         |
| Nested calls / parser nesting | 128 / 200                                                       |
| Collections / instance fields | 10,000 entries                                                  |
| Output                        | 1,000 print calls; 200,000 characters                           |
| Replay / variable display     | 500 events; 30 nearest bindings, abbreviated values             |

The Node test suite covers original behavior, v2 semantics, shipped projects, module isolation, budgets, project validation, CLI execution, and path confinement. CI runs tests, TypeScript checking, and the production build. Browser verification includes project creation, module edits, reload persistence, import/export, REPL variables, replay navigation, responsive layout, and the WebMCP valid/invalid-input contract.

## Deploy to Vercel

The production app is a static Vite/React bundle. `vercel.json` selects the Vite preset, builds with `npm run build:vercel`, and publishes `dist-vercel/`. It needs no environment secrets or serverless functions. Pebble programs run on the visitor's device, including the worker bundled with the app.

```sh
npx vercel link
npx vercel deploy --prod
```

The Netlify configuration is also retained: `netlify.toml` builds with `npm run build:netlify` and publishes `dist-netlify/` on Node 24. The original Sites/Vinext build remains available through `npm run dev` and `npm run build`.

## License

Pebble's source is released under the [MIT license](LICENSE), copyright 2026 Yash Anand. Dependency licenses remain with their respective authors. See [CONTRIBUTING.md](CONTRIBUTING.md) to contribute.
