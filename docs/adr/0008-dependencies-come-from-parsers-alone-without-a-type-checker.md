---
status: proposed
created: 2026-11-02
decision-makers: [Philipp Saal]
tags: [structure, analysis]
depends-on: [0007-the-analysis-never-executes-anything-from-the-analysed]
---

# Dependencies come from parsers alone, without a type checker or a JVM

Structure needs the Dependencies between the Source Files of a repository it has never seen: fast on the first opening, again within a moment when one file changes, and in a desktop app and a command line alike, neither of which may assume a toolchain on the machine. So Dependencies are found by parsing each file on its own, and nothing builds a program. TypeScript, JavaScript and the script blocks of Svelte are read with the `typescript` package's parser, and their specifiers resolved with its own `resolveModuleName` under the compiler options that apply to the file — no type checker runs. Java is read with `tree-sitter-java` as WebAssembly, against a symbol table the repository's own files declare — no JVM, no compiler, no classpath. What one file yields depends on that file alone, so it can be cached by the hash of its content, and only resolution and the graph are computed again ([structure-format.md](../structure-format.md), sections 3 and 7).

## Considered Options

- **A TypeScript program with its type checker.** It would see through re-exports to the file that defines a name, and through `paths` that only a bundler knows. But it type-checks a whole repository before it answers, on every change, it needs the repository's type definitions — in `node_modules`, which a fresh clone does not have — and it fails or slows down on exactly the repositories that are in a bad state. Counting Dependencies as written needs none of that.
- **The language servers or compilers of each language**, `tsserver` and `javac` or Eclipse JDT. Precise, but a JVM next to Electron is a second runtime to ship, to start and to keep alive, and the command line could no longer run with `npx`. JavaParser and JDT are Java libraries too.
- **One generic tree-sitter grammar for every language, TypeScript included.** One parser and one way of walking a tree. But resolution is the hard part of TypeScript, not parsing: `tsconfig.json` with `extends`, `paths`, solution-style `references`, the `exports` of workspace packages, `node16` and `bundler`. Its rules live in the `typescript` package, and reimplementing them would drift from what the repository's own compiler does.
- **Regular expressions over the text.** Fast and without dependencies, and wrong: an import in a comment or a string is found, a multi-line one is missed, and what is type-only cannot be told.

## Consequences

- The numbers are a lower bound where only a type checker or a classpath would know more: a barrel is depended on as written, and Java does not see reflection, fully qualified names inside code, or members inherited from a type a file does not name. The specification lists each of these, and the views say so.
- A file the parser cannot read is not analysed: it keeps its Component and has no Dependencies of its own, and the count of such files is shown. TypeScript keeps the list of a file's syntax errors on the parsed file without making it public; the suite reads it there, and a test of a broken file fails should that change.
- The `typescript` package (about 9 MB) runs in the analysis, in the app's main process or off it, and in the CLI; it is never loaded into the renderer. TypeScript 7, written in Go, comes with a different API; moving to it is a change of this adapter, not of the specification.
- The two `.wasm` files of tree-sitter have to ship outside the app's archive. That is decided with distribution.
- No file of the analysed repository is executed, by either parser ([ADR-0007](0007-the-analysis-never-executes-anything-from-the-analysed.md)).
