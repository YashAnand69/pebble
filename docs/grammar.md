# Pebble grammar

```
program     → statement* EOF
statement   → let | function | if | while | return | block | expression ';'
let         → 'let' IDENT '=' expression ';'
function    → 'fn' IDENT '(' parameters? ')' block
if          → 'if' '(' expression ')' block ('else' (if | block))?
while       → 'while' '(' expression ')' block
return      → 'return' expression? ';'
block       → '{' statement* '}'
expression  → assignment
assignment  → logicalOr ('=' assignment)?
logicalOr   → logicalAnd ('||' logicalAnd)*
logicalAnd  → equality ('&&' equality)*
equality    → comparison (('==' | '!=') comparison)*
comparison  → sum (('<' | '<=' | '>' | '>=') sum)*
sum         → product (('+' | '-') product)*
product     → unary (('*' | '/' | '%') unary)*
unary       → ('!' | '-') unary | postfix
postfix     → primary ( '(' arguments? ')' | '[' expression ']' )*
primary     → NUMBER | STRING | IDENT | 'true' | 'false' | 'nil'
            | '(' expression ')' | '[' arguments? ']'
```

Assignment targets must be an identifier or indexed list. Declarations cannot repeat names in one scope. Parameters must be unique. Strings are immutable. Lists compare by identity. Function declarations capture only bindings visible at their declaration, including themselves for recursion. Comments begin with `//` and end at the next newline. Single and double quoted strings accept `\n`, `\t`, `\r`, `\\`, `\'`, and `\"`.
