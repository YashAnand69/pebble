import {
  readFileSync,
  writeFileSync,
  realpathSync,
  mkdirSync,
  renameSync,
  existsSync,
  statSync,
} from 'node:fs';
import { resolve, dirname, relative, sep, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import * as tf from '@tensorflow/tfjs';
import { Callable } from '../values.js';
import { parameterList } from './tensors.js';
const MAGIC = Buffer.from('PEBBLELM1\n');
function jsonValue(value) {
  if (value instanceof Map)
    return Object.fromEntries([...value].map(([k, v]) => [k, jsonValue(v)]));
  if (Array.isArray(value)) return value.map(jsonValue);
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value))
    return value;
  throw new Error('Metadata must contain only JSON values.');
}
export function createIOExtension(root, argumentsList = []) {
  const base = realpathSync(root);
  function inside(path) {
    const rel = relative(base, path);
    if (rel === '..' || rel.startsWith('..' + sep) || resolve(path) === base)
      throw new Error('I/O paths must name files inside the script project.');
    return path;
  }
  function pathFor(name, write = false) {
    if (
      typeof name !== 'string' ||
      !name ||
      isAbsolute(name) ||
      name.includes('\0')
    )
      throw new Error('Expected a relative file path.');
    let path = inside(resolve(base, name));
    if (write) {
      let existing = dirname(path);
      while (!existsSync(existing)) existing = dirname(existing);
      inside(realpathSync(existing) + sep + 'placeholder');
      mkdirSync(dirname(path), { recursive: true });
      inside(realpathSync(dirname(path)) + sep + 'placeholder');
      if (existsSync(path)) inside(realpathSync(path));
    } else path = inside(realpathSync(path));
    return path;
  }
  function atomic(path, data) {
    const temporary = path + '.tmp-' + randomUUID();
    writeFileSync(temporary, data);
    renameSync(temporary, path);
  }
  return ({ define, fail }) => {
    const entries = new Map();
    const native = (name, min, max, fn) =>
      entries.set(
        name,
        new Callable('io.' + name, min, max, (args, site) => {
          try {
            return fn(args);
          } catch (e) {
            fail(e.message || String(e), site);
          }
        }),
      );
    entries.set('args', argumentsList.slice());
    native('arg', 1, 2, ([name, fallback = null]) => {
      const i = argumentsList.indexOf(name);
      return i < 0 ? fallback : (argumentsList[i + 1] ?? fallback);
    });
    native('readText', 1, 1, ([name]) => {
      const path = pathFor(name);
      if (statSync(path).size > 1000000)
        throw new Error('Text files are limited to 1 MB.');
      return readFileSync(path, 'utf8');
    });
    native('writeText', 2, 2, ([name, text]) => {
      if (typeof text !== 'string' || Buffer.byteLength(text) > 1000000)
        throw new Error('Write a string of at most 1 MB.');
      atomic(pathFor(name, true), text);
      return null;
    });
    native('exists', 1, 1, ([name]) => {
      try {
        return existsSync(pathFor(name));
      } catch {
        return false;
      }
    });
    native('now', 0, 0, () => Date.now());
    native('saveWeights', 3, 3, ([name, parameters, metadata]) => {
      const tensors = parameterList(parameters);
      const header = {
        format: 'pebble-weights',
        version: 1,
        dtype: 'float32',
        metadata: jsonValue(metadata),
        parameters: parameters.map((p, i) => ({
          name: p.label,
          shape: tensors[i].shape,
          offset: tensors.slice(0, i).reduce((s, t) => s + t.size * 4, 0),
          bytes: tensors[i].size * 4,
        })),
      };
      const encoded = Buffer.from(JSON.stringify(header));
      if (encoded.length > 1000000)
        throw new Error('Checkpoint header is too large.');
      const length = Buffer.alloc(4);
      length.writeUInt32LE(encoded.length);
      const payloadSize = tensors.reduce((s, t) => s + t.size * 4, 0);
      if (payloadSize > 128000000)
        throw new Error('Checkpoint is limited to 128 MB.');
      const payload = Buffer.alloc(payloadSize);
      let offset = 0;
      for (const tensor of tensors)
        for (const value of tensor.dataSync()) {
          if (!Number.isFinite(value))
            throw new Error('Cannot save nonfinite model weights.');
          payload.writeFloatLE(value, offset);
          offset += 4;
        }
      atomic(
        pathFor(name, true),
        Buffer.concat([MAGIC, length, encoded, payload]),
      );
      return null;
    });
    native('loadWeights', 2, 2, ([name, parameters]) => {
      const path = pathFor(name);
      if (statSync(path).size > 129000000)
        throw new Error('Checkpoint is too large.');
      const bytes = readFileSync(path);
      if (
        bytes.length < MAGIC.length + 4 ||
        !bytes.subarray(0, MAGIC.length).equals(MAGIC)
      )
        throw new Error('Not a Pebble checkpoint.');
      const length = bytes.readUInt32LE(MAGIC.length);
      if (length > 1000000 || MAGIC.length + 4 + length > bytes.length)
        throw new Error('Invalid checkpoint header.');
      const header = JSON.parse(
        bytes.subarray(MAGIC.length + 4, MAGIC.length + 4 + length).toString(),
      );
      const tensors = parameterList(parameters);
      if (
        header.format !== 'pebble-weights' ||
        header.version !== 1 ||
        header.dtype !== 'float32' ||
        !Array.isArray(header.parameters) ||
        header.parameters.length !== tensors.length
      )
        throw new Error('Checkpoint format or parameter count does not match.');
      const start = MAGIC.length + 4 + length;
      let offset = 0;
      const loaded = [];
      for (let i = 0; i < tensors.length; i++) {
        const p = tensors[i],
          description = header.parameters[i];
        if (
          description.name !== parameters[i].label ||
          JSON.stringify(description.shape) !== JSON.stringify(p.shape) ||
          description.offset !== offset ||
          description.bytes !== p.size * 4
        )
          throw new Error('Checkpoint parameter names or shapes do not match.');
        if (start + offset + p.size * 4 > bytes.length)
          throw new Error('Truncated checkpoint.');
        const data = new Float32Array(p.size);
        for (let j = 0; j < p.size; j++) {
          const value = bytes.readFloatLE(start + offset + j * 4);
          if (!Number.isFinite(value))
            throw new Error('Checkpoint contains nonfinite weights.');
          data[j] = value;
        }
        loaded.push(data);
        offset += p.size * 4;
      }
      if (start + offset !== bytes.length)
        throw new Error('Unexpected checkpoint data.');
      const metadata = jsonToPebble(header.metadata);
      tf.tidy(() =>
        tensors.forEach((p, i) => p.assign(tf.tensor(loaded[i], p.shape))),
      );
      return metadata;
    });
    define('io', entries);
  };
}
function jsonToPebble(value) {
  if (Array.isArray(value)) return value.map(jsonToPebble);
  if (value !== null && typeof value === 'object')
    return new Map(Object.entries(value).map(([k, v]) => [k, jsonToPebble(v)]));
  return value;
}
