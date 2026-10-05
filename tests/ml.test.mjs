import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as tf from '@tensorflow/tfjs';
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  symlinkSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRuntime, run } from '../lib/pebble/engine.js';
import { Callable } from '../lib/pebble/values.js';
import {
  initializeML,
  createTensorExtension,
} from '../lib/pebble/ml/tensors.js';
import { createIOExtension } from '../lib/pebble/ml/io.js';
await initializeML();
function fixture(root) {
  const host = createTensorExtension(),
    captured = [];
  const runtime = createRuntime({
    maxTimeMs: Infinity,
    extensions: [
      host.extension,
      ...(root ? [createIOExtension(root)] : []),
      ({ define }) =>
        define(
          'capture',
          new Callable('capture', 1, 1, ([value]) => {
            captured.push(value);
            return null;
          }),
        ),
    ],
  });
  return {
    captured,
    host,
    execute(source, ok = true) {
      const result = runtime.run(source, { trace: false });
      assert.equal(result.ok, ok, JSON.stringify(result.error));
      return result;
    },
  };
}
function closeTo(actual, expected, tolerance = 1e-4) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≠ ${expected}`);
}
test('ML capabilities require an explicit host extension', () => {
  assert.equal(run('ml.zeros([1]);').ok, false);
  assert.equal(run('io.readText("x");').ok, false);
});
test('embedding accumulates gradients for repeated IDs', () => {
  const f = fixture();
  try {
    f.execute(
      'const p=ml.parameter("e",[4,2]);ml.scope(fn(){const ids=ml.tensor([0,1,1,2],[1,4],"int32");const g=ml.gradients(fn()=>ml.sum(ml.embedding(p,ids)),[p]);capture(ml.data(g.values[0]));});',
    );
    assert.deepEqual(f.captured[0], [1, 1, 2, 2, 1, 1, 0, 0]);
  } finally {
    f.host.dispose();
  }
});
test('attention is causal and gradients agree with finite differences', () => {
  const f = fixture();
  try {
    f.execute('const q=ml.parameter("q",[1,3,6]);capture(q);');
    const parameter = f.captured[0].tensor;
    const values = Array.from({ length: 18 }, (_, i) => ((i % 7) - 3) * 0.23);
    const assign = (data) =>
      tf.tidy(() => parameter.assign(tf.tensor(data, parameter.shape)));
    assign(values);
    f.execute(
      'ml.scope(fn(){capture(ml.data(ml.attention(q,1)));const g=ml.gradients(fn()=>ml.sum(ml.gelu(ml.layerNorm(ml.attention(q,1)))),[q]);capture(ml.data(g.values[0]));});',
    );
    const original = f.captured[1],
      gradients = f.captured[2];
    const changed = values.slice();
    changed.splice(12, 6, 4, -3, 2, -5, 7, -4);
    assign(changed);
    f.execute('ml.scope(fn()=>capture(ml.data(ml.attention(q,1))));');
    f.captured[3].slice(0, 4).forEach((v, i) => closeTo(v, original[i], 1e-6));
    for (const index of [0, 7, 11, 16]) {
      const epsilon = 0.003,
        plus = values.slice(),
        minus = values.slice();
      plus[index] += epsilon;
      minus[index] -= epsilon;
      assign(plus);
      f.execute(
        'ml.scope(fn()=>capture(ml.item(ml.sum(ml.gelu(ml.layerNorm(ml.attention(q,1)))))));',
      );
      const high = f.captured.at(-1);
      assign(minus);
      f.execute(
        'ml.scope(fn()=>capture(ml.item(ml.sum(ml.gelu(ml.layerNorm(ml.attention(q,1)))))));',
      );
      const low = f.captured.at(-1);
      closeTo(gradients[index], (high - low) / (2 * epsilon), 0.003);
    }
  } finally {
    f.host.dispose();
  }
});
test('cross entropy masks prompt and padding targets', () => {
  const f = fixture();
  try {
    f.execute(
      'ml.scope(fn(){const logits=ml.tensor([100,-100,0,0],[1,2,2]);const targets=ml.tensor([-1,1],[1,2],"int32");capture(ml.item(ml.crossEntropy(logits,targets)));});',
    );
    closeTo(f.captured[0], Math.log(2));
    f.execute(
      'ml.scope(fn()=>ml.crossEntropy(ml.zeros([1,2,2]),ml.tensor([-1,-1],[1,2],"int32")));',
      false,
    );
  } finally {
    f.host.dispose();
  }
});
test('AdamW decreases a quadratic loss without leaking tensors between updates', () => {
  const f = fixture();
  try {
    f.execute(
      'const p=ml.parameter("p",[3]);const optimizer=ml.adamW([p],0);capture(p);',
    );
    tf.tidy(() => f.captured[0].tensor.assign(tf.tensor([1, 2, 3])));
    f.execute(
      'capture(ml.scope(fn()=>ml.item(ml.mean(ml.mul(p,p)))));for i in range(20){ml.scope(fn()=>ml.minimize(optimizer,fn()=>ml.mean(ml.mul(p,p)),0.05));}capture(ml.scope(fn()=>ml.item(ml.mean(ml.mul(p,p)))));',
    );
    assert.ok(f.captured[2] < f.captured[1]);
    const before = tf.memory().numTensors;
    f.execute(
      'for i in range(30){ml.scope(fn()=>ml.minimize(optimizer,fn()=>ml.mean(ml.mul(p,p)),0.01));}',
    );
    assert.equal(tf.memory().numTensors, before);
    const weights = Array.from(f.captured[0].tensor.dataSync());
    f.execute(
      'ml.scope(fn()=>ml.minimize(optimizer,fn()=>ml.sum(ml.div(p,0)),0.01));',
      false,
    );
    assert.deepEqual(Array.from(f.captured[0].tensor.dataSync()), weights);
  } finally {
    f.host.dispose();
  }
});
test('scopes retain returned nested tensors and release temporary tensors', () => {
  const f = fixture();
  try {
    const baseline = tf.memory().numTensors;
    f.execute(
      'const result=ml.scope(fn(){ml.zeros([5]);return {nested:[ml.zeros([2])]};});assert(result.nested[0].size==2);ml.dispose(result.nested[0]);',
    );
    assert.equal(tf.memory().numTensors, baseline);
  } finally {
    f.host.dispose();
  }
});
test('checkpoints round trip and reject corruption without changing parameters', () => {
  const root = mkdtempSync(join(tmpdir(), 'pebble-weights-')),
    f = fixture(root);
  try {
    f.execute(
      'const a=ml.parameter("a",[2]);const b=ml.parameter("b",[1]);capture(a);capture(b);io.saveWeights("weights.bin",[a,b],{step:7});',
    );
    const original = f.captured.map((v) => Array.from(v.tensor.dataSync()));
    tf.tidy(() =>
      f.captured.forEach((v) => v.tensor.assign(tf.zerosLike(v.tensor))),
    );
    f.execute(
      'const metadata=io.loadWeights("weights.bin",[a,b]);assert(metadata.step==7);',
    );
    f.captured.forEach((v, i) =>
      assert.deepEqual(Array.from(v.tensor.dataSync()), original[i]),
    );
    const buffer = readFileSync(join(root, 'weights.bin'));
    buffer.writeFloatLE(NaN, buffer.length - 4);
    writeFileSync(join(root, 'bad.bin'), buffer);
    f.execute('io.loadWeights("bad.bin",[a,b]);', false);
    f.captured.forEach((v, i) =>
      assert.deepEqual(Array.from(v.tensor.dataSync()), original[i]),
    );
    writeFileSync(
      join(root, 'truncated.bin'),
      buffer.subarray(0, buffer.length - 5),
    );
    f.execute('io.loadWeights("truncated.bin",[a,b]);', false);
  } finally {
    f.host.dispose();
    rmSync(root, { recursive: true, force: true });
  }
});
test('file extension blocks traversal and symlinks before creating outside directories', () => {
  const root = mkdtempSync(join(tmpdir(), 'pebble-files-'));
  mkdirSync(join(root, 'project'));
  mkdirSync(join(root, 'outside'));
  symlinkSync(join(root, 'outside'), join(root, 'project/link'));
  const f = fixture(join(root, 'project'));
  try {
    f.execute(
      'io.writeText("nested/ok.txt","hello");assert(io.readText("nested/ok.txt")=="hello");',
    );
    f.execute('io.writeText("../outside/bad.txt","bad");', false);
    f.execute('io.writeText("link/new/bad.txt","bad");', false);
    assert.equal(existsSync(join(root, 'outside/new')), false);
    assert.equal(existsSync(join(root, 'outside/bad.txt')), false);
  } finally {
    f.host.dispose();
    rmSync(root, { recursive: true, force: true });
  }
});
