#!/usr/bin/env node
import { readFile, realpath } from 'node:fs/promises';
import { resolve, dirname, basename, relative, sep } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import {
  createRuntime,
  lex,
  parse,
  resolveModule,
  VERSION,
  PebbleError,
} from '../lib/pebble/engine.js';

export async function loadProject(filename) {
  const absolute = await realpath(resolve(filename)),
    root = dirname(absolute),
    entry = basename(absolute),
    files = Object.create(null);
  async function visit(name) {
    if (Object.hasOwn(files, name)) return;
    if (Object.keys(files).length >= 30)
      throw new PebbleError('Module', 'Module limit reached (30 files).', {
        file: name,
      });
    const path = await realpath(resolve(root, name));
    const rel = relative(root, path);
    if (rel === '..' || rel.startsWith('..' + sep))
      throw new PebbleError(
        'Module',
        'Imports cannot leave the project through symlinks.',
        { file: name },
      );
    const source = await readFile(path, 'utf8');
    files[name] = source;
    const ast = parse(lex(source, name));
    for (const statement of ast.body)
      if (statement.kind === 'Import')
        await visit(resolveModule(statement.path, name));
  }
  await visit(entry);
  return { entry, files };
}
function show(result, files, repl = false) {
  result.output.forEach((line) => console.log(line));
  if (result.error) {
    const e = result.error;
    console.error(
      `${e.phase} error at ${e.file}:${e.line}:${e.col}: ${e.message}\n${files[e.file]?.split('\n')[e.line - 1] || ''}\n${' '.repeat(Math.min(200, e.col - 1))}^`,
    );
    e.frames.forEach((f) =>
      console.error(`  at ${f.name} (${f.file}:${f.line})`),
    );
  } else if (repl && result.value !== 'nil') console.log(result.value);
}
const args = process.argv.slice(2),
  flags = new Set(args.filter((a) => a.startsWith('--'))),
  filename = args.find((a) => !a.startsWith('--'));
if (flags.has('--version')) console.log(`Pebble ${VERSION}`);
else if (flags.has('--help'))
  console.log(
    'Pebble 2\n\npebble [file.pebble] [--check | --tokens | --ast]\n\nNo file starts the REPL. Commands: .help, .load FILE, .vars, .reset, .exit',
  );
else if (filename) {
  try {
    const project = await loadProject(filename),
      source = project.files[project.entry];
    if (flags.has('--tokens'))
      console.log(JSON.stringify(lex(source, project.entry), null, 2));
    else if (flags.has('--ast'))
      console.log(JSON.stringify(parse(lex(source, project.entry)), null, 2));
    else if (flags.has('--check'))
      console.log(`Syntax OK · ${Object.keys(project.files).length} file(s)`);
    else {
      const result = createRuntime(project).run(source, {
        file: project.entry,
        trace: false,
      });
      show(result, project.files);
      process.exitCode = result.ok ? 0 : 1;
    }
  } catch (e) {
    console.error(
      e instanceof PebbleError
        ? `${e.phase} error at ${e.file}:${e.line}:${e.col}: ${e.message}`
        : e.message,
    );
    process.exitCode = 1;
  }
} else {
  console.log(`Pebble ${VERSION} · .help for commands · .exit to leave`);
  let runtime = createRuntime(),
    buffer = '',
    last = null,
    files = {};
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    for (;;) {
      let line;
      try {
        line = await rl.question(buffer ? '… ' : '› ');
      } catch {
        break;
      }
      const command = line.trim();
      if (command === '.exit') break;
      if (command === '.help') {
        console.log(
          '.load FILE  Run a project and keep its environment\n.vars       Inspect current bindings\n.reset      Start a fresh environment\n.exit       Leave the REPL',
        );
        continue;
      }
      if (command === '.reset') {
        runtime = createRuntime();
        buffer = '';
        last = null;
        files = {};
        console.log('Environment reset.');
        continue;
      }
      if (command === '.vars') {
        for (const v of last?.variables || [])
          console.log(
            `${v.constant ? 'const' : 'let'} ${v.name}: ${v.type} = ${v.value}`,
          );
        continue;
      }
      if (command.startsWith('.load ')) {
        try {
          const project = await loadProject(command.slice(6).trim());
          runtime = createRuntime(project);
          files = project.files;
          last = runtime.run(files[project.entry], {
            file: project.entry,
            trace: false,
          });
          show(last, files);
          buffer = '';
        } catch (e) {
          console.error(e.message);
        }
        continue;
      }
      buffer += line + '\n';
      const source = buffer.trim();
      if (!source) continue;
      let prepared = source;
      if (!prepared.endsWith(';')) prepared += ';';
      try {
        parse(lex(prepared, '<repl>'));
      } catch (e) {
        if (
          e.message.includes('end of input') ||
          e.message.includes('Unterminated')
        )
          continue;
      }
      last = runtime.run(prepared, { file: '<repl>', trace: false });
      show(last, { ...files, '<repl>': prepared }, true);
      buffer = '';
    }
  } finally {
    rl.close();
  }
}
