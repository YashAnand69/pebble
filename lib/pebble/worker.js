import { createRuntime } from './engine.js';
let runtime = createRuntime();
self.onmessage = ({ data }) => {
  if (data.mode === 'run' || data.mode === 'reset') runtime = createRuntime();
  const result = runtime.run(data.source || '');
  self.postMessage({ id: data.id, result });
};
