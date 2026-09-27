'use client';
import { useMemo, useRef, useEffect, useState } from 'react';
import { lex } from '@/lib/pebble/engine.js';
import { KEYWORDS } from '@/lib/pebble/syntax.js';
export function CodeEditor({
  source,
  onChange,
  onRun,
  disabled,
  location,
  file,
}: {
  source: string;
  onChange: (s: string) => void;
  onRun: () => void;
  disabled: boolean;
  location: { file: string; line: number; stamp: number } | null;
  file: string;
}) {
  const input = useRef<HTMLTextAreaElement>(null),
    paint = useRef<HTMLPreElement>(null),
    numbers = useRef<HTMLDivElement>(null);
  const highlighted = useMemo(() => {
    let tokens;
    try {
      tokens = lex(source);
    } catch {
      return source;
    }
    {
      let pos = 0;
      const parts = [];
      for (const t of tokens) {
        if (t.start > pos)
          parts.push(
            <span className="syntax-comment" key={'gap' + pos}>
              {source.slice(pos, t.start)}
            </span>,
          );
        parts.push(
          <span
            key={'t' + t.start}
            className={
              'syntax-' +
              (KEYWORDS.has(t.type || '')
                ? 'keyword'
                : t.type === 'STRING'
                  ? 'string'
                  : t.type === 'NUMBER'
                    ? 'number'
                    : t.type === 'IDENT'
                      ? 'identifier'
                      : 'operator')
            }
          >
            {t.text}
          </span>,
        );
        pos = t.end;
      }
      return parts;
    }
  }, [source]);
  function sync() {
    const el = input.current;
    if (el && paint.current) {
      paint.current.scrollTop = el.scrollTop;
      paint.current.scrollLeft = el.scrollLeft;
    }
    if (el && numbers.current) numbers.current.scrollTop = el.scrollTop;
  }
  useEffect(() => {
    if (location?.file !== file || !input.current) return;
    const line = location.line,
      el = input.current;
    const pos = source
      .split('\n')
      .slice(0, line - 1)
      .reduce((n, s) => n + s.length + 1, 0);
    el.setSelectionRange(
      pos,
      pos + (source.split('\n')[line - 1]?.length || 0),
    );
    el.scrollTop = Math.max(0, (line - 5) * 26);
    sync();
  }, [location, file, source]);
  function insert(text: string) {
    const el = input.current!;
    const start = el.selectionStart,
      end = el.selectionEnd;
    onChange(source.slice(0, start) + text + source.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + text.length, start + text.length);
    });
  }
  return (
    <div className="code-area">
      <div ref={numbers} className="line-numbers" aria-hidden="true">
        {source.split('\n').map((_, i) => (
          <div
            className={
              location?.file === file && location.line === i + 1
                ? 'line-active'
                : ''
            }
            key={i}
          >
            {i + 1}
          </div>
        ))}
      </div>
      <div className="code-stack">
        <pre ref={paint} className="highlight" aria-hidden="true">
          {highlighted}
          {'\n'}
        </pre>
        <textarea
          ref={input}
          value={source}
          onChange={(e) => onChange(e.target.value)}
          onScroll={sync}
          aria-label={'Source code: ' + file}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          wrap="off"
          disabled={disabled}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              onRun();
            } else if (e.key === 'Tab' && !e.shiftKey) {
              e.preventDefault();
              insert('  ');
            } else if (e.key === 'Enter') {
              e.preventDefault();
              const before = source.slice(0, e.currentTarget.selectionStart);
              const line = before.slice(before.lastIndexOf('\n') + 1);
              const indent = line.match(/^\s*/)?.[0] || '';
              insert(
                '\n' + indent + (line.trimEnd().endsWith('{') ? '  ' : ''),
              );
            }
          }}
        />
      </div>
    </div>
  );
}
export function Tree({
  node,
  label = 'Program',
  level = 0,
}: {
  node: unknown;
  label?: string;
  level?: number;
}) {
  const [expanded, setExpanded] = useState(level < 2);
  if (node === null || typeof node !== 'object')
    return (
      <div className="tree-value">
        <span>{label}</span> <b>{JSON.stringify(node)}</b>
      </div>
    );
  const record = node as Record<string, unknown>;
  const entries = Object.entries(record).filter(
    ([key]) => !['line', 'col', 'file', 'kind'].includes(key),
  );
  return (
    <details
      className="tree-node"
      open={expanded}
      onToggle={(e) => setExpanded(e.currentTarget.open)}
    >
      <summary>
        <span>{typeof record.kind === 'string' ? record.kind : label}</span>
        {typeof record.line === 'number' && <small>L{record.line}</small>}
        {Array.isArray(node) && <small>{node.length} items</small>}
      </summary>
      <div>
        {expanded &&
          entries.map(([key, value]) => (
            <Tree key={key} node={value} label={key} level={level + 1} />
          ))}
      </div>
    </details>
  );
}
