'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play,
  Square,
  Terminal,
  Code2,
  ArrowUpRight,
  BookOpen,
  Layers,
  Circle,
  Download,
  RotateCcw,
  Check,
  ChevronRight,
  Braces,
  Hash,
  FlaskConical,
  Trash2,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { lex } from '@/lib/pebble/engine.js';
import { examples } from '@/lib/pebble/examples.js';

type Result = {
  ok: boolean;
  output: string[];
  tokens: any[];
  ast: any;
  trace: any[];
  steps: number;
  calls: number;
  duration: number;
  value?: string;
  error?: {
    phase: string;
    message: string;
    line: number;
    col: number;
    frames: { name: string; line: number }[];
  };
};
function Highlight({ source }: { source: string }) {
  let tokens: any[] = [];
  try {
    tokens = lex(source);
  } catch {
    return <>{source + '\n'}</>;
  }
  let offset = 0;
  const pieces: any[] = [];
  for (const t of tokens) {
    if (t.start > offset)
      pieces.push(
        <span className="syntax-comment" key={'gap' + offset}>
          {source.slice(offset, t.start)}
        </span>,
      );
    pieces.push(
      <span
        key={'token' + t.start}
        className={
          'syntax-' +
          (t.type === 'STRING'
            ? 'string'
            : t.type === 'NUMBER'
              ? 'number'
              : [
                    'let',
                    'fn',
                    'if',
                    'else',
                    'while',
                    'return',
                    'true',
                    'false',
                    'nil',
                  ].includes(t.type)
                ? 'keyword'
                : t.type === 'IDENT'
                  ? 'identifier'
                  : 'operator')
        }
      >
        {t.text}
      </span>,
    );
    offset = t.end;
  }
  return (
    <>
      {pieces}
      {'\n'}
    </>
  );
}
function Tree({
  node,
  label = 'Program',
  level = 0,
}: {
  node: any;
  label?: string;
  level?: number;
}) {
  if (node === null || typeof node !== 'object')
    return (
      <div className="tree-value">
        <span>{label}</span> <b>{JSON.stringify(node)}</b>
      </div>
    );
  const entries = Object.entries(node).filter(
    ([key]) => !['line', 'col', 'kind'].includes(key),
  );
  return (
    <details className="tree-node" open={level < 2}>
      <summary>
        <span>{node.kind || label}</span>
        {node.line && <small>line {node.line}</small>}
        {Array.isArray(node) && <small>{node.length} items</small>}
      </summary>
      <div>
        {entries.map(([key, value]) => (
          <Tree key={key} node={value} label={key} level={level + 1} />
        ))}
      </div>
    </details>
  );
}
export default function Home() {
  const [selected, setSelected] = useState('fibonacci'),
    [source, setSource] = useState(examples[0].source),
    [result, setResult] = useState<Result | null>(null),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState('console'),
    [repl, setRepl] = useState(''),
    [history, setHistory] = useState<
      { input: string; output: string[]; error?: string }[]
    >([]),
    [dirty, setDirty] = useState(false),
    [saved, setSaved] = useState(false),
    [cursor, setCursor] = useState({ line: 1, col: 1 }),
    [replHistoryIndex, setReplHistoryIndex] = useState(-1);
  const editor = useRef<HTMLTextAreaElement>(null),
    highlight = useRef<HTMLPreElement>(null),
    gutter = useRef<HTMLDivElement>(null),
    worker = useRef<Worker | null>(null),
    requestId = useRef(0),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    pending = useRef<{
      resolve: (r: Result) => void;
      mode: string;
      input: string;
    } | null>(null),
    sourceRef = useRef(source);
  sourceRef.current = source;
  const example = examples.find((e) => e.id === selected) || examples[0];
  const startWorker = useCallback(() => {
    const w = new Worker(new URL('../lib/pebble/worker.js', import.meta.url), {
      type: 'module',
    });
    worker.current = w;
    w.onmessage = ({ data }) => {
      if (data.id !== requestId.current) return;
      if (timer.current) clearTimeout(timer.current);
      const p = pending.current;
      pending.current = null;
      setBusy(false);
      if (p?.mode === 'repl') {
        setHistory((h) => [
          ...h,
          {
            input: p.input,
            output: [
              ...data.result.output,
              ...(data.result.value && data.result.value !== 'nil'
                ? [data.result.value]
                : []),
            ],
            error: data.result.error?.message,
          },
        ]);
      } else {
        setResult(data.result);
        setDirty(false);
      }
      p?.resolve(data.result);
    };
    w.onerror = () => {
      setBusy(false);
      const r: Result = {
        ok: false,
        output: [],
        tokens: [],
        ast: null,
        trace: [],
        steps: 0,
        calls: 0,
        duration: 0,
        error: {
          phase: 'Studio',
          message:
            'The execution worker failed. Reload the page to restart it.',
          line: 1,
          col: 1,
          frames: [],
        },
      };
      setResult(r);
      pending.current?.resolve(r);
      pending.current = null;
    };
    return w;
  }, []);
  const execute = useCallback(
    (code: string, mode = 'run'): Promise<Result> => {
      if (pending.current)
        return Promise.reject(new Error('A program is already running.'));
      setBusy(true);
      if (mode === 'run') {
        setHistory([]);
        setTab('console');
      }
      const w = worker.current || startWorker();
      const id = ++requestId.current;
      return new Promise((resolve) => {
        pending.current = { resolve, mode, input: code };
        w.postMessage({ id, source: code, mode });
        timer.current = setTimeout(() => {
          w.terminate();
          worker.current = null;
          setBusy(false);
          const r: Result = {
            ok: false,
            output: [],
            tokens: [],
            ast: null,
            trace: [],
            steps: 0,
            calls: 0,
            duration: 3000,
            error: {
              phase: 'Runtime',
              message:
                'Execution stopped after 3 seconds. Reduce the program size and run again.',
              line: 1,
              col: 1,
              frames: [],
            },
          };
          setResult(r);
          pending.current = null;
          resolve(r);
        }, 3000);
      });
    },
    [startWorker],
  );
  useEffect(() => {
    let initial = examples[0].source;
    try {
      const draft = localStorage.getItem('pebble-draft-v1');
      if (draft) {
        const parsed = JSON.parse(draft);
        if (
          typeof parsed.source === 'string' &&
          parsed.source.length <= 100000
        ) {
          initial = parsed.source;
          setSource(initial);
          if (examples.some((e) => e.id === parsed.selected))
            setSelected(parsed.selected);
          setSaved(true);
        }
      }
    } catch {}
    execute(initial);
    return () => {
      worker.current?.terminate();
      worker.current = null;
      if (timer.current) clearTimeout(timer.current);
      pending.current = null;
    };
  }, [execute]);
  useEffect(() => {
    const context = (document as any).modelContext;
    if (!context?.registerTool) return;
    const life = new AbortController();
    try {
      Promise.resolve(
        context.registerTool(
          {
            name: 'run_pebble_program',
            title: 'Run a Pebble program',
            description:
              'Replace the visible editor source and execute a Pebble program. Returns output or a source diagnostic.',
            inputSchema: {
              type: 'object',
              properties: { source: { type: 'string', maxLength: 100000 } },
              required: ['source'],
              additionalProperties: false,
            },
            annotations: { readOnlyHint: false, untrustedContentHint: true },
            async execute(input: any) {
              if (
                !input ||
                typeof input.source !== 'string' ||
                input.source.length > 100000
              )
                throw new Error(
                  'source must be a string with at most 100,000 characters.',
                );
              if (pending.current)
                throw new Error('Wait for the current run to finish.');
              setSource(input.source);
              setDirty(true);
              const r = await execute(input.source);
              return {
                ok: r.ok,
                output: r.output,
                error: r.error,
                steps: r.steps,
              };
            },
          },
          { signal: life.signal },
        ),
      ).catch(() => {});
    } catch {}
    return () => life.abort();
  }, [execute]);
  function change(value: string) {
    setSource(value);
    setDirty(true);
    try {
      localStorage.setItem(
        'pebble-draft-v1',
        JSON.stringify({ source: value, selected }),
      );
      setSaved(true);
    } catch {
      setSaved(false);
    }
  }
  function choose(id: string) {
    if (busy) return;
    const e = examples.find((e) => e.id === id)!;
    setSelected(id);
    setSource(e.source);
    setDirty(false);
    try {
      localStorage.setItem(
        'pebble-draft-v1',
        JSON.stringify({ source: e.source, selected: id }),
      );
      setSaved(true);
    } catch {}
    execute(e.source);
  }
  function stop() {
    worker.current?.terminate();
    worker.current = null;
    if (timer.current) clearTimeout(timer.current);
    setBusy(false);
    const r: Result = {
      ok: false,
      output: [],
      tokens: [],
      ast: null,
      trace: [],
      steps: 0,
      calls: 0,
      duration: 0,
      error: {
        phase: 'Runtime',
        message: 'Execution stopped. Run again to start a fresh session.',
        line: 1,
        col: 1,
        frames: [],
      },
    };
    pending.current?.resolve(r);
    pending.current = null;
    setResult(r);
  }
  function download() {
    const url = URL.createObjectURL(new Blob([source], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = selected + '.pebble';
    a.click();
    URL.revokeObjectURL(url);
  }
  function jump(line: number) {
    const el = editor.current;
    if (!el) return;
    const pos = source
      .split('\n')
      .slice(0, line - 1)
      .reduce((a, b) => a + b.length + 1, 0);
    el.focus();
    el.setSelectionRange(
      pos,
      pos + (source.split('\n')[line - 1]?.length || 0),
    );
    el.scrollTop = Math.max(0, (line - 4) * 25);
    if (highlight.current) highlight.current.scrollTop = el.scrollTop;
    if (gutter.current) gutter.current.scrollTop = el.scrollTop;
  }
  const icons = [Code2, Layers, Hash, Braces, FlaskConical];
  return (
    <main>
      <header>
        <div className="brand">
          <Circle size={25} />
          <b>pebble</b>
          <span>LANGUAGE STUDIO</span>
        </div>
        <span className="badge">
          <i /> v1.0 · Built from first principles
        </span>
      </header>
      <div className="intro">
        <div>
          <p className="eyebrow">SMALL LANGUAGE. REAL POSSIBILITIES.</p>
          <h1>
            Make something <em>from nothing.</em>
          </h1>
          <p>A little language. A window into how code comes alive.</p>
        </div>
        <Dialog>
          <DialogTrigger className="guide">
            <BookOpen size={16} /> Language guide <ArrowUpRight size={16} />
          </DialogTrigger>
          <DialogContent className="language-guide">
            <DialogTitle>Pebble, in a few good ideas.</DialogTitle>
            <DialogDescription>
              A real, dynamically typed language with lexical scope. Written
              from scratch, running on your device.
            </DialogDescription>
            <div className="guide-grid">
              {[
                [
                  'Variables & values',
                  'let name = "Pebble";\nlet values = [1, 2, 3];',
                  'Numbers, strings, booleans, nil, lists, and functions. Semicolons end statements.',
                ],
                [
                  'Control flow',
                  'if (true) { print("yes"); }\nwhile (n < 10) { n = n + 1; }',
                  'Only false and nil are falsy. Use &&, ||, and ! for logic.',
                ],
                [
                  'Functions & closures',
                  'fn double(n) { return n * 2; }\nprint(double(21));',
                  'Functions capture visible variables, accept exact argument counts, and can return functions.',
                ],
                [
                  'A small standard library',
                  'print("hello", 42);\nlen(range(5)); // 5',
                  'print · len · range · push · str · type · upper · lower · abs · floor',
                ],
              ].map(([title, code, desc]) => (
                <section key={title}>
                  <h3>{title}</h3>
                  <pre>{code}</pre>
                  <p>{desc}</p>
                </section>
              ))}
            </div>
            <div className="guide-pipeline">
              <b>Under the hood</b>
              <p>
                Source → hand-written lexer → Pratt parser → syntax tree →
                tree-walking interpreter. The explorer shows real tokens, nodes,
                and the first 300 execution events.
              </p>
              <p>
                Run starts a fresh environment. The REPL continues it. Limits:
                200,000 steps, 100 calls deep, 1,000 output lines. This release
                uses an interpreter; a bytecode VM is a future extension.
              </p>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <nav className="mobile-examples" aria-label="Examples">
        {examples.map((e) => (
          <button
            key={e.id}
            disabled={busy}
            className={selected === e.id ? 'selected' : ''}
            onClick={() => choose(e.id)}
          >
            {e.title}
          </button>
        ))}
      </nav>
      <section className="workspace">
        <aside>
          <p className="eyebrow">THE PLAYGROUND</p>
          <h3>Start with a spark</h3>
          {examples.map((e, i) => {
            const Icon = icons[i];
            return (
              <button
                key={e.id}
                disabled={busy}
                className={'example ' + (selected === e.id ? 'selected' : '')}
                onClick={() => choose(e.id)}
              >
                <Icon size={17} />
                <span>
                  {e.title}
                  <small>{e.subtitle}</small>
                </span>
                {selected === e.id && (
                  <ChevronRight size={13} className="example-arrow" />
                )}
              </button>
            );
          })}
          <div className="aside-note">
            <span>01 / THE LANGUAGE</span>
            <h3>
              Small by design.
              <br />
              Powerful by nature.
            </h3>
            <p>
              Variables, functions, closures, and a few good ideas. All running
              right in your browser.
            </p>
            <div className="mini-tags">
              <span>NO FRAMEWORKS*</span>
              <span>NO MAGIC</span>
            </div>
            <small>* In the language engine.</small>
          </div>
        </aside>
        <div className="editor-panel">
          <div className="panel-head">
            <span>
              <Code2 size={16} /> {selected}.pebble{' '}
              {dirty && (
                <i className="unsaved-dot" title="Changes not yet run" />
              )}
            </span>
            <button
              className="run"
              onClick={() => (busy ? stop() : execute(source))}
            >
              {busy ? <Square size={14} /> : <Play size={14} />}{' '}
              {busy ? 'Stop' : 'Run code'}
              <kbd>⌘ ↵</kbd>
            </button>
          </div>
          <div className="editor-tools">
            <span>{example.tag}</span>
            <div>
              <button
                aria-label="Reset example"
                title="Reset example"
                disabled={busy}
                onClick={() => choose(selected)}
              >
                <RotateCcw size={14} />
              </button>
              <button
                aria-label="Download Pebble source"
                title="Download .pebble"
                onClick={download}
              >
                <Download size={15} />
              </button>
            </div>
          </div>
          <div className="code-area">
            <div className="line-numbers" ref={gutter} aria-hidden="true">
              {source.split('\n').map((_, i) => (
                <div
                  key={i}
                  className={
                    !dirty && result?.error?.line === i + 1 ? 'error-line' : ''
                  }
                >
                  {i + 1}
                </div>
              ))}
            </div>
            <div className="code-stack">
              <pre ref={highlight} className="highlight" aria-hidden="true">
                <Highlight source={source} />
              </pre>
              <textarea
                aria-label="Pebble source code"
                ref={editor}
                value={source}
                disabled={busy}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                wrap="off"
                onChange={(e) => change(e.target.value)}
                onSelect={(e) => {
                  const el = e.currentTarget;
                  const before = source.slice(0, el.selectionStart);
                  setCursor({
                    line: before.split('\n').length,
                    col: before.length - before.lastIndexOf('\n'),
                  });
                }}
                onScroll={(e) => {
                  if (highlight.current) {
                    highlight.current.scrollTop = e.currentTarget.scrollTop;
                    highlight.current.scrollLeft = e.currentTarget.scrollLeft;
                  }
                  if (gutter.current)
                    gutter.current.scrollTop = e.currentTarget.scrollTop;
                }}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    execute(source);
                  }
                  if (e.key === 'Tab' && !e.shiftKey) {
                    e.preventDefault();
                    const start = e.currentTarget.selectionStart,
                      end = e.currentTarget.selectionEnd;
                    change(source.slice(0, start) + '  ' + source.slice(end));
                    requestAnimationFrame(() =>
                      editor.current?.setSelectionRange(start + 2, start + 2),
                    );
                  }
                }}
              />
            </div>
          </div>
          <div className="example-context">
            <span>
              <BookOpen size={13} /> THE IDEA
            </span>
            <p>{example.description}</p>
          </div>
          <div className="editor-foot">
            <span className="saved">
              {saved ? <Check size={11} /> : <Circle size={8} />}{' '}
              {saved ? 'Saved on this device' : 'Pebble · UTF-8'}
            </span>
            <span>
              Ln {cursor.line}, Col {cursor.col}
            </span>
          </div>
        </div>
        <div className="output-panel">
          <Tabs
            value={tab}
            onValueChange={(v) => setTab(String(v))}
            className="explorer-tabs"
          >
            <div className="explorer-heading">
              <TabsList variant="line" className="explorer-tabs-list">
                <TabsTrigger value="console">
                  <Terminal size={14} />
                  Console
                </TabsTrigger>
                <TabsTrigger value="tokens">Tokens</TabsTrigger>
                <TabsTrigger value="ast">AST</TabsTrigger>
                <TabsTrigger value="trace">Trace</TabsTrigger>
              </TabsList>
            </div>
            <div className="result-status">
              <span className={result?.ok ? 'success-label' : 'error-label'}>
                {busy
                  ? '● Running…'
                  : dirty
                    ? '○ Source changed — run to update'
                    : result?.ok
                      ? '● Executed successfully'
                      : result?.error
                        ? '● ' + result.error.phase + ' error'
                        : '○ Ready'}
              </span>
              {result && !busy && <span>{result.duration.toFixed(2)} ms</span>}
            </div>
            <TabsContent value="console" className="console-content">
              <div className="console" aria-live="polite">
                <p className="console-note">
                  {result
                    ? '// stdout · ' + selected + '.pebble'
                    : '// Run a program to see its output'}
                </p>
                {result?.output.map((line, i) => (
                  <div className="output-line" key={i}>
                    <span>{String(i + 1).padStart(2, '0')}</span>
                    <pre>{line}</pre>
                  </div>
                ))}
                {result?.ok && result.output.length === 0 && (
                  <p className="console-note">
                    Program finished without printing output.
                  </p>
                )}
                {result?.error && (
                  <div className="diagnostic">
                    <b>{result.error.phase} error</b>
                    <p>{result.error.message}</p>
                    <button onClick={() => jump(result.error!.line)}>
                      Go to line {result.error.line}:{result.error.col}{' '}
                      <ArrowUpRight size={12} />
                    </button>
                    <pre>
                      {source.split('\n')[result.error.line - 1]}
                      {'\n'}
                      {' '.repeat(Math.min(200, result.error.col - 1))}^
                    </pre>
                    {result.error.frames.map((f, i) => (
                      <small key={i}>
                        at {f.name} · line {f.line}
                      </small>
                    ))}
                  </div>
                )}
                {result?.ok && (
                  <div className="console-done">
                    <Check size={12} /> Program finished
                  </div>
                )}
                {history.map((h, i) => (
                  <div className="repl-entry" key={i}>
                    <div>
                      <span className="prompt">› </span>
                      {h.input}
                    </div>
                    {h.output.map((v, j) => (
                      <pre key={j}>{v}</pre>
                    ))}
                    {h.error && <p className="error-label">{h.error}</p>}
                  </div>
                ))}
              </div>
              <form
                className="repl"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!repl.trim() || busy) return;
                  let input = repl.trim();
                  if (!input.endsWith(';') && !input.endsWith('}'))
                    input += ';';
                  execute(input, 'repl');
                  setRepl('');
                  setReplHistoryIndex(-1);
                }}
              >
                <div className="repl-label">
                  <span>
                    REPL <small>Same environment. Keep exploring.</small>
                  </span>
                  <button
                    type="button"
                    aria-label="Clear REPL history"
                    onClick={() => setHistory([])}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                <div className="repl-input">
                  <span>›</span>
                  <input
                    aria-label="REPL expression"
                    placeholder="Try fib(12)"
                    value={repl}
                    disabled={busy}
                    onChange={(e) => setRepl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowUp' && history.length) {
                        e.preventDefault();
                        const i =
                          replHistoryIndex < 0
                            ? history.length - 1
                            : Math.max(0, replHistoryIndex - 1);
                        setReplHistoryIndex(i);
                        setRepl(history[i].input);
                      }
                    }}
                  />
                  <button
                    type="submit"
                    disabled={busy || !repl.trim()}
                    aria-label="Evaluate expression"
                  >
                    ↵
                  </button>
                </div>
              </form>
            </TabsContent>
            <TabsContent value="tokens" className="inspector">
              <p className="inspector-intro">
                The lexer turns characters into meaningful pieces.{' '}
                <b>{Math.max(0, (result?.tokens.length || 1) - 1)} tokens</b>
              </p>
              <div className="token-list">
                {result?.tokens
                  .filter((t) => t.type !== 'EOF')
                  .map((t, i) => (
                    <button
                      key={i}
                      onClick={() => jump(t.line)}
                      className={'token token-' + t.type}
                    >
                      <code>{t.text}</code>
                      <small>{t.type}</small>
                      <span>
                        {t.line}:{t.col}
                      </span>
                    </button>
                  ))}
              </div>
            </TabsContent>
            <TabsContent value="ast" className="inspector">
              <p className="inspector-intro">
                The parser gives tokens structure. Expand a node to look inside.
              </p>
              {result?.ast ? (
                <Tree node={result.ast} />
              ) : (
                <p>No syntax tree yet. Fix the source error and run again.</p>
              )}
            </TabsContent>
            <TabsContent value="trace" className="inspector">
              <p className="inspector-intro">
                Follow the interpreter through your program. Showing the first{' '}
                <b>{result?.trace.length || 0}</b> events; click to visit the
                source.
              </p>
              {result?.trace.map((event, i) => (
                <button
                  className="trace-event"
                  key={i}
                  onClick={() => jump(event.line)}
                >
                  <span>{String(event.step).padStart(4, '0')}</span>
                  <b>{event.kind}</b>
                  <code>{event.detail}</code>
                  <small>L{event.line}</small>
                </button>
              ))}
            </TabsContent>
          </Tabs>
          <div className="runtime-stats">
            <span>
              <i /> Tree-walk interpreter
            </span>
            <span>
              {result?.steps.toLocaleString() || '0'} steps ·{' '}
              {result?.calls || 0} calls
            </span>
          </div>
        </div>
      </section>
      <footer>
        <span>
          <i /> Everything runs on your device
        </span>
        <span>
          Source <ChevronRight /> Tokens <ChevronRight /> Syntax tree{' '}
          <ChevronRight /> Execution
        </span>
        <span>Built from scratch. Open to exploration.</span>
      </footer>
    </main>
  );
}
