'use client';
import {
  useEffect,
  useRef,
  useState,
  type SyntheticEvent,
  type CSSProperties,
} from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Braces,
  Check,
  ChevronRight,
  Circle,
  Code2,
  Copy,
  Cpu,
  ExternalLink,
  Layers,
  LoaderCircle,
  Play,
  Pause,
  ShieldCheck,
  Sparkles,
  Terminal,
} from 'lucide-react';

import { parseEcosystemTool, ecosystemLocation } from './navigation.mjs';
import { boundedScrollProgress, pointerTilt } from './motion.mjs';
import { useMotionPreference } from './use-motion';

export const ECOSYSTEM_URLS = {
  language: 'https://pebble-peach-kappa.vercel.app/?view=ecosystem',
  model: 'https://pebble-llm.vercel.app/',
  sentinel: 'https://pebble-sentinel.vercel.app/',
};
type Journey = 'language' | 'model' | 'sentinel';
type Scenario = {
  id: string;
  title: string;
  description: string;
  family: string;
};
type GuardEvent = {
  id: string;
  seq: number;
  pebble: string;
  decision: 'allow' | 'hold' | 'block';
  would_have?: string;
  reason: string;
  rules: string[];
  surprise_bits: number | null;
  executed?: boolean;
};
type Simulation = {
  events: GuardEvent[];
  summary: { allow: number; hold: number; block: number };
  model?: { kind?: string; parameters?: number; calibrated?: boolean };
  simulation?: { canary_deliveries?: number; note?: string };
};
type Generation = {
  answer: string;
  parameters: number;
  elapsedMs: number;
  maxNewTokens: number;
  seed: number;
  temperature: number;
};
const journeys = [
  {
    id: 'language' as const,
    number: '01',
    label: 'Build',
    title: 'Make an idea run.',
    text: 'Write a small program, see its output, and follow every step.',
    icon: Braces,
  },
  {
    id: 'model' as const,
    number: '02',
    label: 'Understand',
    title: 'Meet your own model.',
    text: 'Ask a tiny model about Pebble, then inspect how it was trained.',
    icon: Cpu,
  },
  {
    id: 'sentinel' as const,
    number: '03',
    label: 'Protect',
    title: 'Watch an agent act.',
    text: 'See a suspicious action held before it reaches a tool.',
    icon: ShieldCheck,
  },
];
async function request<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('The service is unavailable right now. Please try again.');
  }
  if (!response.ok)
    throw new Error(
      data &&
        typeof data === 'object' &&
        'error' in data &&
        typeof data.error === 'string'
        ? data.error
        : 'The service could not finish this request. Please try again.',
    );
  return data as T;
}
export function EcosystemBar({
  studio = false,
  onHome,
  onStudio,
}: {
  studio?: boolean;
  onHome: () => void;
  onStudio: () => void;
}) {
  const motion = useMotionPreference();
  return (
    <nav className="ecosystem-bar" aria-label="Pebble ecosystem">
      <button
        className="eco-wordmark"
        onClick={onHome}
        aria-label="Pebble ecosystem home"
      >
        <span className="eco-mark">
          <Circle size={14} />
        </span>
        <strong>pebble</strong>
        <span>ecosystem</span>
      </button>
      <div className="eco-product-nav">
        <button aria-current="page" className="active" onClick={onStudio}>
          <Braces size={14} />
          Language
        </button>
        <a href={ECOSYSTEM_URLS.model}>
          <Cpu size={14} />
          Model
          <ArrowUpRight size={12} />
        </a>
        <a href={ECOSYSTEM_URLS.sentinel}>
          <ShieldCheck size={14} />
          Sentinel
          <ArrowUpRight size={12} />
        </a>
      </div>
      <button
        className="eco-motion-toggle"
        aria-pressed={motion.reduced}
        disabled={motion.mode === 'system-reduced'}
        onClick={motion.toggle}
        title={
          motion.mode === 'system-reduced'
            ? 'Your system preference reduces motion.'
            : motion.reduced
              ? 'Turn motion on'
              : 'Reduce animations and smooth scrolling'
        }
      >
        {motion.reduced ? <Pause size={13} /> : <Sparkles size={13} />}
        {motion.mode === 'system-reduced'
          ? 'System: reduced'
          : motion.reduced
            ? 'Motion reduced'
            : 'Motion on'}
      </button>
      <button className="eco-nav-cta" onClick={studio ? onHome : onStudio}>
        {studio ? 'Explore ecosystem' : 'Open studio'}
        <ArrowRight size={14} />
      </button>
    </nav>
  );
}
function ModelPanel() {
  const [prompt, setPrompt] = useState('What is Pebble?');
  const [temperature, setTemperature] = useState(0);
  const [maxNewTokens, setMaxNewTokens] = useState(64);
  const [result, setResult] = useState<Generation | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function generate(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (
      !prompt.trim() ||
      prompt.length > 160 ||
      !/^[\x20-\x7e\n\t]+$/.test(prompt)
    ) {
      setError('Use a question with 1–160 plain English characters.');
      return;
    }
    setBusy(true);
    setError('');
    setResult(null);
    setCopied(false);
    const active = new AbortController();
    controller.current = active;
    try {
      const data = await request<Generation>(
        '/api/ecosystem/llm/generate',
        { prompt: prompt.trim(), maxNewTokens, temperature, seed: 2026 },
        active.signal,
      );
      if (
        typeof data.answer !== 'string' ||
        data.parameters !== 2_000_000 ||
        !Number.isFinite(data.elapsedMs) ||
        data.elapsedMs < 0 ||
        data.maxNewTokens !== maxNewTokens ||
        data.seed !== 2026 ||
        data.temperature !== temperature
      )
        throw new Error(
          'The model returned an unexpected response. Please retry.',
        );
      if (!active.signal.aborted) setResult(data);
    } catch (e) {
      if (!active.signal.aborted)
        setError(
          e instanceof Error ? e.message : 'Generation failed. Please retry.',
        );
    } finally {
      if (controller.current === active) {
        setBusy(false);
        controller.current = null;
      }
    }
  }
  return (
    <div className="eco-tool-panel">
      <div className="eco-panel-intro">
        <span className="eco-pill">
          <Cpu size={13} />
          PebbleLM · 2,000,000 parameters
        </span>
        <h3>
          A small model.
          <br />
          An open learning loop.
        </h3>
        <p>
          This educational model learned a small Pebble curriculum. Ask about a
          concept, then try a reviewed example in the studio.
        </p>
        <a href={ECOSYSTEM_URLS.model} className="eco-text-link">
          Explore the full model lab
          <ArrowUpRight size={15} />
        </a>
      </div>
      <div className="eco-interactive">
        <form onSubmit={generate}>
          <label htmlFor="eco-model-prompt">
            What would you like to understand?
          </label>
          <textarea
            id="eco-model-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            maxLength={160}
            rows={3}
            disabled={busy}
          />
          <div className="eco-prompt-chips">
            {['What is Pebble?', 'Explain closures.', 'What is attention?'].map(
              (q) => (
                <button
                  type="button"
                  key={q}
                  onClick={() => setPrompt(q)}
                  disabled={busy}
                >
                  {q}
                </button>
              ),
            )}
          </div>
          <div className="eco-model-options">
            <label>
              Answer length
              <select
                value={maxNewTokens}
                onChange={(e) => setMaxNewTokens(Number(e.target.value))}
                disabled={busy}
              >
                <option value={32}>Short · 32 characters</option>
                <option value={64}>Medium · 64 characters</option>
                <option value={96}>Long · 96 characters</option>
              </select>
            </label>
            <label>
              Sampling
              <select
                value={temperature}
                onChange={(e) => setTemperature(Number(e.target.value))}
                disabled={busy}
              >
                <option value={0}>Repeatable · greedy</option>
                <option value={0.5}>Exploratory · 0.5</option>
              </select>
            </label>
          </div>
          <div className="eco-form-actions">
            <button className="eco-button" disabled={busy}>
              {busy ? (
                <LoaderCircle size={16} className="eco-spin" />
              ) : (
                <Sparkles size={16} />
              )}{' '}
              {busy ? 'Generating…' : 'Ask the model'}
            </button>
            {busy ? (
              <button
                className="eco-secondary"
                type="button"
                onClick={() => {
                  controller.current?.abort();
                  setBusy(false);
                  setError('Request cancelled. You can try another question.');
                }}
              >
                Cancel request
              </button>
            ) : null}
          </div>
        </form>
        <div className="eco-response" aria-live="polite" aria-busy={busy}>
          {error ? (
            <p className="eco-error" role="alert">
              {error}
            </p>
          ) : result ? (
            <>
              <div className="eco-response-heading">
                <span>MODEL RESPONSE</span>
                <button
                  aria-label="Copy model response"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(result.answer);
                      setCopied(true);
                    } catch {
                      setError(
                        'Copy is unavailable in this browser. Select the answer to copy it.',
                      );
                    }
                  }}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}{' '}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p>
                {result.answer ||
                  'The model ended its answer without producing text. Try a different question.'}
              </p>
              <small>
                {result.parameters.toLocaleString()} parameters ·{' '}
                {(result.elapsedMs / 1000).toFixed(1)}s · generated from trained
                weights
              </small>
            </>
          ) : (
            <div className="eco-response-empty">
              <Layers size={20} />
              <p>
                {busy
                  ? 'Running the real Pebble model. This may take a moment.'
                  : 'Your model response will appear here.'}
              </p>
            </div>
          )}
        </div>
        <p className="eco-fine-print">
          Educational, not a general assistant. Answers can be wrong. Generated
          text is never executed in the studio.
        </p>
      </div>
    </div>
  );
}
function GuardPanel() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [scenario, setScenario] = useState('injection-exfiltration');
  const [mode, setMode] = useState<'enforce' | 'shadow'>('enforce');
  const [result, setResult] = useState<Simulation | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [scenarioRetry, setScenarioRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const active = new AbortController();
    request<Scenario[] | { scenarios: Scenario[] }>(
      '/api/ecosystem/sentinel/scenarios',
      undefined,
      active.signal,
    )
      .then((data) => {
        const rows = Array.isArray(data) ? data : data.scenarios;
        if (
          !Array.isArray(rows) ||
          rows.some(
            (s) => typeof s.id !== 'string' || typeof s.title !== 'string',
          )
        )
          throw new Error('Scenarios could not be loaded.');
        setScenarios(rows);
        if (!rows.some((s) => s.id === 'injection-exfiltration'))
          setScenario(rows[0]?.id ?? '');
        setError('');
      })
      .catch((e) => {
        if (!active.signal.aborted)
          setError(
            e instanceof Error
              ? e.message
              : 'Could not load the guard scenarios.',
          );
      })
      .finally(() => {
        if (!active.signal.aborted) setLoading(false);
      });
    return () => {
      active.abort();
      controller.current?.abort();
    };
  }, [scenarioRetry]);
  async function simulate(event?: SyntheticEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (busy || !scenario) return;
    const active = new AbortController();
    controller.current = active;
    setBusy(true);
    setError('');
    setResult(null);
    setShowAll(false);
    try {
      const data = await request<Simulation>(
        '/api/ecosystem/sentinel/simulate',
        { scenario, mode },
        active.signal,
      );
      if (!Array.isArray(data.events) || !data.summary)
        throw new Error(
          'The guard returned an unexpected response. Please retry.',
        );
      if (!active.signal.aborted) setResult(data);
    } catch (e) {
      if (!active.signal.aborted)
        setError(
          e instanceof Error
            ? e.message
            : 'The simulation failed. Please try again.',
        );
    } finally {
      if (controller.current === active) {
        setBusy(false);
        controller.current = null;
      }
    }
  }
  const selected = scenarios.find((s) => s.id === scenario);
  const visible = result
    ? showAll
      ? result.events
      : result.events.slice(0, 5)
    : [];
  return (
    <div className="eco-tool-panel">
      <div className="eco-panel-intro">
        <span className="eco-pill">
          <ShieldCheck size={13} />
          Pebble Sentinel · local agent guard
        </span>
        <h3>
          One bad instruction.
          <br />
          One safer decision.
        </h3>
        <p>
          Replay a suspicious agent workflow. Sentinel turns each requested
          action into a fixed vocabulary, applies rules, and scores it with
          trained weights.
        </p>
        <a href={ECOSYSTEM_URLS.sentinel} className="eco-text-link">
          Open the full guard laboratory
          <ArrowUpRight size={15} />
        </a>
      </div>
      <div className="eco-interactive">
        <form onSubmit={simulate}>
          <label htmlFor="eco-scenario">Choose a workflow</label>
          <select
            id="eco-scenario"
            value={scenario}
            onChange={(e) => {
              setScenario(e.target.value);
              setResult(null);
            }}
            disabled={loading || busy || !scenarios.length}
          >
            {scenarios.length ? (
              scenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))
            ) : (
              <option>
                {loading ? 'Loading scenarios…' : 'Scenarios unavailable'}
              </option>
            )}
          </select>
          {selected ? (
            <p className="eco-scenario-description">{selected.description}</p>
          ) : null}
          <fieldset className="eco-mode-choice">
            <legend>How should the guard respond?</legend>
            <label htmlFor="eco-mode-enforce">
              <input
                id="eco-mode-enforce"
                type="radio"
                name="eco-mode"
                value="enforce"
                checked={mode === 'enforce'}
                onChange={() => {
                  setMode('enforce');
                  setResult(null);
                }}
                disabled={busy}
              />{' '}
              <span>
                <b>Enforce</b>
                <small>Hold or block suspicious requests.</small>
              </span>
            </label>
            <label htmlFor="eco-mode-shadow">
              <input
                id="eco-mode-shadow"
                type="radio"
                name="eco-mode"
                value="shadow"
                checked={mode === 'shadow'}
                onChange={() => {
                  setMode('shadow');
                  setResult(null);
                }}
                disabled={busy}
              />{' '}
              <span>
                <b>Shadow</b>
                <small>Show recommendations without enforcing.</small>
              </span>
            </label>
          </fieldset>
          <button
            className="eco-button"
            disabled={busy || loading || !scenarios.length}
          >
            {busy ? (
              <LoaderCircle size={16} className="eco-spin" />
            ) : (
              <Play size={15} />
            )}{' '}
            {busy ? 'Checking actions…' : 'Run the safe replay'}
          </button>
        </form>
        {error ? (
          <p className="eco-error" role="alert">
            {error}
            <button
              type="button"
              onClick={() => {
                if (scenarios.length) void simulate();
                else {
                  setLoading(true);
                  setError('');
                  setScenarioRetry((value) => value + 1);
                }
              }}
              className="eco-text-link"
            >
              Try again
              <ArrowRight size={13} />
            </button>
          </p>
        ) : null}
        <div aria-live="polite" aria-busy={busy}>
          {result ? (
            <>
              <div className="eco-guard-summary">
                <span>
                  <b>{result.summary.allow}</b> allow
                </span>
                <span>
                  <b>{result.summary.hold}</b> hold
                </span>
                <span>
                  <b>{result.summary.block}</b> block
                </span>
              </div>
              <ol className="eco-guard-events">
                {visible.map((event) => (
                  <li key={event.id}>
                    <span className={'eco-verdict ' + event.decision}>
                      {event.decision}
                    </span>
                    <div>
                      <code>{event.pebble}</code>
                      <p>
                        {event.rules.length
                          ? event.rules.join(' · ')
                          : event.reason}
                        {mode === 'shadow' &&
                        event.would_have !== event.decision
                          ? ` · would ${event.would_have}`
                          : ''}
                      </p>
                      {event.executed === false ? (
                        <small>Stopped before this action · replay only</small>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
              {result.events.length > 5 ? (
                <button
                  className="eco-text-link"
                  onClick={() => setShowAll(!showAll)}
                >
                  {showAll
                    ? 'Show fewer actions'
                    : `See all ${result.events.length} actions`}
                  <ChevronRight size={14} />
                </button>
              ) : null}
              <p className="eco-fine-print">
                Scorer:{' '}
                {result.model?.kind ?? 'See full result in the laboratory'}
                {result.model?.parameters
                  ? ` · ${result.model.parameters.toLocaleString()} parameters`
                  : ''}
                .
              </p>
            </>
          ) : (
            <div className="eco-response-empty">
              <ShieldCheck size={23} />
              <p>Run a replay to see the guard’s decisions.</p>
            </div>
          )}
        </div>
        <p className="eco-fine-print">
          A safe hosted demonstration. No secrets, commands or attacker traffic
          are executed. Real protection requires the local harness adapter.
        </p>
      </div>
    </div>
  );
}
export function Ecosystem({
  onOpenStudio,
}: {
  onOpenStudio: (example?: string) => void;
}) {
  const [journey, setJourney] = useState<Journey>('language');
  const motion = useMotionPreference();
  const home = useRef<HTMLElement>(null);
  const hero = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let frame = 0;
    const synchronize = () => {
      const requested = parseEcosystemTool(
        window.location.search,
      ) as Journey | null;
      setJourney(requested ?? 'language');
      if (requested && window.location.hash === '#ecosystem-workbench') {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() =>
          document
            .getElementById('ecosystem-workbench')
            ?.scrollIntoView({ behavior: 'instant', block: 'start' }),
        );
      }
    };
    synchronize();
    window.addEventListener('popstate', synchronize);
    return () => {
      window.removeEventListener('popstate', synchronize);
      cancelAnimationFrame(frame);
    };
  }, []);
  useEffect(() => {
    if (motion.reduced) {
      hero.current?.style.setProperty('--eco-scroll', '0');
      return;
    }
    let frame = 0;
    const update = () => {
      frame = 0;
      if (hero.current)
        hero.current.style.setProperty(
          '--eco-scroll',
          String(boundedScrollProgress(window.scrollY, 800)),
        );
    };
    const scroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    window.addEventListener('scroll', scroll, { passive: true });
    update();
    return () => {
      window.removeEventListener('scroll', scroll);
      cancelAnimationFrame(frame);
    };
  }, [motion.reduced]);
  useEffect(() => {
    const root = home.current;
    if (!root || motion.reduced || typeof IntersectionObserver === 'undefined')
      return;
    const elements = root.querySelectorAll<HTMLElement>('.eco-reveal');
    let observer: IntersectionObserver | null = null;
    try {
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries)
            if (entry.isIntersecting) {
              entry.target.classList.add('is-visible');
              observer?.unobserve(entry.target);
            }
        },
        { threshold: 0.12, rootMargin: '0px 0px -25px 0px' },
      );
      elements.forEach((element) => observer?.observe(element));
      root.classList.add('eco-motion-ready');
    } catch {
      try {
        observer?.disconnect();
      } catch {}
      root.classList.remove('eco-motion-ready');
      return;
    }
    return () => {
      try {
        observer?.disconnect();
      } catch {}
      root.classList.remove('eco-motion-ready');
    };
  }, [motion.reduced]);
  useEffect(() => {
    const root = home.current;
    if (
      !root ||
      motion.reduced ||
      !window.matchMedia('(hover: hover) and (pointer: fine)').matches
    )
      return;
    let frame = 0;
    let target: HTMLElement | null = null;
    let clientX = 0;
    let clientY = 0;
    const reset = (element: HTMLElement | null) => {
      element?.style.setProperty('--eco-tilt-x', '0deg');
      element?.style.setProperty('--eco-tilt-y', '0deg');
      element?.style.setProperty('--eco-pointer-x', '50%');
      element?.style.setProperty('--eco-pointer-y', '50%');
    };
    const update = () => {
      frame = 0;
      if (!target) return;
      const rect = target.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        reset(target);
        return;
      }
      const tilt = pointerTilt(
        clientX,
        clientY,
        rect,
        target.classList.contains('eco-orbit') ? 8 : 5,
      );
      target.style.setProperty('--eco-tilt-x', tilt.x + 'deg');
      target.style.setProperty('--eco-tilt-y', tilt.y + 'deg');
      target.style.setProperty(
        '--eco-pointer-x',
        String(
          Math.max(
            0,
            Math.min(100, ((clientX - rect.left) / rect.width) * 100),
          ),
        ) + '%',
      );
      target.style.setProperty(
        '--eco-pointer-y',
        String(
          Math.max(
            0,
            Math.min(100, ((clientY - rect.top) / rect.height) * 100),
          ),
        ) + '%',
      );
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      const next =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>('.eco-tilt')
          : null;
      if (next !== target) {
        reset(target);
        target = next;
      }
      clientX = event.clientX;
      clientY = event.clientY;
      if (!frame) frame = requestAnimationFrame(update);
    };
    const leave = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      reset(target);
      target = null;
    };
    root.addEventListener('pointermove', move, { passive: true });
    root.addEventListener('pointerleave', leave);
    return () => {
      root.removeEventListener('pointermove', move);
      root.removeEventListener('pointerleave', leave);
      leave();
    };
  }, [motion.reduced]);
  function choose(next: Journey, shouldScroll = true) {
    setJourney(next);
    window.history.replaceState(
      {},
      '',
      ecosystemLocation(
        next,
        shouldScroll || window.location.hash === '#ecosystem-workbench',
      ),
    );
    if (!shouldScroll) return;
    document.getElementById('ecosystem-workbench')?.scrollIntoView({
      behavior: motion.reduced ? 'instant' : 'smooth',
      block: 'start',
    });
  }
  return (
    <main
      className="ecosystem-home"
      ref={home}
      onFocusCapture={(event) => {
        (event.target as HTMLElement)
          .closest('.eco-reveal')
          ?.classList.add('is-visible');
      }}
    >
      <EcosystemBar
        onHome={() =>
          window.scrollTo({
            top: 0,
            behavior: motion.reduced ? 'instant' : 'smooth',
          })
        }
        onStudio={() => onOpenStudio()}
      />
      <div className="eco-hero" ref={hero}>
        <div className="eco-hero-copy eco-reveal">
          <span className="eco-eyebrow">
            <span />
            OPEN SOURCE. OPEN POSSIBILITIES.
          </span>
          <h1>
            Small beginnings.
            <br />
            Real <em>possibilities.</em>
          </h1>
          <p>
            A language to build with. A model to understand.
            <br />A guard for agents that act. One connected playground, from
            your first program to responsible AI.
          </p>
          <div className="eco-hero-actions">
            <button
              className="eco-button"
              onClick={() => onOpenStudio('launch')}
            >
              Start building
              <ArrowRight size={17} />
            </button>
            <button
              className="eco-secondary"
              onClick={() => choose('sentinel')}
            >
              Explore the guard
              <ShieldCheck size={16} />
            </button>
          </div>
          <div className="eco-hero-proof">
            <span>
              <Check size={13} />
              MIT licensed
            </span>
            <span>
              <Check size={13} />
              Real trained weights
            </span>
            <span>
              <Check size={13} />
              Made to learn by doing
            </span>
          </div>
        </div>
        <div className="eco-orbit eco-tilt" aria-hidden="true">
          <div className="eco-orbit-grid" />
          <div className="eco-orbit-ring ring-one" />
          <div className="eco-orbit-ring ring-two" />
          <div className="eco-pebble-stone">
            <span>p.</span>
          </div>
          <div className="eco-orbit-node node-language">
            <Braces size={19} />
            <div>
              <b>Language</b>
              <small>Idea → program</small>
            </div>
            <span>01</span>
          </div>
          <div className="eco-orbit-node node-model">
            <Cpu size={19} />
            <div>
              <b>Model</b>
              <small>Program → understanding</small>
            </div>
            <span>02</span>
          </div>
          <div className="eco-orbit-node node-guard">
            <ShieldCheck size={19} />
            <div>
              <b>Sentinel</b>
              <small>Understanding → trust</small>
            </div>
            <span>03</span>
          </div>
          <div className="eco-orbit-caption">
            THREE TOOLS. ONE OPEN FOUNDATION.
          </div>
        </div>
      </div>
      <section className="eco-journeys" aria-labelledby="eco-journeys-heading">
        <div className="eco-section-heading eco-reveal">
          <div>
            <span className="eco-eyebrow">A PLACE TO BEGIN</span>
            <h2 id="eco-journeys-heading">Follow your curiosity.</h2>
          </div>
          <p>
            Choose the problem you want to explore.
            <br />
            Each path leads to something you can actually try.
          </p>
        </div>
        <div className="eco-journey-grid">
          {journeys.map((item, index) => (
            <button
              key={item.id}
              onClick={() => choose(item.id)}
              className={
                'eco-journey-card eco-reveal eco-tilt ' +
                (journey === item.id ? 'selected' : '')
              }
              style={
                { '--eco-reveal-delay': `${index * 90}ms` } as CSSProperties
              }
              aria-pressed={journey === item.id}
            >
              <div className="eco-card-top">
                <item.icon size={23} />
                <span>
                  {item.number} / {item.label.toUpperCase()}
                </span>
              </div>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
              <span className="eco-card-link">
                Explore{' '}
                {item.id === 'model'
                  ? 'the model'
                  : item.id === 'sentinel'
                    ? 'the guard'
                    : 'the language'}
                <ArrowRight size={16} />
              </span>
            </button>
          ))}
        </div>
      </section>
      <section
        id="ecosystem-workbench"
        className="eco-workbench eco-reveal"
        aria-labelledby="eco-workbench-heading"
      >
        <div className="eco-workbench-head">
          <div>
            <span className="eco-eyebrow">LESS WATCHING. MORE DOING.</span>
            <h2 id="eco-workbench-heading">Your next small experiment.</h2>
          </div>
          <div className="eco-workbench-tabs" aria-label="Choose an experiment">
            {journeys.map((j) => (
              <button
                key={j.id}
                className={journey === j.id ? 'active' : ''}
                aria-pressed={journey === j.id}
                onClick={() => choose(j.id, false)}
              >
                <j.icon size={15} />
                {j.id === 'language'
                  ? 'Language'
                  : j.id === 'model'
                    ? 'Model'
                    : 'Sentinel'}
              </button>
            ))}
          </div>
        </div>
        <div className="eco-journey-content" key={journey}>
          {journey === 'language' ? (
            <div className="eco-tool-panel">
              <div className="eco-panel-intro">
                <span className="eco-pill">
                  <Braces size={13} />
                  Pebble 2.1 · browser language studio
                </span>
                <h3>
                  Think it.
                  <br />
                  Write it. Run it.
                </h3>
                <p>
                  Explore everyday programming: transform a list, parse a JSON
                  document, or organize reusable modules. Run locally in your
                  browser and inspect what changed at every step.
                </p>
                <button
                  className="eco-button"
                  onClick={() => onOpenStudio('launch')}
                >
                  Open the language studio
                  <ArrowRight size={16} />
                </button>
                <p className="eco-fine-print">
                  Your projects stay on this device. Import and export are
                  always available.
                </p>
              </div>
              <div className="eco-language-preview">
                <div className="eco-preview-title">
                  <span>
                    <Terminal size={14} />
                    main.pebble
                  </span>
                  <span>PEBBLE / 01</span>
                </div>
                <pre>
                  <code>
                    <span>const</span>
                    {' ideas = ["build", "learn", "protect"];\n\n'}
                    <span>for</span>
                    {' idea '}
                    <span>in</span>
                    {' ideas {\n  print("Let’s " + idea + ".");\n}'}
                  </code>
                </pre>
                <div className="eco-preview-output">
                  <span>
                    <Circle size={7} fill="currentColor" />
                    EXPECTED OUTPUT
                  </span>
                  <p>
                    Let’s build.
                    <br />
                    Let’s learn.
                    <br />
                    Let’s protect.
                  </p>
                </div>
                <div className="eco-example-links">
                  <button onClick={() => onOpenStudio('functional')}>
                    Transform real data
                    <ArrowUpRight size={14} />
                  </button>
                  <button onClick={() => onOpenStudio('json')}>
                    Explore JSON
                    <ArrowUpRight size={14} />
                  </button>
                  <button onClick={() => onOpenStudio('functions-v2')}>
                    Understand closures
                    <ArrowUpRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          ) : journey === 'model' ? (
            <ModelPanel />
          ) : (
            <GuardPanel />
          )}
        </div>
      </section>
      <section className="eco-why eco-reveal">
        <div>
          <span className="eco-eyebrow">BUILT TO BE UNDERSTOOD</span>
          <h2>
            From “how does it work?”
            <br />
            to “I made it work.”
          </h2>
        </div>
        <div className="eco-why-items">
          <article>
            <BookOpen size={18} />
            <h3>For learners</h3>
            <p>
              See a program’s variables and execution, then explore the model
              that was trained using the same language.
            </p>
          </article>
          <article>
            <Code2 size={18} />
            <h3>For builders</h3>
            <p>
              Take the runtime, training pipeline and agent adapter into your
              own project. Every repository is open under MIT.
            </p>
          </article>
          <article>
            <ShieldCheck size={18} />
            <h3>For agent operators</h3>
            <p>
              Test how a local action guard responds to an untrusted workflow
              before connecting it to a real harness.
            </p>
          </article>
        </div>
      </section>
      <footer className="eco-footer">
        <button
          className="eco-wordmark"
          onClick={() =>
            window.scrollTo({
              top: 0,
              behavior: motion.reduced ? 'instant' : 'smooth',
            })
          }
        >
          <span className="eco-mark">
            <Circle size={14} />
          </span>
          <strong>pebble</strong>
          <span>Small tools. Real possibilities.</span>
        </button>
        <div>
          <a
            href="https://github.com/YashAnand69/pebble"
            target="_blank"
            rel="noreferrer"
          >
            Language source
            <ExternalLink size={12} />
          </a>
          <a
            href="https://github.com/YashAnand69/pebble-llm"
            target="_blank"
            rel="noreferrer"
          >
            Model source
            <ExternalLink size={12} />
          </a>
          <a
            href="https://github.com/YashAnand69/pebble-sentinel"
            target="_blank"
            rel="noreferrer"
          >
            Sentinel source
            <ExternalLink size={12} />
          </a>
        </div>
        <span>MIT · Learn, build, contribute.</span>
      </footer>
    </main>
  );
}
