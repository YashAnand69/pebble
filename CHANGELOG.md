# Changelog

## 2.1.0 — 2026-10-05

Released the project under MIT. Added trusted host extensions and native values, opt-in CLI tensor/autodiff operations backed by TensorFlow.js/WASM, causal attention, non-affine LayerNorm, GELU, masked cross entropy, seeded initialization/sampling, AdamW with gradient clipping, project-confined file access and validated float32 checkpoints. Added a long-job CLI mode with streaming output. Default browser budgets and the dependency-free interpreter remain unchanged.

The separate public PebbleLM project defines and trains an exactly two-million-parameter transformer using Pebble programs. Added ML documentation, an executable regression example, gradient/causality/memory/checkpoint/path tests and contribution guidance.

## 2.0.0 — 2026-09-27

### Language

Added multi-file modules, named/namespace imports and exports, dictionaries, classes with bound methods, anonymous functions, expression-bodied functions, default/rest arguments, collection/call spread, for-in loops, loop control, recoverable errors, constants, compound assignment, postfix updates, exponentiation, membership, ternaries, and nil coalescing. The lexer now supports nested block comments, numeric separators, hexadecimal/binary numbers, exponents, and Unicode escapes.

Expanded the standard library with functional collections, sorting, dictionary operations, string utilities, math, assertions, and JSON. Improved source-aware diagnostics, historical scope snapshots, resource bounds, and mutual recursion while preserving existing lexical-shadow behavior.

### Studio

Rebuilt the workspace around independent multi-file projects, 13 runnable examples, project backups, file management, entry selection, persistent REPL inspection, execution replay, live syntax inspection, and a searchable reference. Added responsive layouts, versioned local saves, recovery of v1 drafts, and protection against overwriting invalid saved work.

### Developer tools

Added multi-file CLI loading, syntax-only checks, version/help flags, and REPL project loading and variable inspection. Expanded regression coverage and CI to validate the language, project format, CLI, types, and production bundle.

### Compatibility notes

Existing v1 examples and regression tests remain supported. Dictionaries and modules use the explicit semantics documented in the README. `const` is shallow; import bindings are read-only; primitive exports are snapshots; module cycles are rejected. Replay captures completed execution and is not a live debugger.
