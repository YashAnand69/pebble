# Contributing to Pebble

Pebble is MIT licensed. Contributions should include a clear description of the observable change and meaningful tests for language/runtime behavior. Use Node 24, `npm ci`, then run `npm test`, `npm run typecheck` and `npm run build:vercel`. Format edited JavaScript/TypeScript with the project formatter.

The core interpreter must keep its browser-safe dependency boundary: Node file access and tensor libraries belong in explicitly enabled host extensions. Preserve source-aware diagnostics, lexical semantics and the default browser execution limits. Document new language/library features in the guide or docs.

Do not commit credentials, local environment files, personal browser projects or deployment authentication. Open a GitHub issue for bugs with a small reproducing Pebble program and the runtime version.
