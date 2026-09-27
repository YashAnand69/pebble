export const guide = [
  {
    title: 'Values & operators',
    code: 'const name = "Pebble";\nlet score = 2 ** 8;\nscore += 10;\nlet label = score > 100 ? "high" : "low";\nprint(nil ?? "fallback");',
    text: 'Numbers, strings, booleans, nil, lists, dictionaries, functions, classes, and instances. const prevents reassignment; containers can still be mutated. Only false and nil are falsy. ** is right associative. ?? falls back only for nil.',
  },
  {
    title: 'Loops & control flow',
    code: 'for n in range(1, 10) {\n  if (n == 3) { continue; }\n  if (n == 8) { break; }\n  print(n);\n}',
    text: 'for iterates lists, strings, or dictionary keys. Each iteration has its own scope. while, if / else, break, continue, and return are supported. Collections are snapshotted at the start of iteration.',
  },
  {
    title: 'Functions & closures',
    code: 'fn greet(name = "world") => "Hello, " + name;\nfn total(...values) => values.sum();\nlet double = fn(n) => n * 2;\nprint(total(...[1, 2, 3]));',
    text: 'Use a braced body with return, or => for a single expression. Defaults are evaluated at call time and may refer to earlier parameters. The rest parameter must be last. Closures retain lexical bindings. Mutual recursion works after both declarations execute.',
  },
  {
    title: 'Dictionaries & collections',
    code: 'let user = {name: "Ada", level: 1};\nuser.level++;\nlet copy = {...user, level: 3};\nlet list = [1, ...[2, 3]];\nprint(list[-1], user["name"]);',
    text: 'Dictionaries accept string or number keys. Missing keys return nil. Dot access reads string keys. Negative list/string indices count from the end. + combines two strings or two lists. Container equality uses identity.',
  },
  {
    title: 'Classes & bound methods',
    code: 'class Counter {\n  fn init(start = 0) { this.n = start; }\n  fn next() { this.n++; return this.n; }\n}\nlet counter = Counter(10);\nlet next = counter.next;\nprint(next());',
    text: 'Calling a class creates an instance and runs init when present. Methods are automatically bound to this, even when passed as values. Instances have mutable fields. Inheritance and static methods are not part of this release.',
  },
  {
    title: 'Modules & exports',
    code: '// math.pebble\nexport fn twice(n) => n * 2;\n\n// main.pebble\nimport { twice as double } from "./math.pebble";\nprint(double(21));',
    text: 'Use named imports or import math from "./math.pebble" for a namespace. Imports stay inside your project. Modules execute once per run in isolated scopes. Imported bindings cannot be reassigned; exported containers remain shared. Primitive exports are snapshots. Cyclic imports produce a diagnostic.',
  },
  {
    title: 'Recoverable errors',
    code: 'try {\n  throw "Something went wrong";\n} catch (error) {\n  print(error.message, error.file, error.line);\n}',
    text: 'Catch runtime failures or explicit throws. Error records contain message, phase, file, line, and value (the user-thrown value, otherwise nil). Execution and recursion limits cannot be caught. Mutations performed before an error remain in place.',
  },
  {
    title: 'Source & execution',
    code: '/* Block comments can /* nest */ safely. */\nlet size = 1_024;\nprint(0xff, 0b1010, 1.5e3, "\\u0041");',
    text: 'Semicolons end statements. Trailing commas are allowed. The hand-written lexer, Pratt parser, and tree-walking interpreter run in a dedicated worker. Replay shows up to 500 recorded events after execution; it is not a live breakpoint debugger. Limits: 1,000,000 steps, 128 nested calls, 10,000 collection items, 1,000 output lines, and a five-second worker timeout.',
  },
];
export const library = [
  {
    group: 'Core',
    items: [
      ['print(...values)', 'Write values to the console.'],
      ['str(value) · num(value) · type(value)', 'Convert or inspect values.'],
      [
        'len(value) · assert(condition, message?)',
        'Measure strings, lists, or dictionaries; check an invariant.',
      ],
    ],
  },
  {
    group: 'Collections',
    items: [
      [
        'range(end) · range(start, end, step?)',
        'Integer sequence, end excluded; negative steps supported.',
      ],
      [
        'map(list, fn) · filter(list, fn) · each(list, fn)',
        'Callbacks receive value and optional index.',
      ],
      [
        'reduce(list, fn, initial)',
        'Callback receives accumulator, value, and optional index.',
      ],
      [
        'find(list, fn) · some(list, fn) · every(list, fn)',
        'Search and test values; find returns nil if absent.',
      ],
      [
        'sort(list, compare?) · unique(list) · reverse(value)',
        'Return new collections; sort compares numbers or strings.',
      ],
      [
        'push(list, value) · pop(list)',
        'Mutate a list; pop returns nil when empty.',
      ],
      [
        'slice(value, start, end?) · concat(a, b)',
        'Copy portions or combine lists.',
      ],
      [
        'includes(value, item) · indexOf(value, item)',
        'Membership and first position (-1 if absent).',
      ],
      [
        'zip(a, b) · enumerate(value) · sum(list)',
        'Pair, index, or total values.',
      ],
    ],
  },
  {
    group: 'Strings',
    items: [
      [
        'upper(text) · lower(text) · trim(text)',
        'Change case or remove surrounding whitespace.',
      ],
      [
        'split(text, separator) · join(list, separator?)',
        'Move between strings and lists.',
      ],
      [
        'replace(text, from, to) · repeat(text, count)',
        'Replace every match or repeat text.',
      ],
      [
        'startsWith(text, prefix) · endsWith(text, suffix)',
        'Check string boundaries.',
      ],
    ],
  },
  {
    group: 'Dictionaries',
    items: [
      [
        'keys(dict) · values(dict) · entries(dict)',
        'Return lists in insertion order.',
      ],
      [
        'get(dict, key, fallback?) · has(dict, key)',
        'Read or check a key. get uses fallback for nil too.',
      ],
      [
        'set(dict, key, value) · delete(dict, key)',
        'Change a dictionary. delete returns whether the key existed.',
      ],
    ],
  },
  {
    group: 'Math & JSON',
    items: [
      [
        'abs · floor · ceil · round · sqrt · sin · cos · log',
        'One numeric argument; invalid finite results are errors.',
      ],
      [
        'pow(a, b) · min(...values) · max(...values)',
        'Powers, minimum, maximum. PI and E are constants.',
      ],
      ['clamp(value, minimum, maximum)', 'Constrain a number to an interval.'],
      [
        'parseJSON(text) · stringifyJSON(value)',
        'Exchange lists, string-key dictionaries, and primitives with JSON.',
      ],
    ],
  },
];
