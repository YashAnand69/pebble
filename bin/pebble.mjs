#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { createRuntime, run } from '../lib/pebble/engine.js';
function show(result, source, repl = false) {
  result.output.forEach((line) => console.log(line));
  if (result.error) {
    const e = result.error;
    console.error(
      `${e.phase} error at ${e.line}:${e.col}: ${e.message}\n${source.split('\n')[e.line - 1] || ''}\n${' '.repeat(Math.min(200, e.col - 1))}^`,
    );
    e.frames.forEach((f) => console.error(`  at ${f.name} (line ${f.line})`));
  } else if (repl && result.value !== 'nil') console.log(result.value);
}
if (process.argv[2]) {
  try {
    const source = await readFile(process.argv[2], 'utf8');
    const result = run(source);
    show(result, source);
    process.exitCode = result.ok ? 0 : 1;
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
} else {
  console.log('Pebble v1.0 · .exit to leave · .reset for a fresh environment');
  let runtime = createRuntime(),
    buffer = '';
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    for (;;) {
      let line;
      try {
        line = await rl.question(buffer ? '… ' : '› ');
      } catch {
        break;
      }
      if (line.trim() === '.exit') break;
      if (line.trim() === '.reset') {
        runtime = createRuntime();
        buffer = '';
        console.log('Environment reset.');
        continue;
      }
      buffer += line + '\n';
      let source = buffer.trim();
      if (!source) continue;
      if (!source.endsWith(';') && !source.endsWith('}')) source += ';';
      const result = runtime.run(source);
      if (
        result.error?.phase === 'Parser' &&
        result.error.message.includes('end of input')
      )
        continue;
      show(result, source, true);
      buffer = '';
    }
  } finally {
    rl.close();
  }
}
