export const examples = [
  {
    id: 'fibonacci',
    title: 'Fibonacci',
    subtitle: 'Recursion, one step at a time',
    tag: 'Recursion',
    description:
      'A function that calls itself. Two base cases turn a recursive idea into the Fibonacci sequence.',
    source: `// Every big idea starts with a small function.

fn fib(n) {
  if (n < 2) { return n; }
  return fib(n - 1) + fib(n - 2);
}

let i = 0;
while (i < 10) {
  print(fib(i));
  i = i + 1;
}`,
  },
  {
    id: 'closures',
    title: 'Closures',
    subtitle: 'Functions that remember',
    tag: 'Lexical scope',
    description:
      'Each counter holds on to its own environment, even after makeCounter has returned.',
    source: `// A function can carry a little memory with it.
fn makeCounter(start) {
  let count = start;
  fn next() {
    count = count + 1;
    return count;
  }
  return next;
}

let counter = makeCounter(0);
let another = makeCounter(100);
print(counter());
print(counter());
print(another());
print(counter());`,
  },
  {
    id: 'fizzbuzz',
    title: 'FizzBuzz',
    subtitle: 'A classic, in your language',
    tag: 'Control flow',
    description:
      'Loops, remainder, and branching work together. Try changing the divisors.',
    source: `// Sometimes the classics are classics for a reason.
let n = 1;
while (n <= 20) {
  if (n % 15 == 0) {
    print("FizzBuzz");
  } else if (n % 3 == 0) {
    print("Fizz");
  } else if (n % 5 == 0) {
    print("Buzz");
  } else {
    print(n);
  }
  n = n + 1;
}`,
  },
  {
    id: 'lists',
    title: 'Lists & strings',
    subtitle: 'A few useful building blocks',
    tag: 'Standard library',
    description:
      'Lists are mutable. Use range, len, push, and indexed access to work with collections.',
    source: `// A tiny standard library, ready to explore.
let squares = [];
let numbers = range(8);
let i = 0;
while (i < len(numbers)) {
  push(squares, numbers[i] * numbers[i]);
  i = i + 1;
}

print(upper("hello, pebble"));
print(squares);
print("Items: " + str(len(squares)));
print("Last square:", squares[7]);`,
  },
  {
    id: 'errors',
    title: 'A helpful error',
    subtitle: 'Find your way back to the code',
    tag: 'Diagnostics',
    description:
      'This program intentionally fails. Change the divisor from 0 to 2, then run it again.',
    source: `// Mistakes are part of making things.
fn divide(a, b) {
  return a / b;
}

print("Let’s try something...");
print(divide(10, 0));`,
  },
];
