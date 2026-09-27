'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
export type Variable = {
  name: string;
  type: string;
  value: string;
  constant: boolean;
};
export type TraceEvent = {
  step: number;
  kind: string;
  line: number;
  col: number;
  file: string;
  detail: string;
  depth: number;
  variables: Variable[];
  outputCount: number;
};
export type Result = {
  ok: boolean;
  output: string[];
  tokens: unknown[];
  ast: unknown;
  trace: TraceEvent[];
  traceTruncated?: boolean;
  steps: number;
  calls: number;
  duration: number;
  value?: string;
  variables: Variable[];
  modules: { file: string; exports: string[] }[];
  error?: {
    phase: string;
    message: string;
    file: string;
    line: number;
    col: number;
    frames: { name: string; line: number; file: string }[];
  };
};
export type Project = {
  id: string;
  title: string;
  description: string;
  tag: string;
  entry: string;
  files: Record<string, string>;
};
const failure = (message: string): Result => ({
  ok: false,
  output: [],
  tokens: [],
  ast: null,
  trace: [],
  steps: 0,
  calls: 0,
  duration: 0,
  variables: [],
  modules: [],
  error: {
    phase: 'Runtime',
    message,
    file: 'main.pebble',
    line: 1,
    col: 1,
    frames: [],
  },
});
export function useRuntime() {
  const [busy, setBusy] = useState(false),
    worker = useRef<Worker | null>(null),
    sequence = useRef(0),
    pending = useRef<((r: Result) => void) | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finish = useCallback((result: Result) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const resolve = pending.current;
    pending.current = null;
    setBusy(false);
    resolve?.(result);
  }, []);
  const stop = useCallback(() => {
    worker.current?.terminate();
    worker.current = null;
    sequence.current++;
    finish(
      failure(
        'Execution stopped. Run the project again to start a fresh session.',
      ),
    );
  }, [finish]);
  const execute = useCallback(
    (project: Project, source: string, mode = 'run'): Promise<Result> => {
      if (pending.current)
        return Promise.resolve(failure('A program is already running.'));
      setBusy(true);
      const id = ++sequence.current;
      if (!worker.current) {
        const w = new Worker(
          new URL('../../lib/pebble/worker.js', import.meta.url),
          { type: 'module' },
        );
        worker.current = w;
        w.onmessage = ({ data }) => {
          if (data.id === sequence.current && worker.current === w)
            finish(data.result);
        };
        w.onerror = () => {
          if (worker.current !== w) return;
          w.terminate();
          worker.current = null;
          finish(
            failure('The execution worker failed. Run again to restart it.'),
          );
        };
      }
      return new Promise((resolve) => {
        pending.current = resolve;
        worker.current!.postMessage({
          id,
          source,
          mode,
          files: project.files,
          entry: project.entry,
        });
        timer.current = setTimeout(() => {
          worker.current?.terminate();
          worker.current = null;
          sequence.current++;
          finish(
            failure(
              'Execution stopped after 5 seconds. Reduce the program size and run again.',
            ),
          );
        }, 5000);
      });
    },
    [finish],
  );
  useEffect(
    () => () => {
      worker.current?.terminate();
      if (timer.current) clearTimeout(timer.current);
      pending.current = null;
    },
    [],
  );
  return { execute, stop, busy };
}
