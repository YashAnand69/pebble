import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  symlinkSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { projects, validateProject } from '../lib/pebble/projects.js';
import { run } from '../lib/pebble/engine.js';

for (const project of projects)
  test(`shipped project: ${project.title}`, () => {
    const restored = validateProject(JSON.parse(JSON.stringify(project)));
    const result = run(restored.files[restored.entry], restored);
    if (project.id === 'errors') {
      assert.equal(result.ok, false);
      assert.match(result.error.message, /Division by zero/);
    } else {
      assert.equal(result.ok, true, JSON.stringify(result.error));
      assert.ok(result.output.length > 0);
    }
  });
const valid = {
  title: 'Test',
  entry: 'main.pebble',
  files: { 'main.pebble': 'print(42);' },
};
test('project import rejects missing entry, invalid paths and oversized content', () => {
  for (const bad of [
    { ...valid, entry: 'absent.pebble' },
    { ...valid, files: { '../main.pebble': '' } },
    { ...valid, files: { 'main.pebble': 'x'.repeat(100001) } },
    { ...valid, files: [] },
    { ...valid, title: '' },
  ])
    assert.throws(() => validateProject(bad));
});
test('project import rejects file and total size limits', () => {
  assert.throws(() =>
    validateProject({
      ...valid,
      files: Object.fromEntries(
        Array.from({ length: 31 }, (_, i) => [`${i}.pebble`, '']),
      ),
    }),
  );
  assert.throws(() =>
    validateProject({
      ...valid,
      files: Object.fromEntries(
        Array.from({ length: 6 }, (_, i) => [
          `${i}.pebble`,
          'x'.repeat(100000),
        ]),
      ),
    }),
  );
});
test('project filenames do not inherit prototype keys', () => {
  const project = validateProject({
    ...valid,
    files: JSON.parse('{"main.pebble":"print(42);","constructor.pebble":""}'),
  });
  assert.equal(Object.getPrototypeOf(project.files), null);
  assert.equal(project.files.constructor, undefined);
});
test('empty statements after block declarations work in REPL input', () => {
  const result = run(
    'class A {fn get()=>42;}; fn f(){return A().get();}; print(f());;',
  );
  assert.equal(result.ok, true, JSON.stringify(result.error));
  assert.deepEqual(result.output, ['42']);
});
test('string iteration and indexing use the same UTF-16 units', () => {
  const result = run(
    'const s="😀";let chars=[];for c in s{chars.push(c);}assert(chars.length==len(s));assert(enumerate(s)[1][1]==s[1]);assert(reverse(reverse(s))==s);',
  );
  assert.equal(result.ok, true, JSON.stringify(result.error));
});
function cli(...args) {
  return spawnSync(process.execPath, ['bin/pebble.mjs', ...args], {
    cwd: resolve(import.meta.dirname, '..'),
    encoding: 'utf8',
  });
}
test('CLI executes the multi-file project', () => {
  const result = cli('examples/v2/launch/main.pebble');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /33 billion km combined/);
});
test('CLI syntax check and version', () => {
  const check = cli('examples/v2/launch/main.pebble', '--check');
  assert.equal(check.status, 0, check.stderr);
  assert.match(check.stdout, /Syntax OK.*2 file/);
  assert.doesNotMatch(check.stdout, /MISSION CONTROL/);
  assert.equal(cli('--version').stdout.trim(), 'Pebble 2.1.0');
});
test('CLI returns nonzero on runtime errors', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pebble-cli-'));
  try {
    const path = join(dir, 'main.pebble');
    writeFileSync(path, 'print(1/0);');
    const result = cli(path);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /main.pebble:1/);
    assert.match(result.stderr, /Division by zero/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('CLI refuses symlink imports outside the project', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pebble-path-'));
  try {
    mkdirSync(join(dir, 'project'));
    writeFileSync(join(dir, 'outside.pebble'), 'export const x=1;');
    writeFileSync(
      join(dir, 'project/main.pebble'),
      'import x from "./linked.pebble";',
    );
    symlinkSync(
      join(dir, 'outside.pebble'),
      join(dir, 'project/linked.pebble'),
    );
    const result = cli(join(dir, 'project/main.pebble'));
    assert.equal(result.status, 1);
    assert.match(result.stderr, /symlinks/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
