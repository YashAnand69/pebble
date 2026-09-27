import { examples } from './examples.js';
import { resolveModule } from './engine.js';
/** @type {Array<{id:string,title:string,tag:string,description:string,entry:string,files:Record<string,string>}>} */
export const projects = [
  {
    id: 'launch',
    title: 'Mission control',
    tag: 'Start here',
    description:
      'Turn a list of mission records into a report. Two files, a data pipeline, and a reusable module.',
    entry: 'main.pebble',
    files: {
      'main.pebble': `// Welcome to Pebble 2. Small language. Bigger ideas.
import { summarize } from "./analytics.pebble";

const missions = [
  { name: "Voyager", distance: 24.5, active: true },
  { name: "Pioneer", distance: 20.1, active: false },
  { name: "New Horizons", distance: 8.7, active: true },
];

const active = missions.filter(fn(m) => m.active);
const names = active.map(fn(m) => m.name.upper());

print("✦  MISSION CONTROL");
print(names.join("  /  "));
print(summarize(active));

for mission in active {
  print(mission.name + ": " + str(mission.distance) + " billion km");
}

assert(active.length == 2, "Expected two active missions");`,
      'analytics.pebble': `// Export just what another file needs.
export fn summarize(missions) {
  const distance = missions
    .map(fn(m) => m.distance)
    .reduce(fn(total, km) => total + km, 0);

  return str(missions.length) + " active missions · "
    + str(round(distance)) + " billion km combined";
}
`,
    },
  },
  {
    id: 'objects',
    title: 'Classes & objects',
    tag: 'Object oriented',
    description:
      'Construct independent objects, call methods, and pass a bound method as a function.',
    entry: 'main.pebble',
    files: {
      'main.pebble': `class Account {
  fn init(owner, balance = 0) {
    this.owner = owner;
    this.balance = balance;
  }

  fn deposit(amount) {
    assert(amount > 0, "Deposit must be positive");
    this.balance += amount;
    return this;
  }

  fn describe() {
    return this.owner + " has " + str(this.balance) + " credits";
  }
}

let account = Account("Ada", 100);
account.deposit(50).deposit(25);
let describe = account.describe;
print(describe());
print(Account("Grace").describe());`,
    },
  },
  {
    id: 'functional',
    title: 'Data pipelines',
    tag: 'Functional',
    description:
      'Compose map, filter, reduce, and a custom sort. Collection methods return new lists.',
    entry: 'main.pebble',
    files: {
      'main.pebble': `const scores = [72, 95, 61, 88, 95, 43, 100];
const passing = scores.filter(fn(score) => score >= 70);
const ranked = passing.unique().sort(fn(a, b) => b - a);
const average = passing.sum() / passing.length;

print("Leaderboard:", ranked);
print("Average:", round(average));
print("Everyone passed?", scores.every(fn(s) => s >= 70));

for pair in ranked.enumerate() {
  print("#" + str(pair[0] + 1) + " — " + str(pair[1]));
}

fn multiplyBy(factor) => fn(n) => n * factor;
print("Double:", [1, 2, 3].map(multiplyBy(2)));`,
    },
  },
  {
    id: 'dictionary',
    title: 'Word frequencies',
    tag: 'Dictionaries',
    description:
      'Count words with dictionary lookup, nil coalescing, and string methods.',
    entry: 'main.pebble',
    files: {
      'main.pebble': `const text = "small language big ideas small steps big possibilities";
const words = text.lower().split(" ");
let counts = {};

for word in words {
  counts[word] = (counts[word] ?? 0) + 1;
}

for word in counts.keys().sort() {
  print(word + ": " + repeat("▰", counts[word]));
}
print("Unique words:", len(counts));
print("As JSON:", stringifyJSON(counts));`,
    },
  },
  {
    id: 'errors-v2',
    title: 'Errors you can handle',
    tag: 'Reliability',
    description:
      'Catch a thrown error, inspect its details, and continue running the program.',
    entry: 'main.pebble',
    files: {
      'main.pebble': `fn withdraw(balance, amount) {
  if (amount > balance) {
    throw "Insufficient credits";
  }
  return balance - amount;
}

try {
  print(withdraw(50, 80));
} catch (error) {
  print("Recovered:", error.message);
  print("At line:", error.line);
}

try {
  print(10 / 0);
} catch (error) {
  print("Arithmetic:", error.message);
}

print("The program is still running.");`,
    },
  },
  {
    id: 'functions-v2',
    title: 'Flexible functions',
    tag: 'Functions',
    description:
      'Default arguments, rest parameters, spread calls, and expression bodies make functions more useful.',
    entry: 'main.pebble',
    files: {
      'main.pebble': `fn greet(name = "traveler", punctuation = "!") {
  return "Hello, " + name + punctuation;
}

fn total(label, ...numbers) {
  print(label + ": " + str(numbers.sum()));
}

const double = fn(n) => n * 2;
const values = range(1, 6).map(double);

print(greet());
print(greet("Pebble", " ✦"));
total("Score", ...values);
print("Powers:", range(5).map(fn(n) => 2 ** n));`,
    },
  },
  {
    id: 'json',
    title: 'JSON & records',
    tag: 'Data exchange',
    description:
      'Parse JSON into native dictionaries and lists, transform the data, and serialize the result.',
    entry: 'main.pebble',
    files: {
      'main.pebble': `const raw = '{"name":"Pebble","version":2,"features":["modules","classes","closures"]}';
let config = parseJSON(raw);
config.features.push("dictionaries");
config.ready = true;

print(config.name + " " + str(config.version));
for feature in config.features {
  print("  ✓ " + feature);
}
print(stringifyJSON(config));`,
    },
  },
  {
    id: 'loops',
    title: 'Primes & loop control',
    tag: 'Algorithms',
    description:
      'Use nested iteration, break, and continue to find prime numbers.',
    entry: 'main.pebble',
    files: {
      'main.pebble': `fn isPrime(n) {
  if (n < 2) { return false; }
  for divisor in range(2, floor(sqrt(n)) + 1) {
    if (n % divisor == 0) { return false; }
  }
  return true;
}

let primes = [];
for n in range(2, 100) {
  if (!isPrime(n)) { continue; }
  primes.push(n);
  if (primes.length == 15) { break; }
}
print("First 15 primes:");
print(primes);
print("In reverse:", primes.reverse());`,
    },
  },
  ...examples.map((e) => ({
    id: e.id,
    title: e.title,
    tag: e.tag,
    description: e.description,
    entry: 'main.pebble',
    files: { 'main.pebble': e.source },
  })),
];
export function validateProject(input) {
  if (
    !input ||
    typeof input !== 'object' ||
    typeof input.title !== 'string' ||
    !input.title.trim() ||
    input.title.length > 100 ||
    !input.files ||
    typeof input.files !== 'object' ||
    Array.isArray(input.files)
  )
    throw new Error('Choose a valid Pebble project JSON file.');
  const entries = Object.entries(input.files);
  if (!entries.length || entries.length > 30)
    throw new Error('A project needs between 1 and 30 files.');
  const files = Object.create(null);
  let size = 0;
  for (const [name, source] of entries) {
    if (
      typeof source !== 'string' ||
      source.length > 100000 ||
      resolveModule(name) !== name
    )
      throw new Error(
        'Use canonical relative .pebble filenames and at most 100,000 characters per file.',
      );
    size += source.length;
    files[name] = source;
  }
  if (size > 500000)
    throw new Error('A project is limited to 500,000 characters.');
  if (typeof input.entry !== 'string' || !Object.hasOwn(files, input.entry))
    throw new Error('The entry file is missing.');
  return {
    id: typeof input.id === 'string' ? input.id : 'custom-' + Date.now(),
    title: input.title,
    description:
      typeof input.description === 'string'
        ? input.description
        : 'Your own Pebble project.',
    tag: typeof input.tag === 'string' ? input.tag : 'Personal',
    entry: input.entry,
    files,
  };
}
