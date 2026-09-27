import { createRuntime } from './engine.js';
let runtime = createRuntime();
self.onmessage = ({ data }) => {
  if (data.mode === 'run' || data.mode === 'reset')
    runtime = createRuntime({
      files: data.files || {},
      entry: data.entry || 'main.pebble',
    });
  const result = runtime.run(data.source || '', {
    file: data.mode === 'repl' ? '<repl>' : data.entry || 'main.pebble',
  });
  self.postMessage({ id: data.id, result });
};
