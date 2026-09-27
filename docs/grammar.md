# Pebble 2 grammar and semantics

The grammar below describes the accepted source forms. `?` means optional, `*` means zero or more, and `|` separates alternatives. Comma-separated lists allow a trailing comma. Braced statement bodies are required for conditionals and loops.

```ebnf
program       = statement* EOF ;
statement     = declaration | import | export | if | while | for
              | return | break | continue | throw | try | block
              | expression ";" | ";" ;
declaration   = binding | function | class ;
binding       = ("let" | "const") IDENT "=" expression ";" ;
function      = "fn" IDENT parameters functionBody ;
functionBody  = block | "=>" expression ";" ;
parameters    = "(" parameterList? ")" ;
parameterList = parameter ("," parameter)* ","? ;
parameter     = IDENT ("=" expression)? | "..." IDENT ;
class         = "class" IDENT "{" function* "}" ;

if            = "if" "(" expression ")" block ("else" (if | block))? ;
while         = "while" "(" expression ")" block ;
for           = "for" forClause block | "for" "(" forClause ")" block ;
forClause     = "let"? IDENT "in" expression ;
return        = "return" expression? ";" ;
break         = "break" ";" ;
continue      = "continue" ";" ;
throw         = "throw" expression ";" ;
try           = "try" block "catch" "(" IDENT ")" block ;
block         = "{" statement* "}" ;

import        = "import" imports "from" STRING ";" ;
imports       = IDENT | "{" importNames? "}" ;
importNames   = importName ("," importName)* ","? ;
importName    = IDENT ("as" IDENT)? ;
export        = "export" declaration ;

expression    = assignment ;
assignment    = conditional (assignOp assignment)? ;
assignOp      = "=" | "+=" | "-=" | "*=" | "/=" | "%=" ;
conditional   = coalesce ("?" assignment ":" conditional)? ;
coalesce      = logicalOr ("??" logicalOr)* ;
logicalOr     = logicalAnd ("||" logicalAnd)* ;
logicalAnd    = equality ("&&" equality)* ;
equality      = comparison (("==" | "!=") comparison)* ;
comparison    = sum (("<" | "<=" | ">" | ">=" | "in") sum)* ;
sum           = product (("+" | "-") product)* ;
product       = unary (("*" | "/" | "%") unary)* ;
unary         = ("!" | "-" | "+") unary | power ;
power         = postfix ("**" unary)? ;
postfix       = primary ("(" arguments? ")" | "[" expression "]"
              | "." IDENT | "++" | "--")* ;
arguments     = argument ("," argument)* ","? ;
argument      = "..."? expression ;
primary       = NUMBER | STRING | IDENT | "this" | "true" | "false" | "nil"
              | "(" expression ")" | "[" arguments? "]"
              | dictionary | lambda ;
dictionary    = "{" entries? "}" ;
entries       = entry ("," entry)* ","? ;
entry         = (IDENT | STRING | NUMBER) ":" expression
              | IDENT | "..." expression ;
lambda        = "fn" parameters (block | "=>" expression) ;
```

## Lexical rules

Identifiers use ASCII letters, digits, and underscores, and cannot begin with a digit. Keywords are reserved. Dictionary keys that are keywords must be quoted; use bracket access to retrieve them.

Numbers include decimal integers and fractions, exponents (`1.2e-3`), decimal separators (`1_000`), hexadecimal (`0xff`), and binary (`0b101`). Separators are accepted between decimal digits before the exponent, not inside hexadecimal/binary literals or exponents. Values must be finite.

Single- and double-quoted strings accept `\n`, `\t`, `\r`, `\\`, `\'`, `\"`, and four-hex-digit Unicode escapes such as `\u0041`. Strings may include newlines. String operations use UTF-16 code units.

`//` comments end at the next newline. `/* … */` block comments may nest. Source positions track file, line, and column. A file may contain up to 100,000 characters; parser nesting is limited to 200 levels.

## Expression rules

Assignment, exponentiation, and ternaries associate right; other binary operators associate left. Exponentiation binds more tightly than unary minus: `-2 ** 2` is `-4`, while `2 ** -2` is `0.25`.

Assignment and update targets must be identifiers, indexed containers, or properties. `++` and `--` are postfix only and return the old value. Compound assignment evaluates the target once. Strings and built-in sequence properties are read-only.

`&&`, `||`, `??`, and ternaries short-circuit. Only `false` and `nil` are falsy. `??` falls back only for `nil`, including when its left operand is `false` or `0`.

`in` checks list values, string substrings, or dictionary keys. Arithmetic requires numbers, except `+` also concatenates two strings or two lists. String ordering uses the host's lexicographic UTF-16 ordering. Container equality compares identity.

A dictionary at the start of a statement must be parenthesized to distinguish it from a block: `({a: 1});`. Dictionary shorthand `{name}` means `{name: name}`. List/call spread requires a list; dictionary spread requires a dictionary. Spreads are shallow copies.

## Bindings and functions

Names cannot be redeclared in the same scope. `const` prevents reassignment but permits mutation of referenced containers. Each loop iteration gets a fresh binding; iteration takes a shallow snapshot of its input. A dictionary loop visits insertion-ordered keys.

Function parameters must be unique. Required parameters precede default parameters; a rest parameter must be last and cannot have a default. Defaults evaluate in the call scope and can read earlier parameters. Explicit `nil` is an argument, not an omitted default. Expression bodies implicitly return their value; braced bodies return `nil` unless a `return` executes.

Closures capture existing binding cells. Later ordinary declarations cannot change an existing closure's lexical lookup. Function names are reserved at the beginning of their block, but the function value is installed only when its declaration executes. Call mutually recursive functions after both declarations.

`return` is valid only in a function. `break` and `continue` are valid only in a loop within the same function; they cannot escape a function boundary. `try`/`catch` does not intercept control flow. A catch binding contains a dictionary with `message`, `phase`, `file`, `line`, and user-thrown `value`. Fatal execution limits bypass handlers.

## Classes

A class body contains named functions. Calling the class creates an instance, invokes `init` when present, and returns the instance; an initializer's return value is ignored. Methods bind `this` to their instance automatically, including when extracted or passed as callbacks. Instance fields are mutable and take precedence over methods. Accessing an unknown instance property is an error. Class methods cannot have duplicate names. Inheritance and static members are not supported.

## Modules

Imports and exports must be top-level statements. `import utility from "./utility.pebble"` imports a namespace dictionary; this is not a default export. Named imports support aliases. Only explicit `export let`, `export const`, `export fn`, and `export class` declarations are exposed.

Each imported module executes in an isolated scope with built-ins, once per runtime session. Paths beginning with a dot resolve from the importing file; other relative paths resolve from the project root. All paths must end in `.pebble` and stay within the project. Cyclic imports and missing exports are errors. Entry files cannot export; run a file importing that module instead.

Import bindings cannot be reassigned. Primitive exports are snapshots taken when their declaration executes; referenced lists, dictionaries, functions, classes, and instances retain shared identity. Namespace dictionaries are shallow copies of a module's export table. New project runs reset the cache; the REPL continues the current session.
