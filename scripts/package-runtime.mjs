// Build the standalone interpreter distribution without studio/UI dependencies.
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  cpSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
const root = resolve(import.meta.dirname, '..');
const output = resolve(process.argv[2] || join(root, 'dist-runtime'));
mkdirSync(output, { recursive: true });
const temporary = mkdtempSync(join(tmpdir(), 'pebble-runtime-'));
const source = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
}).trim();
try {
  cpSync(join(root, 'bin'), join(temporary, 'bin'), { recursive: true });
  cpSync(join(root, 'lib/pebble'), join(temporary, 'lib/pebble'), {
    recursive: true,
  });
  cpSync(join(root, 'docs'), join(temporary, 'docs'), { recursive: true });
  cpSync(join(root, 'examples'), join(temporary, 'examples'), {
    recursive: true,
  });
  for (const name of ['LICENSE', 'README.md', 'CHANGELOG.md'])
    cpSync(join(root, name), join(temporary, name));
  writeFileSync(
    join(temporary, 'package.json'),
    JSON.stringify(
      {
        name: 'pebble-runtime',
        version: source.version,
        type: 'module',
        description:
          'Standalone Pebble interpreter with optional WASM machine learning',
        license: 'MIT',
        engines: source.engines,
        repository: source.repository,
        sourceCommit,
        bin: source.bin,
        exports: source.exports,
        dependencies: {
          '@tensorflow/tfjs': source.dependencies['@tensorflow/tfjs'],
          '@tensorflow/tfjs-backend-wasm':
            source.dependencies['@tensorflow/tfjs-backend-wasm'],
        },
      },
      null,
      2,
    ) + '\n',
  );
  const packArgs = ['pack', '--pack-destination', output];
  if (process.env.npm_execpath) {
    execFileSync(process.execPath, [process.env.npm_execpath, ...packArgs], {
      cwd: temporary,
      stdio: 'inherit',
    });
  } else {
    execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', packArgs, {
      cwd: temporary,
      stdio: 'inherit',
    });
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
