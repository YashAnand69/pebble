# Machine learning in Pebble 2.1

Pebble programs can define and train neural networks with an **optional Node extension**. The language still interprets Pebble directly. TensorFlow.js 4.22.0 supplies float32 tensors, numerical kernels, automatic differentiation and the WASM CPU backend; the host extension implements AdamW and safe checkpoint serialization. This is not a new tensor engine written in Pebble.

The network, tokenizer, dataset generator, training schedule, batching, sampling and evaluation for [PebbleLM](https://github.com/YashAnand69/pebble-llm) are Pebble source. Its tied-embedding transformer has exactly 2,000,000 trainable parameters.

## Enable capabilities

Use Node 22.13+ and install dependencies with `npm ci`.

```sh
node bin/pebble.mjs examples/ml/regression.pebble --ml --compute
node bin/pebble.mjs /path/to/train.pebble --ml --io --compute -- --steps 2000
```

`--ml` enables the `ml` namespace. `--io` enables project-confined file access. `--compute` streams output and permits a long trusted job: 100 million interpreted steps and no wall-clock timeout. These flags apply to file execution, not the interactive REPL. Arguments after `--` are available to the script through `io.args` and `io.arg`.

The browser studio does not load these extensions. Its existing worker isolation, execution budget and stop controls remain active. Only enable file and long-running capabilities for programs you trust; this CLI is not an operating-system sandbox.

## Define and train

```pebble
ml.seed(2026);
const weights = ml.parameter("projection", [1, 2]);
const optimizer = ml.adamW([weights], 0.01);
for step in range(100) {
  const loss = ml.scope(fn() {
    const input = ml.tensor([1, 2], [1, 2]);
    return ml.minimize(optimizer, fn() {
      const difference = ml.sub(ml.linear(input, weights), 3);
      return ml.mean(ml.mul(difference, difference));
    }, 0.01);
  });
}
print(ml.data(weights));
```

Weights use `[output, input]` order. Parameters have unique names, float32 storage and trainable values. Build the parameter list once without duplicates; tying an output embedding means reusing the same parameter, not adding it a second time. A tensor exposes `.shape`, `.size`, `.label` and `.trainable`.

## API

| Function | Behavior |
| --- | --- |
| `ml.seed(seed)` | Seeds parameter initialization, batching and sampling; set before constructing a model. |
| `ml.backend()` | Returns the initialized backend (`wasm`). |
| `ml.random()`, `ml.randint(upper)` | Seeded uniform sampling; integer upper bound is exclusive. |
| `ml.parameter(name, shape, scale=0.02)` | Trainable normal initialization with the given standard deviation. |
| `ml.tensor(flatData, shape, dtype="float32")`, `ml.zeros(shape)` | Create tensors; `int32` is supported for IDs/targets. |
| `ml.positions(batch, length)` | Batched int32 position IDs starting at zero. |
| `ml.embedding(weights, ids)` | Matrix lookup; repeated IDs accumulate gradients. Uses a differentiable one-hot multiplication because the WASM backend lacks the gather backward kernel. |
| `ml.linear(input, weights)` | Projection of the last dimension. |
| `ml.add`, `ml.sub`, `ml.mul`, `ml.div` | Broadcast tensor/finite-number arithmetic. |
| `ml.matmul`, `ml.reshape`, `ml.transpose` | Matrix and shape operations. |
| `ml.sum`, `ml.mean`, `ml.softmax` | Reductions and last-axis softmax. |
| `ml.gelu(input)` | Tanh approximation to GELU. |
| `ml.layerNorm(input)` | Last-axis normalization, epsilon `1e-5`, no affine parameters. |
| `ml.attention(qkv, heads)` | Scaled dot-product multi-head causal attention; input `[batch, time, 3*width]`. |
| `ml.crossEntropy(logits, targets)` | Mean loss over supervised IDs; `-1` excludes a target. At least one target must be active. |
| `ml.gradients(callback, parameters)` | Returns `{loss, values}`; gradients are in parameter-list order. Call inside a scope and dispose retained outputs. |
| `ml.adamW(parameters, decay=0.01, beta1=0.9, beta2=0.95)` | Optimizer; `.steps` reports completed updates. |
| `ml.minimize(optimizer, scalarLossCallback, rate, clip=1)` | Differentiates, clips global gradient norm, applies AdamW, returns numeric pre-update loss. Nonfinite loss/gradients refuse the update. |
| `ml.scope(callback)` | Disposes temporary tensors; tensors in a returned list/dictionary are retained. |
| `ml.item(tensor)`, `ml.data(tensor)` | Read a scalar or a flat list of at most 10,000 elements. |
| `ml.count(parameters)` | Exact number of scalar trainable weights. |
| `ml.sample(logits, temperature, topK=0)` | Sample the last logits row; temperature zero is greedy. |
| `ml.dispose(value)`, `ml.memory()` | Dispose a tensor/optimizer or inspect live tensor count/bytes. |

Keep training iterations and inference calls inside `ml.scope`. Returned tensors remain your responsibility. CLI exit disposes parameters and optimizer state. Explicit tensor construction/reshape permits ranks 1–4 with at most four million elements; intermediate operations also consume memory, so choose practical shapes. Host tensor methods are not arbitrary JavaScript property access.

## Files and checkpoints

| Function | Behavior |
| --- | --- |
| `io.args`, `io.arg(name, fallback=nil)` | Script arguments after `--`. |
| `io.readText(path)`, `io.writeText(path, text)` | UTF-8 files up to 1 MB; writes create parent directories and atomically replace the destination. |
| `io.exists(path)`, `io.now()` | File existence or Unix milliseconds. |
| `io.saveWeights(path, parameters, metadata)` | Named float32 parameter checkpoint, JSON metadata, maximum 128 MB payload. |
| `io.loadWeights(path, parameters)` | Validates names, shapes, finite values and complete payload before assigning any weights; returns metadata. |

Paths must be relative to the entry file's directory. Parent traversal and symlinks leaving that directory are rejected. Checkpoints contain a versioned JSON header and little-endian float32 arrays; they contain no executable code. Checkpoints save model weights, **not optimizer moments**. Loading weights is suitable for inference; it does not reproduce an uninterrupted optimizer run.

## Embed the extension

```js
import {createRuntime} from '../lib/pebble/engine.js';
import {initializeML, createTensorExtension} from '../lib/pebble/ml/tensors.js';
await initializeML();
const host = createTensorExtension();
try {
  const runtime = createRuntime({extensions: [host.extension], maxTimeMs: Infinity});
  const result = runtime.run('print(ml.backend());', {trace: false});
} finally {
  host.dispose();
}
```

Only a trusted JavaScript host can register extensions or change budgets. The default interpreter imports no TensorFlow.js code.
