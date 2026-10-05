import * as tf from '@tensorflow/tfjs';
import { setWasmPaths } from '@tensorflow/tfjs-backend-wasm';
import { createRequire } from 'node:module';
import { dirname, sep } from 'node:path';
import { NativeValue } from '../native.js';
import { Callable } from '../values.js';
const require = createRequire(import.meta.url);
let initialized,
  serial = 0;
export async function initializeML() {
  if (!initialized)
    initialized = (async () => {
      setWasmPaths(
        dirname(
          require.resolve('@tensorflow/tfjs-backend-wasm/dist/tfjs-backend-wasm.wasm'),
        ) + sep,
      );
      if (!(await tf.setBackend('wasm')))
        throw new Error('Could not initialize the WASM tensor backend.');
      await tf.ready();
    })();
  await initialized;
}
export class TensorValue extends NativeValue {
  constructor(tensor, label = '') {
    super('tensor');
    this.tensor = tensor;
    this.label = label;
  }
  inspect() {
    return `<tensor [${this.tensor.shape.join(', ')}] ${this.tensor.dtype}${this.tensor instanceof tf.Variable ? ' parameter' : ''}>`;
  }
  property(name) {
    if (name === 'shape') return this.tensor.shape.slice();
    if (name === 'size') return this.tensor.size;
    if (name === 'label') return this.label;
    if (name === 'trainable') return this.tensor instanceof tf.Variable;
    return super.property(name);
  }
}
class OptimizerValue extends NativeValue {
  constructor(parameters, decay, beta1, beta2) {
    super('optimizer');
    this.parameters = parameters;
    this.decay = decay;
    this.beta1 = beta1;
    this.beta2 = beta2;
    this.steps = 0;
    this.slots = [];
  }
  property(name) {
    if (name === 'steps') return this.steps;
    return super.property(name);
  }
  inspect() {
    return `<AdamW step=${this.steps}>`;
  }
}
export function tensorOf(value) {
  if (!(value instanceof TensorValue) || value.tensor.isDisposed)
    throw new Error('Expected a live tensor.');
  return value.tensor;
}
export function parameterList(values) {
  if (
    !Array.isArray(values) ||
    !values.length ||
    values.some((p) => !(tensorOf(p) instanceof tf.Variable))
  )
    throw new Error('Expected a nonempty list of parameter tensors.');
  const tensors = values.map(tensorOf);
  if (new Set(tensors).size !== tensors.length)
    throw new Error('Parameter lists must not contain duplicate tensors.');
  return tensors;
}
const number = (v) => {
  if (typeof v !== 'number' || !Number.isFinite(v))
    throw new Error('Expected a finite number.');
  return v;
};
const integer = (v) => {
  number(v);
  if (!Number.isSafeInteger(v)) throw new Error('Expected a safe integer.');
  return v;
};
const shapeOf = (shape) => {
  if (
    !Array.isArray(shape) ||
    !shape.length ||
    shape.length > 4 ||
    shape.some((n) => !Number.isSafeInteger(n) || n <= 0) ||
    shape.reduce((a, b) => a * b, 1) > 4000000
  )
    throw new Error(
      'Tensor shape must have 1–4 positive dimensions and at most 4,000,000 elements.',
    );
  return shape;
};
const wrap = (tensor, label = '') => new TensorValue(tensor, label);
export function createTensorExtension() {
  const prefix = `pebble_${serial++}_`,
    owned = new Set(),
    optimizers = new Set();
  let seed = 2026,
    counter = 0,
    randomState = 2026;
  function random() {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 4294967296;
  }
  function track(tensor, label = '') {
    if (tensor instanceof tf.Variable) owned.add(tensor);
    return wrap(tensor, label);
  }
  function dispose() {
    for (const o of optimizers)
      for (const slot of o.slots) {
        slot.m.dispose();
        slot.v.dispose();
      }
    for (const p of owned) p.dispose();
    owned.clear();
    optimizers.clear();
  }
  const extension = ({ define, invoke, fail, tick }) => {
    const functions = new Map();
    const native = (name, min, max, call) =>
      functions.set(
        name,
        new Callable('ml.' + name, min, max, (args, site) => {
          tick(site);
          try {
            return call(args, site);
          } catch (error) {
            if (error?.phase) throw error;
            fail(error.message || String(error), site);
          }
        }),
      );
    const scalar = (v) => {
      const t = tensorOf(v);
      if (t.size !== 1) throw new Error('Expected a scalar tensor.');
      return Number(t.dataSync()[0]);
    };
    const result = (fn) => wrap(tf.tidy(fn));
    native('seed', 1, 1, ([value]) => {
      seed = integer(value);
      randomState = seed >>> 0;
      counter = 0;
      return null;
    });
    native('backend', 0, 0, () => tf.getBackend());
    native('random', 0, 0, () => random());
    native('randint', 1, 1, ([upper]) => {
      if (integer(upper) <= 0)
        throw new Error('randint upper bound must be positive.');
      return Math.floor(random() * upper);
    });
    native('parameter', 2, 3, ([name, shape, scale = 0.02]) => {
      if (typeof name !== 'string' || !name)
        throw new Error('Parameter needs a name.');
      shapeOf(shape);
      number(scale);
      if (scale <= 0) throw new Error('Initialization scale must be positive.');
      const initial = tf.randomNormal(
        shape,
        0,
        scale,
        'float32',
        seed + counter++,
      );
      const variable = tf.variable(initial, true, prefix + name);
      initial.dispose();
      return track(variable, name);
    });
    native('tensor', 2, 3, ([data, shape, dtype = 'float32']) => {
      shapeOf(shape);
      if (
        !['float32', 'int32'].includes(dtype) ||
        !Array.isArray(data) ||
        data.length !== shape.reduce((a, b) => a * b, 1)
      )
        throw new Error(
          'Tensor data must be a flat list matching its shape and dtype.',
        );
      data.forEach(dtype === 'int32' ? integer : number);
      return wrap(tf.tensor(data, shape, dtype));
    });
    native('zeros', 1, 1, ([shape]) => wrap(tf.zeros(shapeOf(shape))));
    native('positions', 2, 2, ([batch, length]) => {
      shapeOf([batch, length]);
      return result(() =>
        tf.tile(tf.range(0, length, 1, 'int32').reshape([1, length]), [
          batch,
          1,
        ]),
      );
    });
    native('embedding', 2, 2, ([weights, indices]) =>
      result(() => {
        const w = tensorOf(weights),
          ids = tensorOf(indices);
        if (w.rank !== 2 || ids.dtype !== 'int32')
          throw new Error('Embedding expects a matrix and int32 token IDs.');
        for (const id of ids.dataSync())
          if (id < 0 || id >= w.shape[0])
            throw new Error('Embedding token ID is out of range.');
        const flat = ids.reshape([ids.size]);
        return tf
          .matMul(tf.oneHot(flat, w.shape[0]), w)
          .reshape([...ids.shape, w.shape[1]]);
      }),
    );
    native('linear', 2, 2, ([input, weights]) =>
      result(() => {
        const x = tensorOf(input),
          w = tensorOf(weights);
        if (w.rank !== 2 || x.shape.at(-1) !== w.shape[1])
          throw new Error('Linear weights use [output, input] dimensions.');
        const rows = x.size / x.shape.at(-1);
        return tf
          .matMul(x.reshape([rows, w.shape[1]]), w, false, true)
          .reshape([...x.shape.slice(0, -1), w.shape[0]]);
      }),
    );
    for (const [name, operation] of Object.entries({
      add: tf.add,
      sub: tf.sub,
      mul: tf.mul,
      div: tf.div,
    }))
      native(name, 2, 2, ([a, b]) =>
        result(() =>
          operation(
            a instanceof TensorValue ? tensorOf(a) : number(a),
            b instanceof TensorValue ? tensorOf(b) : number(b),
          ),
        ),
      );
    native('matmul', 2, 2, ([a, b]) =>
      result(() => tf.matMul(tensorOf(a), tensorOf(b))),
    );
    native('reshape', 2, 2, ([x, shape]) => {
      shapeOf(shape);
      return result(() => tensorOf(x).reshape(shape));
    });
    native('transpose', 1, 2, ([x, permutation]) =>
      result(() => tf.transpose(tensorOf(x), permutation)),
    );
    native('sum', 1, 1, ([x]) => result(() => tf.sum(tensorOf(x))));
    native('mean', 1, 1, ([x]) => result(() => tf.mean(tensorOf(x))));
    native('softmax', 1, 1, ([x]) => result(() => tf.softmax(tensorOf(x))));
    native('gelu', 1, 1, ([x]) =>
      result(() => {
        const t = tensorOf(x);
        return tf.mul(
          tf.mul(t, 0.5),
          tf.add(
            1,
            tf.tanh(
              tf.mul(
                tf.add(t, tf.mul(tf.pow(t, 3), 0.044715)),
                Math.sqrt(2 / Math.PI),
              ),
            ),
          ),
        );
      }),
    );
    native('layerNorm', 1, 1, ([x]) =>
      result(() => {
        const t = tensorOf(x),
          { mean, variance } = tf.moments(t, -1, true);
        return tf.mul(tf.sub(t, mean), tf.rsqrt(tf.add(variance, 1e-5)));
      }),
    );
    native('attention', 2, 2, ([qkv, heads]) =>
      result(() => {
        const x = tensorOf(qkv);
        integer(heads);
        if (x.rank !== 3 || heads <= 0 || x.shape[2] % (3 * heads))
          throw new Error(
            'Attention expects [batch, time, 3*width] with width divisible by heads.',
          );
        const [batch, time, triple] = x.shape,
          width = triple / 3,
          headWidth = width / heads;
        const [q, k, v] = tf
          .split(x, 3, -1)
          .map((t) =>
            t.reshape([batch, time, heads, headWidth]).transpose([0, 2, 1, 3]),
          );
        const mask = new Float32Array(time * time);
        for (let i = 0; i < time; i++)
          for (let j = i + 1; j < time; j++) mask[i * time + j] = -1e9;
        const scores = tf.add(
          tf.mul(tf.matMul(q, k, false, true), 1 / Math.sqrt(headWidth)),
          tf.tensor2d(mask, [time, time]),
        );
        return tf
          .matMul(tf.softmax(scores), v)
          .transpose([0, 2, 1, 3])
          .reshape([batch, time, width]);
      }),
    );
    native('crossEntropy', 2, 2, ([logits, targets]) =>
      result(() => {
        const x = tensorOf(logits),
          y = tensorOf(targets),
          vocab = x.shape.at(-1),
          rows = x.size / vocab;
        if (y.dtype !== 'int32' || y.size !== rows)
          throw new Error(
            'Targets must be int32 IDs matching every logits row.',
          );
        const ids = y.dataSync();
        let count = 0;
        for (const id of ids) {
          if (id !== -1 && (id < 0 || id >= vocab))
            throw new Error('Target token ID is out of range.');
          if (id !== -1) count++;
        }
        if (!count) throw new Error('At least one target must be supervised.');
        const flat = y.reshape([rows]),
          labels = tf.oneHot(tf.maximum(flat, 0).cast('int32'), vocab),
          mask = tf.notEqual(flat, -1).cast('float32');
        const logProbs = tf.logSoftmax(x.reshape([rows, vocab]));
        return tf.div(
          tf.neg(tf.sum(tf.mul(tf.sum(tf.mul(labels, logProbs), -1), mask))),
          count,
        );
      }),
    );
    native('item', 1, 1, ([x]) => scalar(x));
    native('data', 1, 1, ([x]) => {
      const t = tensorOf(x);
      if (t.size > 10000)
        throw new Error(
          'Use checkpoints for tensors larger than 10,000 elements.',
        );
      return Array.from(t.dataSync());
    });
    native('count', 1, 1, ([parameters]) =>
      parameterList(parameters).reduce((sum, p) => sum + p.size, 0),
    );
    native('scope', 1, 1, ([callback], site) => {
      let value;
      tf.tidy(() => {
        value = invoke(callback, [], site);
        const tensors = [];
        function keep(v) {
          if (v instanceof TensorValue) tensors.push(tensorOf(v));
          else if (Array.isArray(v)) v.forEach(keep);
          else if (v instanceof Map)
            for (const entry of v.values()) keep(entry);
        }
        keep(value);
        return tensors;
      });
      return value;
    });
    native('dispose', 1, 1, ([x]) => {
      if (x instanceof TensorValue) {
        const t = tensorOf(x);
        t.dispose();
        owned.delete(t);
      } else if (x instanceof OptimizerValue) {
        for (const slot of x.slots) {
          slot.m.dispose();
          slot.v.dispose();
        }
        optimizers.delete(x);
      } else throw new Error('Dispose a tensor or optimizer.');
      return null;
    });
    native(
      'memory',
      0,
      0,
      () =>
        new Map([
          ['tensors', tf.memory().numTensors],
          ['bytes', tf.memory().numBytes],
        ]),
    );
    native(
      'adamW',
      1,
      4,
      ([parameters, decay = 0.01, beta1 = 0.9, beta2 = 0.95]) => {
        const params = parameterList(parameters);
        number(decay);
        number(beta1);
        number(beta2);
        if (decay < 0 || beta1 < 0 || beta1 >= 1 || beta2 < 0 || beta2 >= 1)
          throw new Error('Invalid AdamW hyperparameters.');
        const optimizer = new OptimizerValue(params, decay, beta1, beta2);
        optimizers.add(optimizer);
        return optimizer;
      },
    );
    native('gradients', 2, 2, ([callback, parameters], site) => {
      const params = parameterList(parameters);
      const calculated = tf.variableGrads(
        () => tensorOf(invoke(callback, [], site)),
        params,
      );
      return new Map([
        ['loss', wrap(calculated.value)],
        [
          'values',
          params.map((p) => wrap(calculated.grads[p.name] || tf.zerosLike(p))),
        ],
      ]);
    });
    native('minimize', 3, 4, ([optimizer, callback, rate, clip = 1], site) => {
      if (!(optimizer instanceof OptimizerValue) || !optimizers.has(optimizer))
        throw new Error('Expected a live AdamW optimizer.');
      number(rate);
      number(clip);
      if (rate <= 0 || clip <= 0)
        throw new Error('Learning rate and gradient clip must be positive.');
      return tf.tidy(() => {
        const { value, grads } = tf.variableGrads(
            () => tensorOf(invoke(callback, [], site)),
            optimizer.parameters,
          ),
          loss = Number(value.dataSync()[0]);
        if (!Number.isFinite(loss))
          throw new Error('Loss became nonfinite; update refused.');
        const tensors = optimizer.parameters.map(
          (p) => grads[p.name] || tf.zerosLike(p),
        );
        const norm = Math.sqrt(
          Number(
            tf.addN(tensors.map((g) => tf.sum(tf.square(g)))).dataSync()[0],
          ),
        );
        if (!Number.isFinite(norm))
          throw new Error('Gradients became nonfinite; update refused.');
        if (!optimizer.slots.length)
          optimizer.slots = optimizer.parameters.map((p) => ({
            m: tf.keep(tf.variable(tf.zerosLike(p), false)),
            v: tf.keep(tf.variable(tf.zerosLike(p), false)),
          }));
        const step = ++optimizer.steps,
          b1 = optimizer.beta1,
          b2 = optimizer.beta2,
          scale = Math.min(1, clip / (norm + 1e-12));
        optimizer.parameters.forEach((p, i) => {
          const slot = optimizer.slots[i],
            g = tf.mul(tensors[i], scale);
          slot.m.assign(tf.add(tf.mul(slot.m, b1), tf.mul(g, 1 - b1)));
          slot.v.assign(
            tf.add(tf.mul(slot.v, b2), tf.mul(tf.square(g), 1 - b2)),
          );
          const correction = tf.div(
            tf.div(slot.m, 1 - b1 ** step),
            tf.add(tf.sqrt(tf.div(slot.v, 1 - b2 ** step)), 1e-8),
          );
          p.assign(
            tf.sub(
              tf.mul(p, 1 - rate * optimizer.decay),
              tf.mul(correction, rate),
            ),
          );
        });
        return loss;
      });
    });
    native('sample', 2, 3, ([logits, temperature, topK = 0]) => {
      const x = tensorOf(logits),
        vocab = x.shape.at(-1);
      number(temperature);
      integer(topK);
      if (temperature < 0 || topK < 0)
        throw new Error('Temperature and topK must be nonnegative.');
      const all = x.dataSync(),
        last = Array.from(all.slice(all.length - vocab));
      const indices = last.map((_, i) => i).sort((a, b) => last[b] - last[a]);
      if (temperature === 0) return indices[0];
      const candidates = topK ? indices.slice(0, topK) : indices;
      const maximum = last[indices[0]],
        weights = candidates.map((i) =>
          Math.exp((last[i] - maximum) / temperature),
        ),
        total = weights.reduce((a, b) => a + b, 0);
      let cursor = random() * total;
      for (let i = 0; i < candidates.length; i++) {
        cursor -= weights[i];
        if (cursor <= 0) return candidates[i];
      }
      return candidates.at(-1);
    });
    define('ml', functions);
  };
  return { extension, dispose };
}
