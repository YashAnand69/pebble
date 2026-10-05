# Pebble standalone runtime

A small interpreted programming language with modules, classes, dictionaries, closures and an optional machine-learning extension. Source is MIT licensed. This distribution includes the interpreter, CLI, documentation and examples without the browser studio's UI dependencies.

Use Node 24 (minimum 22.13). Install the release package locally:

```sh
npm install https://github.com/YashAnand69/pebble/releases/download/v2.1.1/pebble-runtime-2.1.1.tgz
npx pebble --version
npx pebble path/to/program.pebble
```

With no filename, the CLI starts a persistent multiline REPL. `--check`, `--tokens` and `--ast` inspect programs without executing them.

## Machine learning

```sh
npx pebble node_modules/pebble-runtime/examples/ml/regression.pebble --ml --compute
```

`--ml` explicitly enables float32 tensors, automatic differentiation, causal attention, LayerNorm, GELU, masked cross entropy, AdamW and seeded sampling. TensorFlow.js/WASM 4.22.0 supplies the numerical operations. `--io` enables project-confined file access and validated binary checkpoints. `--compute` permits long trusted jobs and streams output. Ordinary programs and the browser studio keep their default execution limits.

[Read the ML guide](docs/machine-learning.md). [PebbleLM](https://github.com/YashAnand69/pebble-llm) defines and trains an exactly 2,000,000-parameter transformer in Pebble, with source, original data and released weights.

## Embed

```js
import {run} from 'pebble-runtime';
console.log(run('print(2 ** 8);').output);
```

The core engine has no dependencies. The optional ML extension loads its tensor dependencies only when enabled. See the package's `sourceCommit` field for the exact upstream revision. TensorFlow.js and its WASM backend retain their Apache-2.0 licenses.

[Source](https://github.com/YashAnand69/pebble) · [Browser studio](https://pebble-peach-kappa.vercel.app/) · [MIT license](LICENSE)
