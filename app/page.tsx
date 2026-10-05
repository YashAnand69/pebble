'use client';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Play,
  Square,
  Terminal,
  Code2,
  BookOpen,
  Circle,
  Download,
  RotateCcw,
  Check,
  ChevronRight,
  ChevronLeft,
  Braces,
  Trash2,
  Plus,
  Upload,
  FolderOpen,
  Search,
  FileCode2,
  ArrowUpRight,
  StepForward,
  Rewind,
  Layers,
  Box,
  X,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { Slider } from '@/components/ui/slider';
import { lex, parse, resolveModule, VERSION } from '@/lib/pebble/engine.js';
import { projects, validateProject } from '@/lib/pebble/projects.js';
import { guide, library as standardLibrary } from '@/lib/pebble/reference.js';
import { CodeEditor, Tree } from './studio/code-editor';
import { Ecosystem, EcosystemBar } from './studio/ecosystem';
import { useMotionPreference } from './studio/use-motion';
import {
  parseStudioRoute,
  studioLocation,
  parseGuideRoute,
} from './studio/navigation.mjs';
import {
  useRuntime,
  type Project,
  type Result,
  type Variable,
} from './studio/use-runtime';
const STORAGE = 'pebble-studio-v2';
const knownExamples = projects.map((project) => project.id);
const studioVersion = VERSION.split('.').slice(0, 2).join('.');
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
type ModelContext = {
  registerTool(
    tool: {
      name: string;
      title: string;
      description: string;
      inputSchema: Record<string, unknown>;
      annotations: Record<string, boolean>;
      execute: (input: unknown) => Promise<unknown>;
    },
    options: { signal: AbortSignal },
  ): unknown;
};
function Variables({ values }: { values: Variable[] }) {
  return values.length ? (
    <div className="variables">
      {values.map((v) => (
        <div className="variable" key={v.name}>
          <div>
            <b>{v.name}</b>
            <span>
              {v.constant ? 'const · ' : ''}
              {v.type}
            </span>
          </div>
          <code>{v.value}</code>
        </div>
      ))}
    </div>
  ) : (
    <div className="empty-panel">
      <Box size={26} />
      <p>No variables in this scope yet.</p>
    </div>
  );
}
function Guide({
  open,
  onOpenChange,
  tab,
  onTabChange,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  tab: string;
  onTabChange: (value: string) => void;
}) {
  const [query, setQuery] = useState('');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger className="quiet-button">
        <BookOpen size={16} />
        <span>Language guide</span>
      </DialogTrigger>
      <DialogContent className="guide-modal">
        <DialogTitle>Pebble {studioVersion} language guide</DialogTitle>
        <DialogDescription>
          Write and run programs here. Train models with the optional desktop
          runtime.
        </DialogDescription>
        <Tabs value={tab} onValueChange={(value) => onTabChange(String(value))}>
          <TabsList className="h-auto max-w-full flex-wrap">
            <TabsTrigger value="language">Language</TabsTrigger>
            <TabsTrigger value="library">Standard library</TabsTrigger>
            <TabsTrigger value="shortcuts">Studio</TabsTrigger>
            <TabsTrigger value="ml">Machine learning</TabsTrigger>
          </TabsList>
          <TabsContent value="ml">
            <div className="guide-grid">
              <section>
                <h3>Train a model in Pebble</h3>
                <p>
                  Version 2.1 adds tensors, gradients, AdamW and saved weights
                  to the desktop runtime. Model programs run in a terminal on
                  your computer.
                </p>
                <pre>
                  {
                    'node bin/pebble.mjs examples/ml/regression.pebble --ml --compute'
                  }
                </pre>
                <p>
                  <a
                    href="https://github.com/YashAnand69/pebble/blob/main/docs/machine-learning.md"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Read the machine-learning guide ↗
                  </a>
                </p>
              </section>
              <section>
                <h3>PebbleLM · 2M</h3>
                <p>
                  A transformer with exactly two million parameters. Its
                  network, tokenizer, training loop and generation are Pebble
                  programs. An educational model trained on a small programming
                  curriculum.
                </p>
                <p>
                  <a
                    href="https://github.com/YashAnand69/pebble-llm"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Get the open-source model ↗
                  </a>
                </p>
              </section>
            </div>
          </TabsContent>
          <TabsContent value="language">
            <div className="guide-grid">
              {guide.map((g) => (
                <section key={g.title}>
                  <h3>{g.title}</h3>
                  <pre>{g.code}</pre>
                  <p>{g.text}</p>
                </section>
              ))}
            </div>
          </TabsContent>
          <TabsContent value="library">
            <div className="search-field">
              <Search size={16} />
              <input
                aria-label="Search standard library"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a function…"
              />
            </div>
            <p className="help-text">
              Collection and string functions also work as methods:{' '}
              <code>map(items, fn)</code> or <code>items.map(fn)</code>.
              Dictionary keys take priority over method names; use global
              functions if a key shadows a method.
            </p>
            {standardLibrary.map((group) => (
              <section className="reference-group" key={group.group}>
                <h3>{group.group}</h3>
                {group.items
                  .filter((item) =>
                    item.join(' ').toLowerCase().includes(query.toLowerCase()),
                  )
                  .map(([signature, desc]) => (
                    <div key={signature}>
                      <code>{signature}</code>
                      <p>{desc}</p>
                    </div>
                  ))}
              </section>
            ))}
          </TabsContent>
          <TabsContent value="shortcuts">
            <div className="studio-guide">
              <h3>Your workspace</h3>
              <p>
                Choose an example or create a project. Each project remembers
                its edits on this device. Export a project to back up every
                file, or import a .pebble file or a project JSON.
              </p>
              <h3>Run & explore</h3>
              <p>
                Run executes the entry file in a fresh environment. The REPL
                continues the same environment. Changing code marks the last
                result as stale until you run again.
              </p>
              <h3>Execution replay</h3>
              <p>
                Replay moves through recorded events from the completed run.
                Each event shows its local variables and console output at that
                point. Click any event to visit its source file. Up to 500
                events are retained.
              </p>
              <dl>
                <dt>⌘ / Ctrl + Enter</dt>
                <dd>Run the project while editing</dd>
                <dt>Tab</dt>
                <dd>Insert two spaces</dd>
                <dt>Shift + Tab</dt>
                <dd>Move focus out of the editor</dd>
                <dt>Enter</dt>
                <dd>Continue the current indentation</dd>
                <dt>↑ in the REPL</dt>
                <dd>Recall earlier expressions</dd>
              </dl>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
export default function Home() {
  const motion = useMotionPreference();
  const [view, setView] = useState<'ecosystem' | 'studio'>('ecosystem');
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideTab, setGuideTab] = useState('language');
  const [workspace, setWorkspace] = useState<Project[]>(projects),
    [active, setActive] = useState(projects[0].id),
    [file, setFile] = useState(projects[0].entry),
    [loaded, setLoaded] = useState(false),
    [saveState, setSaveState] = useState('Saved on this device');
  const [result, setResult] = useState<Result | null>(null),
    [dirty, setDirty] = useState(false),
    [tab, setTab] = useState('console'),
    [repl, setRepl] = useState(''),
    [history, setHistory] = useState<
      { input: string; output: string[]; error?: string }[]
    >([]),
    [historyIndex, setHistoryIndex] = useState(-1),
    [variables, setVariables] = useState<Variable[]>([]);
  const [search, setSearch] = useState(''),
    [picker, setPicker] = useState(false),
    [newProject, setNewProject] = useState(false),
    [projectName, setProjectName] = useState(''),
    [addingFile, setAddingFile] = useState(false),
    [filename, setFilename] = useState(''),
    [notice, setNotice] = useState(''),
    [confirmation, setConfirmation] = useState<
      'reset' | 'delete' | 'project' | null
    >(null),
    [eventIndex, setEventIndex] = useState(0),
    [location, setLocation] = useState<{
      file: string;
      line: number;
      stamp: number;
    } | null>(null);
  const { execute, busy, stop } = useRuntime(),
    upload = useRef<HTMLInputElement>(null),
    current = useRef<Project>(projects[0]),
    storageBlocked = useRef(false);
  const project = workspace.find((p) => p.id === active) || workspace[0],
    source = project.files[file] ?? project.files[project.entry];
  useEffect(() => {
    current.current = project;
  }, [project]);
  const syntax = useMemo(() => {
    try {
      const tokens = lex(source, file);
      return { tokens, ast: parse(tokens), error: null };
    } catch (error: unknown) {
      return { tokens: [], ast: null, error: errorMessage(error) };
    }
  }, [source, file]);
  const runProject = useCallback(
    async (p: Project) => {
      setHistory([]);
      setHistoryIndex(-1);
      setTab('console');
      setLocation(null);
      setNotice('');
      const r = await execute(p, p.files[p.entry]);
      setResult(r);
      setVariables(r.variables);
      setDirty(false);
      setEventIndex(0);
    },
    [execute],
  );
  useEffect(() => {
    let all: Project[] = projects,
      p = projects[0],
      warning = '';
    try {
      const saved = localStorage.getItem(STORAGE);
      if (saved) {
        const stored = JSON.parse(saved);
        if (
          stored.version !== 2 ||
          !Array.isArray(stored.projects) ||
          stored.projects.length > 100
        )
          throw new Error('Invalid saved workspace');
        const drafts = stored.projects.map(validateProject);
        if (new Set(drafts.map((d: Project) => d.id)).size !== drafts.length)
          throw new Error('Duplicate project identifiers');
        all = [
          ...drafts,
          ...projects.filter(
            (base) => !drafts.some((d: Project) => d.id === base.id),
          ),
        ];
        if (all.length > 100) throw new Error('Too many saved projects');
        p = all.find((x) => x.id === stored.active) || all[0];
      } else {
        const old = localStorage.getItem('pebble-draft-v1');
        if (old) {
          const draft = JSON.parse(old);
          if (
            typeof draft.source === 'string' &&
            draft.source.length <= 100000
          ) {
            const restored: Project = {
              id: 'recovered-v1',
              title: 'Your original draft',
              description: 'Your Pebble 1 draft, preserved in Pebble 2.',
              tag: 'Personal',
              entry: 'main.pebble',
              files: { 'main.pebble': draft.source },
            };
            all = [...projects, restored];
            p = restored;
          }
        }
      }
    } catch {
      storageBlocked.current = true;
      warning =
        'Saved workspace could not be loaded. It has been preserved. Export any new work to keep it; automatic saving is paused.';
    }
    const route = parseStudioRoute(window.location.search, knownExamples);
    if (route.example) p = all.find((item) => item.id === route.example) || p;
    // oxlint-disable-next-line react/react-compiler -- Hydrate the browser URL and restored workspace after mount.
    setView(route.view as 'ecosystem' | 'studio');
    setWorkspace(all);
    setActive(p.id);
    setFile(p.entry);
    setLoaded(true);
    if (route.view === 'studio' && parseGuideRoute(window.location.search)) {
      setGuideOpen(true);
      setGuideTab('ml');
    }
    if (warning) setNotice(warning);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    if (storageBlocked.current) {
      // oxlint-disable-next-line react/react-compiler -- Reflect external storage availability in the UI.
      setSaveState('Autosave paused — export your work');
      return;
    }
    // oxlint-disable-next-line react/react-compiler -- Report the pending debounced storage write.
    setSaveState('Saving…');
    const timeout = setTimeout(() => {
      try {
        localStorage.setItem(
          STORAGE,
          JSON.stringify({ version: 2, active, projects: workspace }),
        );
        setSaveState('Saved on this device');
      } catch {
        setSaveState('Storage full — export a backup');
      }
    }, 400);
    return () => clearTimeout(timeout);
  }, [workspace, active, loaded]);
  useEffect(() => {
    if (view !== 'studio' || !loaded) return;
    const ctx = (document as Document & { modelContext?: ModelContext })
      .modelContext;
    if (!ctx?.registerTool) return;
    const controller = new AbortController();
    try {
      Promise.resolve(
        ctx.registerTool(
          {
            name: 'run_pebble_program',
            title: 'Run a Pebble program',
            description:
              'Replace the current entry file and run the visible Pebble project. Other project files are available for imports.',
            inputSchema: {
              type: 'object',
              properties: { source: { type: 'string', maxLength: 100000 } },
              required: ['source'],
              additionalProperties: false,
            },
            annotations: { readOnlyHint: false, untrustedContentHint: true },
            async execute(input: unknown) {
              if (controller.signal.aborted)
                throw new Error('Open the studio before changing a project.');
              if (
                !input ||
                typeof input !== 'object' ||
                !('source' in input) ||
                typeof input.source !== 'string' ||
                input.source.length > 100000
              )
                throw new Error(
                  'Provide source text of at most 100,000 characters.',
                );
              if (busy) throw new Error('Wait for the current run to finish.');
              const p = {
                ...current.current,
                files: {
                  ...current.current.files,
                  [current.current.entry]: input.source,
                },
              };
              setWorkspace((all) => all.map((x) => (x.id === p.id ? p : x)));
              setFile(p.entry);
              const r = await execute(p, input.source);
              setResult(r);
              setVariables(r.variables);
              setHistory([]);
              setDirty(false);
              setTab('console');
              return { ok: r.ok, output: r.output, error: r.error };
            },
          },
          { signal: controller.signal },
        ),
      ).catch(() => {});
    } catch {}
    return () => controller.abort();
  }, [execute, busy, view, loaded]);
  function edit(code: string) {
    if (
      code.length > 100000 ||
      Object.entries(project.files).reduce(
        (sum, [name, text]) =>
          sum + (name === file ? code.length : text.length),
        0,
      ) > 500000
    ) {
      setNotice(
        'Keep each file under 100,000 characters and the project under 500,000.',
      );
      return;
    }
    setWorkspace((all) =>
      all.map((p) =>
        p.id === active ? { ...p, files: { ...p.files, [file]: code } } : p,
      ),
    );
    setDirty(true);
    setLocation(null);
  }
  function selectProject(p: Project) {
    if (busy) return;
    setActive(p.id);
    setFile(p.entry);
    setPicker(false);
    setSearch('');
    setResult(null);
    setVariables([]);
    setHistory([]);
    setDirty(false);
  }
  function openStudio(example?: string) {
    setGuideOpen(false);
    const known = example && knownExamples.includes(example) ? example : null;
    setView('studio');
    window.history.pushState(
      {},
      '',
      studioLocation('studio', known, knownExamples),
    );
    window.scrollTo({ top: 0 });
    if (known) {
      const target = workspace.find((item) => item.id === known);
      if (target) selectProject(target);
    }
  }
  function showEcosystem() {
    setGuideOpen(false);
    setView('ecosystem');
    window.history.pushState(
      {},
      '',
      studioLocation('ecosystem', null, knownExamples),
    );
    window.scrollTo({ top: 0 });
  }
  function goTo(targetFile: string, line: number) {
    if (!Object.hasOwn(project.files, targetFile)) return;
    setFile(targetFile);
    setLocation({ file: targetFile, line, stamp: Date.now() });
  }
  function replay(index: number) {
    setEventIndex(index);
    const event = result?.trace[index];
    if (event) goTo(event.file, event.line);
  }
  function download(text: string, name: string, type = 'text/plain') {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function addFile(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      if (Object.keys(project.files).length >= 30)
        throw new Error('A project supports up to 30 files.');
      const name = filename.trim();
      if (resolveModule(name) !== name)
        throw new Error(
          'Use a relative filename such as helpers.pebble or lib/math.pebble.',
        );
      if (Object.hasOwn(project.files, name))
        throw new Error('That file already exists.');
      setWorkspace((all) =>
        all.map((p) =>
          p.id === active
            ? {
                ...p,
                files: { ...p.files, [name]: '// Your module starts here.\n' },
              }
            : p,
        ),
      );
      setFile(name);
      setAddingFile(false);
      setFilename('');
      setDirty(true);
      setNotice('');
    } catch (e: unknown) {
      setNotice(errorMessage(e));
    }
  }
  function createProject(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = projectName.trim();
    if (!name) return;
    if (workspace.length >= 100) {
      setNotice(
        'This workspace supports 100 projects. Export and delete an existing personal project before adding more.',
      );
      setNewProject(false);
      return;
    }
    const p: Project = {
      id: 'custom-' + crypto.randomUUID(),
      title: name,
      description: 'Make something of your own.',
      tag: 'Personal',
      entry: 'main.pebble',
      files: {
        'main.pebble':
          '// Welcome to your next idea.\nprint("Hello, Pebble 2!");\n',
      },
    };
    setWorkspace((all) => [...all, p]);
    setProjectName('');
    setNewProject(false);
    selectProject(p);
  }
  async function importFile(f: File) {
    try {
      if (workspace.length >= 100)
        throw new Error('This workspace supports 100 projects.');
      if (f.size > 1000000) throw new Error('Choose a file smaller than 1 MB.');
      const text = await f.text();
      const p = f.name.endsWith('.pebble')
        ? validateProject({
            title: f.name,
            entry: 'main.pebble',
            files: { 'main.pebble': text },
          })
        : validateProject(JSON.parse(text));
      const imported = {
        ...p,
        id: 'import-' + crypto.randomUUID(),
        tag: 'Personal',
      };
      setWorkspace((all) => [...all, imported]);
      selectProject(imported);
      setNotice('Project imported and saved on this device.');
    } catch (e: unknown) {
      setNotice('Import failed: ' + errorMessage(e));
    }
    if (upload.current) upload.current.value = '';
  }
  function confirm() {
    if (confirmation === 'project') {
      const remaining = workspace.filter((p) => p.id !== active);
      setWorkspace(remaining);
      selectProject(remaining[0]);
    } else if (confirmation === 'delete') {
      const files = { ...project.files };
      delete files[file];
      setWorkspace((all) =>
        all.map((p) => (p.id === active ? { ...p, files } : p)),
      );
      setFile(project.entry);
      setDirty(true);
    } else {
      const original = projects.find((p) => p.id === active);
      if (original) {
        setWorkspace((all) => all.map((p) => (p.id === active ? original : p)));
        setFile(original.entry);
        void runProject(original);
      }
    }
    setConfirmation(null);
  }
  useEffect(() => {
    const navigate = () => {
      const route = parseStudioRoute(window.location.search, knownExamples);
      setView(route.view as 'ecosystem' | 'studio');
      if (route.view === 'studio' && parseGuideRoute(window.location.search)) {
        setGuideOpen(true);
        setGuideTab('ml');
      }
      if (route.example) {
        const target = workspace.find((item) => item.id === route.example);
        if (target) {
          setActive(target.id);
          setFile(target.entry);
          setResult(null);
          setVariables([]);
          setHistory([]);
          setDirty(false);
        }
      }
    };
    window.addEventListener('popstate', navigate);
    return () => window.removeEventListener('popstate', navigate);
  }, [workspace]);
  const event = result?.trace[eventIndex],
    filtered = workspace.filter((p) =>
      (p.title + ' ' + p.tag).toLowerCase().includes(search.toLowerCase()),
    );
  if (view === 'ecosystem') return <Ecosystem onOpenStudio={openStudio} />;
  return (
    <main className={'studio' + (motion.reduced ? '' : ' studio-enter')}>
      <EcosystemBar
        studio
        onHome={showEcosystem}
        onStudio={() => openStudio()}
      />
      <header className="app-header">
        <button
          className="brand"
          aria-label="Pebble Language Studio"
          onClick={() =>
            selectProject(
              workspace.find((p) => p.id === projects[0].id) || projects[0],
            )
          }
        >
          <Circle size={25} />
          <b>pebble</b>
          <span>{studioVersion}</span>
        </button>
        <div className="header-caption">LANGUAGE STUDIO · BUILD & EXPLORE</div>
        <div className="header-actions">
          <Guide
            open={guideOpen}
            onOpenChange={setGuideOpen}
            tab={guideTab}
            onTabChange={(value) => {
              if (['language', 'library', 'shortcuts', 'ml'].includes(value))
                setGuideTab(value);
            }}
          />
          <a
            className="quiet-button repo-link"
            href="https://github.com/YashAnand69/pebble"
            target="_blank"
            rel="noreferrer"
          >
            <Code2 size={16} />
            Source
            <ArrowUpRight size={13} />
          </a>
        </div>
      </header>
      <div className="project-bar">
        <div>
          <div className="eyebrow">
            YOUR WORKSPACE <span>/</span> {project.tag}
          </div>
          <h1>{project.title}</h1>
        </div>
        <div className="project-actions">
          <button
            className="quiet-button"
            onClick={() => setPicker(true)}
            disabled={busy}
          >
            <FolderOpen size={16} />
            Projects
          </button>
          <button
            className="quiet-button"
            onClick={() => upload.current?.click()}
            disabled={busy}
          >
            <Upload size={16} />
            <span>Import</span>
          </button>
          <button
            className="quiet-button"
            onClick={() =>
              download(
                JSON.stringify({ ...project, version: 2 }, null, 2),
                project.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') +
                  '.pebble-project.json',
                'application/json',
              )
            }
          >
            <Download size={16} />
            <span>Export project</span>
          </button>
          <button
            className="run-button"
            onClick={() => (busy ? stop() : runProject(project))}
          >
            {busy ? <Square size={15} /> : <Play size={15} />}{' '}
            {busy ? 'Stop' : 'Run project'}
            <kbd>⌘ ↵</kbd>
          </button>
        </div>
      </div>
      {notice && (
        <output className="notice">
          <span>{notice}</span>
          <button aria-label="Dismiss notice" onClick={() => setNotice('')}>
            <X size={14} />
          </button>
        </output>
      )}
      <div className="workspace-v2">
        <aside className="project-sidebar">
          <div className="sidebar-heading">
            <span>EXAMPLES & PROJECTS</span>
            <button
              aria-label="New project"
              title="New project"
              onClick={() => setNewProject(true)}
              disabled={busy}
            >
              <Plus size={17} />
            </button>
          </div>
          <div className="sidebar-projects">
            {workspace.map((p) => (
              <button
                key={p.id}
                className={'project-link ' + (p.id === active ? 'active' : '')}
                disabled={busy}
                onClick={() => selectProject(p)}
              >
                <span className="project-icon">
                  {p.tag === 'Personal' ? (
                    <FolderOpen size={16} />
                  ) : (
                    <Braces size={16} />
                  )}
                </span>
                <span>
                  {p.title}
                  <small>{p.tag}</small>
                </span>
                {p.id === active && <ChevronRight size={14} />}
              </button>
            ))}
          </div>
          <div className="sidebar-bottom">
            <span className="version-label">PEBBLE 2</span>
            <p>
              Build with modules.
              <br />
              Think in objects.
              <br />
              Explore every step.
            </p>
            <span className="local-label">
              <Check size={12} />
              Runs on your device
            </span>
          </div>
        </aside>
        <section className="editor-panel">
          <div className="files-bar">
            <nav className="file-tabs" aria-label="Project files">
              {Object.keys(project.files).map((name) => (
                <button
                  aria-pressed={file === name}
                  key={name}
                  className={file === name ? 'active' : ''}
                  onClick={() => {
                    setFile(name);
                    setLocation(null);
                  }}
                >
                  <FileCode2 size={14} />
                  {name}
                  {name === project.entry && (
                    <span className="entry-dot" title="Entry file" />
                  )}
                </button>
              ))}
            </nav>
            <button
              className="icon-button"
              aria-label="Add file"
              title="Add file"
              onClick={() => setAddingFile((v) => !v)}
              disabled={busy}
            >
              <Plus size={17} />
            </button>
          </div>
          {addingFile && (
            <form className="new-file-form" onSubmit={addFile}>
              <input
                aria-label="New file name"
                placeholder="helpers.pebble"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
              />
              <button type="submit">Add file</button>
              <button type="button" onClick={() => setAddingFile(false)}>
                Cancel
              </button>
            </form>
          )}
          <div className="editor-toolbar">
            <span>
              <Code2 size={14} />
              {file === project.entry ? 'Entry point' : 'Module'}
              <span className="source-size">
                {source.split('\n').length} lines
              </span>
            </span>
            <div>
              {file !== project.entry && (
                <button
                  title="Use this file as the entry point"
                  onClick={() => {
                    setWorkspace((all) =>
                      all.map((p) =>
                        p.id === active ? { ...p, entry: file } : p,
                      ),
                    );
                    setDirty(true);
                  }}
                  disabled={busy}
                >
                  Set entry
                </button>
              )}
              <button
                className="icon-button"
                title="Download current file"
                aria-label="Download current file"
                onClick={() => download(source, file.split('/').at(-1)!)}
              >
                <Download size={14} />
              </button>
              {file !== project.entry && (
                <button
                  className="icon-button"
                  title="Delete current file"
                  aria-label="Delete current file"
                  disabled={busy}
                  onClick={() => setConfirmation('delete')}
                >
                  <Trash2 size={14} />
                </button>
              )}
              {projects.some((p) => p.id === active) && (
                <button
                  className="icon-button"
                  title="Restore original example"
                  aria-label="Restore original example"
                  disabled={busy}
                  onClick={() => setConfirmation('reset')}
                >
                  <RotateCcw size={14} />
                </button>
              )}
            </div>
          </div>
          <CodeEditor
            source={source}
            file={file}
            onChange={edit}
            onRun={() => void runProject(project)}
            disabled={busy}
            location={location}
          />
          <div className="example-context">
            <span>
              <BookOpen size={14} /> THE IDEA
            </span>
            <p>{project.description}</p>
          </div>
          <div className="editor-footer">
            <span>
              <Check size={12} />
              {saveState}
            </span>
            <span>Pebble {studioVersion} · UTF-8</span>
          </div>
        </section>
        <section className="output-panel">
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
                <TabsTrigger value="variables">Variables</TabsTrigger>
                <TabsTrigger value="replay">Replay</TabsTrigger>
                <TabsTrigger value="syntax">Syntax</TabsTrigger>
              </TabsList>
            </div>
            <output
              className={
                'run-status ' +
                (dirty ? 'stale' : result?.ok ? 'success' : 'failure')
              }
            >
              <span>
                {busy
                  ? 'Running…'
                  : dirty
                    ? 'Source changed · run to update'
                    : result?.ok
                      ? 'Executed successfully'
                      : result?.error
                        ? result.error.phase + ' error'
                        : 'Ready to run'}
              </span>
              <span>
                {result && !busy ? result.duration.toFixed(2) + ' ms' : ''}
              </span>
            </output>
            <TabsContent value="console" className="console-content">
              <div className="console" aria-live="polite">
                <p className="console-caption">
                  {project.entry} <span>/ stdout</span>
                </p>
                {result?.output.map((line, i) => (
                  <div className="output-line" key={i}>
                    <span>{String(i + 1).padStart(2, '0')}</span>
                    <pre>{line}</pre>
                  </div>
                ))}
                {result?.ok && !result.output.length && (
                  <p className="help-text">
                    Finished without printing output. Inspect Variables or try
                    an expression below.
                  </p>
                )}
                {result?.error && (
                  <div className="diagnostic">
                    <b>{result.error.phase} error</b>
                    <p>{result.error.message}</p>
                    <button
                      onClick={() =>
                        goTo(result.error!.file, result.error!.line)
                      }
                    >
                      {result.error.file}:{result.error.line}:{result.error.col}
                      <ArrowUpRight size={13} />
                    </button>
                    <pre>
                      {project.files[result.error.file]?.split('\n')[
                        result.error.line - 1
                      ] || ''}
                      {'\n'}
                      {' '.repeat(Math.min(150, result.error.col - 1))}^
                    </pre>
                    {result.error.frames.map((f, i) => (
                      <small key={i}>
                        at {f.name} · {f.file}:{f.line}
                      </small>
                    ))}
                  </div>
                )}
                {result?.ok && (
                  <p className="console-finished">
                    <Check size={12} />
                    Finished · {result.steps.toLocaleString()} steps
                  </p>
                )}
                {history.map((h, i) => (
                  <div className="repl-entry" key={i}>
                    <div>
                      <span>› </span>
                      {h.input}
                    </div>
                    {h.output.map((o, j) => (
                      <pre key={j}>{o}</pre>
                    ))}
                    {h.error && <p className="error-text">{h.error}</p>}
                  </div>
                ))}
              </div>
              <form
                className="repl"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!repl.trim() || busy) return;
                  let code = repl.trim();
                  if (!code.endsWith(';')) code += ';';
                  setRepl('');
                  setHistoryIndex(-1);
                  const r = await execute(project, code, 'repl');
                  setHistory((h) => [
                    ...h,
                    {
                      input: code,
                      output: [
                        ...r.output,
                        ...(r.ok && r.value && r.value !== 'nil'
                          ? [r.value]
                          : []),
                      ],
                      error: r.error?.message,
                    },
                  ]);
                  setVariables(r.variables);
                }}
              >
                <div className="repl-label">
                  <span>
                    REPL <small>Keep exploring this environment.</small>
                  </span>
                  <button
                    type="button"
                    aria-label="Clear REPL history"
                    onClick={() => setHistory([])}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <div className="repl-input">
                  <span>›</span>
                  <input
                    aria-label="REPL expression"
                    placeholder="Try 2 ** 8 or type(missions)"
                    disabled={busy}
                    value={repl}
                    onChange={(e) => setRepl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowUp' && history.length) {
                        e.preventDefault();
                        const index =
                          historyIndex < 0
                            ? history.length - 1
                            : Math.max(0, historyIndex - 1);
                        setHistoryIndex(index);
                        setRepl(history[index].input);
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
            <TabsContent value="variables" className="inspector">
              <p className="help-text">
                Current top-level bindings, including changes made in the REPL.
                Values are abbreviated for display.
              </p>
              <Variables values={variables} />
              {!!result?.modules.length && (
                <div className="module-summary">
                  <h3>Loaded modules</h3>
                  {result.modules.map((m) => (
                    <div key={m.file}>
                      <FileCode2 size={14} />
                      <span>
                        {m.file}
                        <small>{m.exports.join(', ')}</small>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
            <TabsContent value="replay" className="inspector replay-panel">
              <div className="replay-intro">
                <Rewind size={18} />
                <div>
                  <h3>See how your program ran</h3>
                  <p>Move through recorded events and inspect their scope.</p>
                </div>
              </div>
              {event ? (
                <>
                  <div className="replay-controls">
                    <button
                      aria-label="Previous event"
                      disabled={eventIndex === 0}
                      onClick={() => replay(eventIndex - 1)}
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <span>
                      Event {eventIndex + 1} / {result!.trace.length}
                    </span>
                    <button
                      aria-label="Next event"
                      disabled={eventIndex === result!.trace.length - 1}
                      onClick={() => replay(eventIndex + 1)}
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                  <Slider
                    aria-label="Execution event"
                    value={[eventIndex]}
                    min={0}
                    max={Math.max(1, result!.trace.length - 1)}
                    step={1}
                    onValueChange={(v) =>
                      replay(
                        Math.min(
                          Array.isArray(v) ? v[0] : v,
                          result!.trace.length - 1,
                        ),
                      )
                    }
                  />
                  <div className="event-detail">
                    <span>
                      {event.kind}{' '}
                      <small>
                        step {event.step} · depth {event.depth}
                      </small>
                    </span>
                    <button onClick={() => goTo(event.file, event.line)}>
                      {event.file}:{event.line}
                      <ArrowUpRight size={12} />
                    </button>
                    <p>{event.detail || 'Statement executed'}</p>
                  </div>
                  <h4>Scope at this event</h4>
                  <Variables values={event.variables} />
                  <h4>Output so far</h4>
                  <pre className="replay-output">
                    {result!.output.slice(0, event.outputCount).join('\n') ||
                      'No output yet.'}
                  </pre>
                  <details className="event-list">
                    <summary>Browse recorded events</summary>
                    {result!.trace.map((e, i) => (
                      <button
                        key={i}
                        className={i === eventIndex ? 'active' : ''}
                        onClick={() => replay(i)}
                      >
                        <span>{i + 1}</span>
                        <b>{e.kind}</b>
                        <code>
                          {e.file}:{e.line}
                        </code>
                      </button>
                    ))}
                  </details>
                  {result?.traceTruncated && (
                    <p className="help-text">
                      The first 500 events were recorded. The entire program
                      still ran.
                    </p>
                  )}
                </>
              ) : (
                <div className="empty-panel">
                  <StepForward size={28} />
                  <p>Run a program to record its execution.</p>
                </div>
              )}
            </TabsContent>
            <TabsContent value="syntax" className="inspector">
              <p className="help-text">
                Live syntax for <b>{file}</b>. The parser reads the editor
                directly.
              </p>
              {syntax.error ? (
                <div className="diagnostic">{syntax.error}</div>
              ) : (
                <Tabs defaultValue="tree">
                  <TabsList>
                    <TabsTrigger value="tree">Syntax tree</TabsTrigger>
                    <TabsTrigger value="tokens">
                      Tokens ({Math.max(0, syntax.tokens.length - 1)})
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="tree">
                    <Tree node={syntax.ast} />
                  </TabsContent>
                  <TabsContent value="tokens">
                    <div className="token-list">
                      {syntax.tokens
                        .filter((t) => t.type !== 'EOF')
                        .map((t, i) => (
                          <button
                            className="token"
                            key={i}
                            onClick={() => goTo(file, t.line)}
                          >
                            <code>{t.text}</code>
                            <small>
                              {t.type} · {t.line}:{t.col}
                            </small>
                          </button>
                        ))}
                    </div>
                  </TabsContent>
                </Tabs>
              )}
            </TabsContent>
          </Tabs>
          <div className="runtime-footer">
            <span>Tree-walk interpreter</span>
            <span>
              {result?.calls || 0} calls · {Object.keys(project.files).length}{' '}
              files
            </span>
          </div>
        </section>
      </div>
      <footer className="app-footer">
        <span>
          <Layers size={13} />
          Source → Tokens → Syntax tree → Execution
        </span>
        <span>No server execution. Your projects stay on this device.</span>
      </footer>
      <input
        ref={upload}
        className="hidden"
        type="file"
        accept=".pebble,.json"
        aria-label="Import project file"
        onChange={(e) => {
          if (e.target.files?.[0]) void importFile(e.target.files[0]);
        }}
      />
      <Dialog open={picker} onOpenChange={setPicker}>
        <DialogContent className="projects-modal">
          <DialogTitle>Your projects & examples</DialogTitle>
          <DialogDescription>
            Each workspace remembers your edits on this device.
          </DialogDescription>
          <div className="search-field">
            <Search size={16} />
            <input
              aria-label="Search projects"
              placeholder="Search projects or topics…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="project-grid">
            {filtered.map((p) => (
              <button
                key={p.id}
                disabled={busy}
                className={active === p.id ? 'active' : ''}
                onClick={() => selectProject(p)}
              >
                <span>{p.tag}</span>
                <b>{p.title}</b>
                <p>{p.description}</p>
                <small>
                  {Object.keys(p.files).length} file
                  {Object.keys(p.files).length === 1 ? '' : 's'}
                </small>
              </button>
            ))}
          </div>
          {!filtered.length && <p>No matching projects.</p>}
          <button
            className="primary-button"
            onClick={() => {
              setPicker(false);
              setNewProject(true);
            }}
          >
            <Plus size={16} />
            New project
          </button>
          {!projects.some((p) => p.id === active) && (
            <button
              className="quiet-button"
              onClick={() => {
                setPicker(false);
                setConfirmation('project');
              }}
            >
              <Trash2 size={15} />
              Delete current project
            </button>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={newProject} onOpenChange={setNewProject}>
        <DialogContent className="small-modal">
          <DialogTitle>Start a new project</DialogTitle>
          <DialogDescription>
            A fresh workspace, saved on this device.
          </DialogDescription>
          <form onSubmit={createProject}>
            <label htmlFor="project-name">Project name</label>
            <input
              id="project-name"
              value={projectName}
              maxLength={100}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="My next idea"
              required
            />
            <button className="primary-button" type="submit">
              Create project
              <ArrowUpRight size={15} />
            </button>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>
            {confirmation === 'project'
              ? 'Delete ' + project.title + '?'
              : confirmation === 'delete'
                ? 'Delete ' + file + '?'
                : 'Restore the original example?'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {confirmation === 'project'
              ? 'This removes all files in this personal project from this device. Export a backup first if you need to keep it.'
              : confirmation === 'delete'
                ? 'This removes the file from this project. Export a backup first if you need to keep it.'
                : 'This replaces your edits to this example, including added files. Export a backup first if needed.'}
          </AlertDialogDescription>
          <div className="confirm-actions">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <button className="primary-button" onClick={confirm}>
              {confirmation === 'project'
                ? 'Delete project'
                : confirmation === 'delete'
                  ? 'Delete file'
                  : 'Restore example'}
            </button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
