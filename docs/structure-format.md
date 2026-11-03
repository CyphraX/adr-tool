# Structure format

The contract of the Structure module: what the Component declaration looks like on disk, which files count as source code, how Dependencies are found, and what every metric means. The `structure` package and the app's Structure views implement exactly this document, and an agent or a person who follows it can declare Components without the app.

Vocabulary follows the [Structure glossary](contexts/structure/CONTEXT.md) and the shared language in [CONTEXT-MAP.md](../CONTEXT-MAP.md). Where the module sits in the suite is in [vision.md](vision.md); how it gets built is in [plan-structure.md](plan-structure.md). Every section names the part of that plan it arrives with, so that this document never promises more than the code does.

Three rules stand above everything else:

- **The suite never changes a byte it was not asked to change** ([ADR-0002](adr/0002-never-reserialize-markdown.md)). `.arch/components.yml` is edited by people and by the suite alike; whatever the suite writes there, nothing else in the file moves.
- **Nothing from the analysed repository is ever executed.** No build tool, no script, no compiler plugin. Build and configuration files are read as text. What that costs in precision is stated where it applies.
- **Opening a repository never writes.** `.arch/` is created the first time the architect adopts or changes something.

## 1. The Component declaration (part 2)

Components are declared in one file, `.arch/components.yml`, in the repository root.

```yaml
# .arch/components.yml
components:
  core:
    name: Domain core
    description: The UI-free core of the Decisions module.
    paths: [packages/core/src/**, packages/core/test/**]
    components:
      metadata:                         # Component ID: core/metadata
        paths: [packages/core/src/metadata/**]
      lifecycle:                        # Component ID: core/lifecycle
        paths: [packages/core/src/lifecycle/**]
  app:
    paths: [packages/app/src/**]
```

### Keys

Every key is optional, except that a Component needs `paths`, `components`, or both.

| Key           | Value                | Meaning                                                                                                   |
| ------------- | -------------------- | --------------------------------------------------------------------------------------------------------- |
| `name`        | string               | The display name. Without it, the last segment of the Component ID is shown.                               |
| `description` | string, one sentence | Shown on the Component page, later in Diagrams.                                                            |
| `paths`       | list of patterns     | The Source Files the Component claims.                                                                     |
| `tests`       | list of patterns     | Marks Source Files the Component contains as tests, for layouts the conventions of section 2 do not catch. It only marks: a file is claimed through `paths` alone. |
| `components`  | map                  | The child Components, keyed by their segment.                                                              |

Keys the suite does not know are preserved and ignored, at the top level and inside a Component, as foreign keys are in an ADR's frontmatter.

### Component ID

- The **Component ID** is the path of map keys from the top-level `components` down to the Component, joined with `/`: `core`, `core/metadata`.
- A segment consists of lowercase ASCII letters, digits and dashes, and starts and ends with a letter or a digit. IDs are compared exactly, and a segment is read as it is written: `007` is a segment of its own, not the number 7.
- The ID is what every Trace, Rule and Diagram names. Changing a segment, or moving a Component to another parent, changes the ID of that Component and of everything below it. Changing the segment is **Rename** (below), an operation of the suite that rewrites the declaration and everything that names the ID through one previewed change set, as Renumber does for ADRs. Moving a Component to another parent is done in an editor: what then names the old ID shows up as a Problem (section 6).
- Splitting and merging Components is done by hand. What then names an ID that no longer exists shows up as a Problem (section 6).

### Rename (part 7)

- Rename gives a declared Component a new segment. The Draft has no Rename: its IDs follow directories, and are adopted first.
- The new segment follows the rules above, differs from the old one, and is not taken by a sibling. The `name` stays: a Component without one is shown under its new segment afterwards.
- In the declaration, the key is rewritten where it stands, its quoting kept; nothing else in the file changes. The Components below it follow by themselves, since their IDs are made from it.
- In the same change set, every Trace that names the old ID or an ID below it is rewritten: `affects` in every ADR of the repository ([file-format.md](file-format.md), section 5), and every Component ID in `.arch/rules.yml` ([conformance-format.md](conformance-format.md), section 7). Diagrams join when they exist. Where one of these files cannot be renamed in, the whole Rename is refused with its reason.
- Rename is refused while the file cannot be read, and where the key is written in a way a splice cannot serve — an alias, say: what the suite hands out has been checked to read back as the same declaration under the new IDs.

### Patterns

- A pattern is a glob, matched against the whole path of a file from the repository root, with forward slashes on every platform. `*` matches within one path segment, `**` matches across segments, `?` matches one character.
- Patterns are **never relative to the parent Component's paths**, and there is no matching "at any depth": `*.test.ts` matches in the repository root only; `**/*.test.ts` matches everywhere.
- A pattern that names a directory claims everything beneath it: `packages/core/src` means the same as `packages/core/src/**`.
- A pattern beginning with `!` takes files out again that an earlier pattern of the same list matched.
- A pattern that is absolute or leaves the repository (`..`) is a Problem and matches nothing.
- Patterns select among the Source Files of section 2. A pattern cannot turn a file into a Source File that section 2 excludes.

### Claims, owns, contains

- A Component **claims** a Source File when its `paths` match it.
- A Source File is **owned** by at most one Component. Where a Component and one of its descendants both claim a file, the descendant owns it, however deep.
- A Component **contains** the files it owns and the files its descendants own. Metrics and Dependencies are computed on what a Component contains. A parent need not have `paths` of its own, and a child's patterns need not lie within the parent's.
- Two Components of which neither is an ancestor of the other must not claim the same file. That is a Problem (section 6); until it is solved the file is treated as Unassigned.
- A Source File no Component claims is **Unassigned**. That is a state, not a Problem.

### The Draft

As long as nothing is declared — `.arch/components.yml` does not exist, or has no `components`, or an empty one — the suite derives a **Draft** and works on it exactly as on a declaration. The Draft is marked as a proposal everywhere it is shown.

The Draft is built from directories, not from parsed code. Its top level is made of, in this order, everything that is found:

1. workspace packages: `pnpm-workspace.yaml`, `workspaces` in the root `package.json`;
2. Maven modules: `<modules>` in `pom.xml`, followed recursively;
3. Gradle projects: `include` lines in `settings.gradle` and `settings.gradle.kts`, read as text, string literals only — `:a:b` names the directories `a` and `a/b`;
4. uv workspace members (vision, part 20): the directories that the globs of `members` in `[tool.uv.workspace]` of the root `pyproject.toml` name, without those of `exclude`, where they hold a `pyproject.toml`;
5. Go modules (vision, part 20): where the root holds a `go.mod` or a `go.work`, every directory below it that holds a `go.mod` where the go command looks (section 2) — to Go a nested module is a module of its own, whether anything names it or not;
6. without any of these, the repository as a single unit.

Units nest by the directories they lie in: a unit inside the directory of another is its child Component, whichever build file named it. Where build files name units, they alone make the top level; a directory beside them that is no unit is not drafted, and its Source Files are Unassigned. Not so where the root is a unit of code too: where it declares a Python project — `[project]` or `[tool.poetry]` in `pyproject.toml`, a `setup.py`, `[metadata]` in `setup.cfg` —, or where its `go.mod`, `pyproject.toml`, `setup.cfg` or `setup.py` stands beside Source Files of its language that lie in no unit. There its directories are drafted beside the units it holds. A `pyproject.toml` or `setup.cfg` that only configures a tool (`[tool.ruff]`, `[flake8]`) does not make the root code. The repository as a single unit is not a Component itself: the directories below it are the top level. Where there are none to tell apart, the one directory that holds the code is the one Component (`src`, or `repository` with the pattern `**`).

Below each unit, one further level: the directories under the unit's source root. The source root is the first directory that the packaging configuration of a Python project at the unit names (section 3, "Python") where it holds Source Files, otherwise `src/main/java` where it exists, otherwise `src/` where it exists, otherwise the unit's directory; from there the suite goes down as long as a directory holds exactly one directory and no Source File (this passes over a common base package such as `com/example/shop`), and the directories at that point become the children.

- Only directories that contain at least one Source File become Components. `docs/` does not, and neither does a unit without code.
- A directory that is a unit, or holds one, is not drafted a second time as a directory.
- A drafted Component gets the pattern `<its directory>/**`.
- A segment is made from the directory name: lowercased, every run of characters other than lowercase letters and digits replaced by one dash, dashes at both ends removed; a name that leaves nothing becomes `unit`. Where two siblings would get the same segment, the later one in the order of their paths gets `-2`, `-3`, … — counting up until the segment is free, since a sibling may be called `a-2` already. Where the segment departs from the directory's name, that name is kept as the Component's `name`.
- A build file that cannot be read names no units; the Draft goes on without it.

The checks of section 6 run on the Draft as well. What they find is shown as **hints on the Draft**, not as Problems: a Draft is the suite's own proposal, not something the architect declared.

**Adopt** writes the Draft through a previewed change set: as a new `.arch/components.yml`, or, where the file exists without Components, into that file, where nothing else moves — an empty `components` key stays where it is, with its comment, and the Components go below it. Adopt looks at the file as it is when it is asked, not as it was when the Draft was shown: Components that a person declared in the meantime are never overwritten. Where the file is written in a way that Components cannot be added to so that they read back — a document end marker, a top level in braces — Adopt is refused, and says so. Nobody has to adopt; the module is usable on the Draft.

One limit of the Draft is known: in a repository without units, a `test/` directory beside `src/` lies outside of every drafted Component, and its files are Unassigned until a person declares where they belong.

While `.arch/components.yml` exists but cannot be read (section 6), the suite shows the Draft so that the module stays usable, names the Problem, and does not offer Adopt: it would overwrite what a person wrote.

## 2. Source Files (part 2)

A **Source File** is a file with one of these extensions that survives the exclusions below. All of them count from part 2 on; what arrives later is the reading of their Dependencies.

| Language                | Extensions                                            | Dependencies arrive with |
| ----------------------- | ----------------------------------------------------- | ------------------------ |
| TypeScript / JavaScript | `.ts` `.tsx` `.mts` `.cts` `.js` `.jsx` `.mjs` `.cjs` | part 3                   |
| Svelte                  | `.svelte` — its `<script>` blocks only                | part 3                   |
| Java                    | `.java`                                               | part 4                   |
| Python                  | `.py`                                                 | vision, part 20          |
| Go                      | `.go`                                                 | vision, part 20          |

Declaration files (`.d.ts`, `.d.mts`, `.d.cts`) are Source Files. A Dependency on one is type-only.

### Which files are looked at

- In a git repository: what git tracks, plus untracked files git does not ignore — so that a new file is seen before it is added. git is only ever read. Build output is left out because the repository ignores it, not because of its name.
- Without git: a walk of the directory that honours `.gitignore` files where they exist. In addition `dist/`, `build/`, `out/` and `target/` are left out where they stand next to a build file (`package.json`, `pom.xml`, `build.gradle`, `build.gradle.kts`, `pyproject.toml`, `setup.py`, `setup.cfg`, `go.mod`).
- Never, in either case and at any depth: `node_modules/`, `.git/`, `.arch/`.
- Go files only where the go command looks (vision, part 20): not beneath a directory named `testdata` or `vendor`, and not where a directory or the file's name begins with `_` or `.`. The same holds for `go.mod`.

Finding out what a repository consists of takes git or the disk, so it is not the `structure` package that does it: its caller hands in the list of files — the app from git, read-only, or from its walk (part 3) — and `structure` applies the extensions and the last rule.

### Tests

A Source File is marked **test** when any of these holds:

- a segment of its path is `test`, `tests`, `__tests__` or `e2e`;
- its name ends in `.test.*` or `.spec.*`;
- it lies under `src/test/` (Maven and Gradle);
- its name begins with `test_` and ends in `.py`, ends in `_test.py`, or is `conftest.py` (pytest);
- its name ends in `_test.go` (Go);
- a `tests` pattern of a Component that contains it matches it.

Test files are part of the model, so that a Dependency of production code on test code is seen. Views, Cycles and metrics leave them out by default and can include them.

### Files that cannot be read

A Source File that cannot be parsed is **not analysed**: it stays in the model, keeps its Component, and has no outgoing Dependencies. The number of such files is shown. It is not a Problem — the file is not an artefact of the suite.

## 3. Dependencies (parts 3 and 4)

A **Dependency** is directed, from the Source File that uses to the Source File that is used, both inside the repository. Several uses between the same two files are one Dependency. A file never depends on itself.

A Dependency is **type-only** when it exists for the compiler only and is gone at run time. It is type-only only if every use between the two files is. Of a Dependency that is not, each line of its imports is known to be type-only or not — type-only where every use that begins on it is — so that what counts only the uses at run time (a Rule of Conformance with `type-only: ignored`) points at no line that is about types alone.

A use whose target cannot be determined is **not resolved**: it is counted and listed, and it is neither a Dependency nor the use of a Library. The suite never guesses.

A use of something outside the repository is not a Dependency. Where it names a third-party package it is recorded as the use of a **Library**, by the name the code uses, with the lines of its imports — each known to be type-only or not, as for a Dependency, so that a Rule about Libraries ([conformance-format.md](conformance-format.md), section 2) stands at the import it is about. The Library inventory (below) ties these names to what the manifests declare. The name the code uses is:

- TypeScript and JavaScript: the package name without a subpath — `lodash/fp` is `lodash`, `@codemirror/state/x` is `@codemirror/state`. Node's built-in modules (`node:fs`, `fs`) are not Libraries.
- Java: the package of an import that no file of the repository declares — `org.slf4j` for `org.slf4j.Logger`. Packages beginning with `java.`, `javax.` or `jdk.` are not Libraries. Without a classpath the suite cannot tell which build artefact a package comes from.
- Python: the top-level package of an import that the repository does not have — `requests` for `requests.adapters`, `yaml` for `yaml`, whose distribution is called `PyYAML`: the import does not say so, the manifests do. The standard library is not a Library: the names of `sys.stdlib_module_names` of Python 3.13, together with those removed since 3.8 and those added in 3.14.
- Go: the module that the `go.mod` of the importing file requires and the import path lies below — `github.com/google/uuid` —, otherwise the import path. The standard library, whose import paths have no dot in their first element (`net/http`), is not a Library, nor is cgo's `C`.

### TypeScript and JavaScript (part 3)

Files are parsed one by one with TypeScript's parser; no program is built and no type checker runs ([ADR-0008](adr/0008-dependencies-come-from-parsers-alone-without-a-type-checker.md)). This keeps the analysis fast, incremental per file, and independent of type errors in the repository.

- What counts as a use: `import` and `export … from` declarations, `import x = require('…')`, `require('…')` and dynamic `import('…')` — the last two only with a string literal as argument — and `import('…')` in the position of a type (`import('./x').T`, `typeof import('./x')`). Computed specifiers are not followed, nor are triple-slash directives or types written in JSDoc comments.
- `import type`, `export type … from`, `import('…')` in the position of a type, and an import whose every named binding is marked `type`, are type-only. So is every use in a declaration file and inside a module declared with `declare`: neither exists at run time.
- A file **cannot be parsed** when TypeScript's parser reports a syntax error. Types written into a `.js` file, as Flow does, are not one; its imports are read. `.svelte`, `.mjs` and `.mts` files are read as ES modules, in which the top level may `await`, whatever they contain.
- A specifier is resolved with TypeScript's own module resolution, under the compiler options that apply to the importing file:
  - They come from the nearest `tsconfig.json` or `jsconfig.json` above the file. Where that file has `references` (a solution-style configuration), the options of the first referenced project whose `files` and `include` cover the importing file apply instead; where none covers it, the file's own.
  - `baseUrl`, `paths`, `moduleResolution` and `extends` are honoured. `extends` is followed wherever it points inside the repository, also into `node_modules` or into a generated file git ignores (`.svelte-kit/tsconfig.json`), when the file is there; when it is not, the settings it would have brought are missing. Configuration is read as JSON and nothing outside of the repository is read. `plugins` are never loaded.
  - Where `moduleResolution` is not set, and where there is no configuration file at all, TypeScript's `bundler` resolution applies.
- Resolution lands only on the files the repository consists of (section 2). Build output git ignores is not there for it, even where it lies on the disk.
- A relative specifier that ends in the extension of a Source File TypeScript does not know (`./App.svelte`) is resolved as a path.
- A query at the end of a specifier, which only a bundler understands (`./worker?nodeWorker`, `./icon.svg?raw`), is left out before resolving: it changes how the file is used, not which file it is.
- A **workspace package** is a package the workspace declares — the globs of `pnpm-workspace.yaml` or of `workspaces` in the root `package.json` — or the repository's root package itself. A `package.json` elsewhere, a fixture for instance, names no workspace package. An import of a workspace package resolves through that package's `exports`, `main` or `types`. When the result is a Source File, it is a Dependency. When it is not — the package points at build output that is not there or not a Source File — the use is not resolved. It is never a Library use: the package is part of the repository.
- **Dependencies are counted as written.** An import of a barrel file (`./index`) is a Dependency on the barrel, not on the file that defines the imported name. A barrel at the edge of a Component is that Component's interface. Looking through re-exports is a later option, not the default.
- Imports of files that are not Source Files (`.css`, `.json`, images) are ignored.
- A specifier that is no package name — a path (`/abs`), a subpath import of `package.json` (`#internal`), a URL or a scheme only a bundler or another runtime understands (`virtual:pwa`, `npm:x`) — is not resolved when TypeScript does not resolve it. It is never a Library.

### Svelte (part 3)

A `.svelte` file is a Source File whose content is the concatenation of its `<script>` blocks (instance and `module`), read as TypeScript. The Svelte compiler is not used; markup and styles are not looked at. Svelte components used in markup are imported in the script, so nothing is lost. Line numbers refer to the `.svelte` file. A `<script>` inside an HTML comment or inside `<svelte:head>` belongs to the page and not to the component, and is not read.

A component named through an alias or a package (`$lib/Row.svelte`) resolves as TypeScript would resolve it were it a file `Row.svelte.ts`, unless a file of that name exists, which is then the one meant.

### Java (part 4)

Files are parsed with `tree-sitter-java` ([ADR-0008](adr/0008-dependencies-come-from-parsers-alone-without-a-type-checker.md)). There is no classpath and no build tool; resolution works on what the repository's own files declare.

- Every `.java` file contributes its package and its top-level types. Together they form one symbol table per package, across the whole repository. Files without a package declaration form the default package, from which nothing can be imported.
- A file **cannot be parsed** when tree-sitter finds syntax it cannot read, or has to assume something missing.
- What counts as a use:
  - a single-type import — of a nested type as well (`import a.b.Outer.Inner`), as a use of the file that declares its outer type;
  - an on-demand import (`import a.b.*`), for every simple type name in the file that the imported package declares; the on-demand import of a class's nested types (`import a.b.Outer.*`) is a use of that class;
  - a static import, as a use of the class it names;
  - a simple type name that the file's **own package** declares — this is how Dependencies within a package are found. A simple type name counts where it stands in the position of a type (declarations, `extends`, `implements`, generics, casts, `new`, annotations) or as the qualifier of a static access (`Foo.bar()`, `Foo.BAZ`). The syntax cannot tell that qualifier from a variable (`lines.size()`), so a qualifier counts only when it resolves to a type; a variable that carries the name of a type of its own package is counted wrongly, and knowingly.
- Resolution order for a simple name follows the language: single-type import, own package, on-demand imports. A nested type or a type parameter of the file hides a type of the same name in its package.
- A name that two files of the repository declare in the same package (possible across Maven modules) is not resolved, and nothing is counted. So is a name that two packages imported on demand both declare, and an import of a type that a package of the repository does not declare. A qualifier that might be either of two types is not listed: it may be a variable.
- A use is on the line of its import; a simple name of the own package on the line it is first used on.
- The package of a Library is taken from the import up to the first segment written like a type, as Java's naming has it: `org.slf4j` for `org.slf4j.Logger`, `com.x` for `com.x.Outer.Inner`, the class's package for a static import.
- A package spread over several Components is fine: a use across that boundary is a real Dependency.
- Java has no type-only Dependencies.
- **Not seen, by design:** reflection, fully qualified names written inside code, members inherited from a type the file does not name, nested types used without their outer type's import. Metrics for Java are therefore a lower bound.

### Python (vision, part 20)

Files are parsed with `tree-sitter-python` as WebAssembly, as Java is ([ADR-0008](adr/0008-dependencies-come-from-parsers-alone-without-a-type-checker.md)). No interpreter runs, no environment is installed or read, and `setup.py` is read as text.

- A file **cannot be parsed** when tree-sitter finds syntax it cannot read, or has to assume something missing.
- What counts as a use: `import a.b` and `from a.b import c`, absolute or relative (`from .line import Line`, `from .. import catalog`), wherever they stand in the file — inside a function or a `try` as well. `from __future__ import …` is not one.
- **Python projects and their source roots.** Every directory that holds a `pyproject.toml`, a `setup.cfg` or a `setup.py` is a Python project, and the root of the repository is one in any case. A file belongs to the deepest project that holds it. A project's **source roots** are, in this order:
  - the directories its configuration names: in `pyproject.toml`, setuptools' `package-dir` for `""` and `packages.find.where`, Poetry's `packages` with `from`, the directory of each package of a Hatch wheel's `packages`, PDM's `package-dir`, uv's `module-root` and pytest's `pythonpath`; in `setup.cfg`, `package_dir` for `""` (written `=src`), `where` of `[options.packages.find]` and `pythonpath` of `[tool:pytest]`; in `setup.py`, the string literals of `package_dir={'': '…'}` and `where='…'`. Each is taken relative to the project's directory, `..` folded as text (`../../libs` from `services/api` is `libs`); one above the root of the repository is never a root;
  - its `src`, where Python lies beneath it;
  - its own directory.
- An absolute import `a.b` is looked up below a directory as `a/b/__init__.py`, then as `a/b.py`; a directory `a/b` with Python beneath it and no `__init__.py` is a **namespace package**, which has no file and so is no Dependency. The directories are tried in this order: the directory the importing file's top-level package lies in — the first directory above the file that is no package, the file's own directory where that is none; Python puts a script's directory first, and pytest this one for a test, so that `backend/orders/models.py` finds `shop.settings` in `backend/` —, then the source roots of the file's own project, where the first file found is the one meant; then the source roots of every other project, where exactly one file must be found — found in two, the import is not resolved. A module inside a package is reached only through its package: `import logging` in a package is the standard library's, even beside a `logging.py`. And as Python finds a module or a package anywhere before a namespace package, a directory without `__init__.py` named like a module of the standard library (`platform/`) is passed over: what is imported by that name is the standard library's.
- A relative import is looked up below the importing file's directory, one directory up for every further dot. One that climbs above the file's top-level package — above its own directory, for a file outside of a package —, which Python refuses, or that leads to nothing, is not resolved.
- **Dependencies are counted as written.** `import a.b.c` is a use of the module `a.b.c`, not of the `__init__.py` of `a` and `a.b` that Python runs on the way. `from a.b import c` is a use of the module `a.b.c` where there is one, otherwise of `a.b`, which then defines `c`; where `a.b` is a namespace package without such a module, `c` is not resolved. `from a.b import *` is a use of `a.b`.
- An import in the block of `if TYPE_CHECKING:` (or `if typing.TYPE_CHECKING:`), at any depth, is **type-only**: that block runs for the type checker alone. Its `elif` and `else` run.
- A module the repository does not have: where the top-level package it lies in is found from the importing file (`shop.missing` beside a package `shop`), it is not resolved. Otherwise, where its top-level name is the standard library's, it is skipped; where the repository has a module or package of that name that lies in no package, beneath a directory that is no source root, it is not resolved — the suite cannot tell where the interpreter would find it; otherwise it is a Library.
- A use is on the line of its import.
- **Not seen, by design:** imports made by calling something (`importlib.import_module('…')`, `__import__('…')`), and what a `.pth` file or a change of `sys.path` at run time adds. Stubs (`.pyi`) and compiled extensions are no Source Files. Where code imports by calling something, its Dependencies are a lower bound, and the views say so.

### Go (vision, part 20)

Files are parsed with `tree-sitter-go` as WebAssembly. The go command never runs, nothing is downloaded, and neither a module cache nor `GOPATH` is read.

- A file **cannot be parsed** when tree-sitter finds syntax it cannot read, or has to assume something missing.
- **Modules.** Every `go.mod` where the go command looks (section 2) is a module: its `module` path, what it `require`s, and its `replace` directives that point into the repository — a path beginning with `./` or `../`, as the go command has it, taken relative to the `go.mod` with `..` folded as text; one that climbs above the root of the repository is left out. A `go.work` at the root adds its `replace` directives, which go before those of every module. Both are read as text, blocks included. A file belongs to the module of the deepest `go.mod` above it.
- **Packages.** A package is a directory. What others import from a directory is its files other than `_test.go`, under the package name most of them declare — not `main` where another one is declared, and on a tie the name of the first file by path. A file of another package in that directory (a generator behind `//go:build ignore`) is not part of it.
- **An import path** names a directory, looked up in this order: through a `replace` of `go.work`, through a `replace` of the importing file's module, then through the module of the repository with the longest module path the import path lies below; the rest of the path is the directory below it. Among replacements, too, the longest module path wins. A nested module is the repository's whether or not a `replace` or `go.work` names it. A directory that a deeper module holds belongs to that module, and is not reached through the module path of the outer one: such an import is not resolved, and so is one whose directory holds no package.
- An import path below no module of the repository lies outside: with no dot in its first element it is the standard library and skipped; otherwise it is a Library.
- Dependencies are between files, so a use of a package is a use of the files that declare the name used. Every file contributes what it declares at the top level to its package — functions, types, variables and constants, but not methods, `init` or `_`. What counts as a use:
  - `pkg.Name`, where `pkg` is the name an import binds — its alias, otherwise the package name its files declare, which need not be the last element of the path —, as a use of the files of that package that declare `Name`, on the line of the use. Where none does, `<import path>.Name` is not resolved. Only an exported `Name`, one that begins with a capital letter, can be another package's: `cart.items` selects from a value, and is neither a use nor listed.
  - A name without a qualifier that another file of the file's own package declares, on the line it is first used on. A test file sees every other file of its package; the other files do not see the test files. An external test package (`package cart_test`) is a package of its own that imports the one it tests, and sees what the test files of that package declare, as the go command builds them together (`export_test.go`).
  - A name that a package imported with `.` declares, in the same way.
  - A blank import (`import _ "…"`), and an import whose use the syntax does not show, as a use of every file of its package, on the line of the import.
- Two files that both declare a name — one for each platform, behind build constraints — are each used: build constraints and file names for `GOOS` and `GOARCH` are not evaluated.
- The syntax has no scopes: a name declared inside a function of the file — a parameter, a variable, a type — is never counted as a use of the package, anywhere in the file. A parameter or a variable that carries the name of an imported package hides it the same way: a selection from that name is neither a use nor listed, anywhere in the file, unless it stands in the position of a type (`func Handle(cart *cart.Cart)`), where only a package can.
- Go has no type-only Dependencies.
- **Not seen, by design:** `vendor/` and `testdata/` — an import is resolved into the repository's own modules, never into a copy in `vendor/` —, code generated at build time, and `GOPATH` mode: without a `go.mod` above it, every import of a file with a dot in its first element is a Library, by its import path. A method is reached through its type: calling it is a use of the file that declares the type only where the type is named. Metrics for Go are therefore a lower bound, and the views say so, as they do for Java and Python.

### Manifests (vision, parts 15 and 20)

What the manifests of a repository declare is read for the Library inventory, read as text and never run: no build tool, package manager or interpreter is started, nothing is installed, and neither a registry nor a local repository of packages is asked. The record is minimal and the same for every language: the manifest's path, the name it declares, the version where it gives one, as written, the group where it puts the Library in one, and the line that declares it — the first of a requirement continued over several; in `pyproject.toml`, whose data says no lines, the line its text shows it on, and none where a string with an escape in it does not show what it reads. What the repository holds itself is no Library: a workspace package, a module of a Maven build, a Go module of the repository or one it replaces by a directory. Every reader takes time linear in the length of the file, whatever the file holds — a megabyte on one line included.

- `package.json`: `dependencies`, and `devDependencies`, `peerDependencies` and `optionalDependencies` as the groups `dev`, `peer` and `optional`. A specifier that points into the repository — `workspace:`, `file:`, `link:`, `portal:`, a path — and a package of the workspace or the root package, by name, are left out.
- `pom.xml`: the `<dependencies>` of each project, named `groupId:artifactId`, with the `<scope>` as the group unless it is `compile` or `runtime`, and `optional` for one marked so. The version is the dependency's own, or else that of a `<dependencyManagement>` of the pom or of its parents; a `${property}` in it is taken from the `<properties>` of the pom and its parents, and `project.version`, `project.groupId` and their like from the pom, ten levels deep at most, and left as written beyond. A parent counts only where it lies in the repository — `../pom.xml`, or its `<relativePath>`, and the coordinates match; an empty `<relativePath/>` names none. The XML is read by a parser of its own that is linear in the length of the file: comments, processing instructions and a doctype are passed over, CDATA is text, and a tag that is not closed is closed by its parent's end.
- `build.gradle` and `build.gradle.kts`: a declaration on one line, a configuration and then its coordinates — as a string (`implementation 'g:a:v'`, `api("g:a:v")`), wrapped in `platform(…)`, `enforcedPlatform(…)` or `testFixtures(…)`, as named arguments (`group: 'g', name: 'a', version: 'v'`), as Kotlin's `kotlin("stdlib")` or as an entry of the version catalog `gradle/libs.versions.toml` (`libs.jackson.databind`, a bundle `libs.bundles.x`). The configuration is the group unless it is one of what the code needs to run — `implementation`, `api`, `compile`, `runtimeOnly`, `runtime`. Not read: a declaration over several lines, coordinates computed by code, a project of the build (`project(':core')`), files, and the `classpath` of `buildscript`. A build script is code; the suite does not run it, and so reads what most builds write, not what any build could.

- `pyproject.toml`: the `dependencies` of `[project]`, its `optional-dependencies` with the extra as group, and `[dependency-groups]` with the group's name, an `include-group` left out; Poetry's `dependencies`, `python` left out, its `dev-dependencies` as the group `dev`, and those of `group.<name>` as the group `<name>`. A requirement written as PEP 508 has its name without extras, and as its version what stands between them and the markers, unless that is a URL.
- `requirements.txt`, `requirements-dev.txt` and the like, and every `.txt` in a directory `requirements/`: a requirement a line, continued lines joined; comments, options (`-r`, `-e`, `--index-url`, `--hash`), paths and URLs are left out.
- `go.mod`: what it `require`s, with its version; what it marks `// indirect` as the group `indirect`.
- A manifest that cannot be read names nothing.

### The Library inventory (vision, part 15)

The **Library inventory** joins the Libraries the manifests declare with those the code uses, per Component, and says of each how it was told. It is derived each time, like everything in this section.

- **A manifest belongs** to the innermost Component that contains every Source File in or below its directory — a package's `package.json` to the Component of the package —, and to none where it lies at the root or above code that no one Component holds. A requirements file in a directory `requirements/` speaks for the directory above.
- **The names a Library is imported by** are told by its ecosystem, and how they were told is part of the inventory:
  - `same`: an npm package by its name — and `@types/x` as the types of `x`, `@types/a__b` of `@a/b` —, a Go module as the prefix of the import path, up to a `/`.
  - `installed`: the top-level packages that the installed distribution lists, in a virtual environment of the repository (below) — `top_level.txt`, else the top-level names of `RECORD`.
  - `known`: the suite's table of well-known differences — `PyYAML` is `yaml`, `Pillow` is `PIL`, `beautifulsoup4` is `bs4`; Guava is `com.google.common`, JUnit 4 `org.junit`.
  - `normalised` — a heuristic: Python's normalised name (PEP 503), its dashes as underscores, taken as the name it is imported by.
  - `group` — a heuristic: the group ID of a Maven artefact, taken as the prefix of its packages, up to a `.`; it is the same for every artefact of the group.

  A Library mapped by a heuristic that shows no use may be used under another name; the views and the MCP server say which mapping they used. A use goes to the declared Library whose import name matches the longest; one that matches none is a Library of its own, by the name the code uses, and declared nowhere.
- **For each Component** the inventory says which Source Files use a Library, whether every one of them is a test, and which of them have no manifest of the same ecosystem in their directory or above that declares it. In Go only the `go.mod` of the file's own module counts: a module ends at its `go.mod`.
- **Seen from a scope** — the whole repository, or a Component with those inside it — a Library is **used**: a file of the scope uses it, and a manifest declares it for each such file; **declared, not used**: a manifest of the scope declares it, and no file of the scope imports it — a tool that is run and never imported, such as a linter, is one; or **used, not declared**: a file of the scope uses it without a manifest for it, which works only where a package manager hoists it, or a classpath happens to have it. The versions shown are those of the scope's manifests, or else those of every manifest that declares it; two versions of one Library are both shown.

### Declared licences (vision, part 15)

A Library's licence is what the copy installed **inside the repository** declares about itself — read, never guessed from a licence's text, and never looked up outside the repository. Each file is read through the file-system port within a limit of bytes, which never follows a link out of the repository; what is larger than its limit is not read.

- **npm:** the `package.json` of the package in `node_modules`, looked up from the directory of each manifest that declares it and of each file that uses it, up through the directories above, as Node.js finds it — its `license`, or the older `licenses` (a type, or a list of them, joined by commas). One megabyte at most.
- **Python:** a distribution in a virtual environment of the repository — `.venv` or `venv`, at the root or beside a Python manifest, in `lib/python*/site-packages` or `Lib/site-packages` — by its `*.dist-info` or `*.egg-info`: `License-Expression` of its `METADATA`, else its `License` field unless that says `UNKNOWN` (its first line), else the last part of its `License ::` classifiers; where none says one, a licence file in the `.dist-info` or its `licenses/` makes it "LICENSE file present". `METADATA` is read up to one megabyte, `top_level.txt` 64 KiB, `RECORD` 8 MiB.
- **Go:** a module copied into the `vendor/` directory of its module, with a licence file (`LICENSE`, `LICENCE`, `COPYING` or `UNLICENSE`, with or without a suffix such as `.md` or `-MIT`): "LICENSE file present". Go has no metadata that names a licence, and the file is not read for one.
- **Java** cannot be told: the artefacts lie in Maven's or Gradle's local repository, outside the repository, which is not read.

A Library whose licence cannot be told is marked with the reason: not installed in the repository; installed, and declaring none; what it declares cannot be read, or is larger than its limit; or installed outside the repository, as every Java Library is.

## 4. Dependencies between Components (part 3)

Views show one level of the hierarchy at a time. The **nodes** of a level are:

- the Components of that level — the top-level Components, or the children of one Component — each standing for everything it contains;
- below a parent that owns Source Files itself: one node for those files, labelled `<name> (own files)`;
- at the top level: one node `(unassigned)` for the Unassigned Source Files, when there are any.

A Component without children shows what it owns **by directory** (part 8), at any depth:

- Its **base** is the deepest directory that holds all of its Source Files, test files included, so that the levels do not change with the filter.
- The level below the Component shows the Source Files that lie directly in the base, each as a node, and one **directory node** for each directory directly below the base that holds Source Files of the Component. A directory node opens like a Component, onto the same again: the Source Files directly in it, and its directories.
- A directory that holds exactly one directory and no Source File of the Component is passed over: the node stands for the deepest such directory and is labelled with the path from the level's directory, `internal/impl`. This passes over the steps of a Java package path.
- Where the Component's Source Files all lie in its base, there are no directory nodes: the level is its Source Files.
- A directory node whose Source Files are all test files is not shown while test files are left out.
- A directory node is addressed by the Component's ID followed by the path of its directory below the base: `cart/internal/impl`. That is an address in the views, not a Component ID. No declaration, Trace or Rule names it, Rename does not apply, and it follows the files when they move. A Component without children has no IDs below its own, so the two never meet.
- Directories are never declared and never written: Adopt writes the Draft's Components, not the directories below them. A directory that should be a Component is declared as one; its parent then has children, and shows them.

- The Dependency from node A to node B is the set of Dependencies from Source Files of A to Source Files of B. Its **weight** is the number of distinct pairs of Source Files. It is type-only when every Dependency in it is.
- The own-files node and `(unassigned)` exist to make every Dependency visible. They have a size and no other metric, and they do not count towards fan-in and fan-out. A directory node has the metrics of a Component; a Source File node has a size.
- A graph of all Source Files of a repository is never drawn; the matrix of section 5 gives the overview.

### Cycles

A **Cycle** is a strongly connected group with more than one member: among the Source Files of one Component without children, or among the nodes of one level. The own-files node takes part like a Component — a Cycle between a parent's own files and its child is real. `(unassigned)` never takes part: it is a bag of unrelated files and would tie everything together. Cycles are reported as groups, never as the elementary round trips inside them.

For each Cycle the suite shows one round trip as an example: a shortest one, and among several the one whose sequence of IDs or paths, starting at its smallest member, sorts first. Among the nodes of a level it also names the **weakest Dependency**: the Dependency on that round trip with the lowest weight, the first such in the round trip's order — the candidate for cutting. Among Source Files every Dependency weighs one, and none is named: not on a level of Source Files, nor on a level of directories and Source Files.

A Cycle that consists of type-only Dependencies alone is marked as such; it does not exist at run time. Cycles are computed on what the view shows: without test files by default.

In Structure a Cycle is a fact. It becomes a Violation only through a Rule of the Conformance module.

## 5. Metrics (parts 5 and 13)

Every metric is shown with its definition. Those of the table are computed per Component on the Source Files it contains, and per directory node of section 4 on the Source Files of its Component beneath it; "outside" means outside what it contains. By default test files are left out and type-only Dependencies count; Unassigned files count as outside. A Component that contains no Source File has no metrics. "Dependencies" are Source File Dependencies here, each pair of files once, as in section 3.

| Metric                 | Definition                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| Size                   | Source Files contained; lines of those files. A file has as many lines as line breaks, and one more when text follows the last one; a file that cannot be read has none. |
| Efferent coupling, Ce  | Source Files inside that depend on at least one Source File outside.                                          |
| Afferent coupling, Ca  | Source Files outside that depend on at least one Source File inside.                                          |
| Instability, I         | Ce / (Ca + Ce); undefined when both are zero. 0 is maximally stable, 1 maximally unstable.                    |
| Fan-out, fan-in        | Components with the same parent — or directory nodes on the same level — that this one depends on, and that depend on it. |
| Relational cohesion, H | (R + 1) / N, with N the number of Source Files inside and R the number of Dependencies among them.            |
| Internal share         | Dependencies among the files inside, divided by all Dependencies that start or end inside; undefined when there are none. |
| Abstractness, A (part 13) | The abstract declarations inside, divided by all declarations inside ("Declarations", below); undefined where the files inside declare nothing that is counted. 0 is wholly concrete, 1 wholly abstract. |
| Distance from the main sequence, D (part 13) | \|A + I − 1\|; undefined where A or I is. 0 lies on the main sequence, A + I = 1; 1 in one of its corners — stable and concrete, the zone of pain, or unstable and abstract, the zone of uselessness. |

Ce, Ca and I follow Robert C. Martin's definitions, with the Source File in the place of the class; so do A and D, with the declarations below in the place of his classes. The window draws I across and A up, with the main sequence from (0, 1) to (1, 0), for the Components of a level.

### Inside a Source File (part 13)

What is measured inside a Source File comes from the tree its parser builds for its Dependencies (section 3, [ADR-0008](adr/0008-dependencies-come-from-parsers-alone-without-a-type-checker.md)), and is extracted and cached with its uses (section 7): what one file yields depends on that file alone. A file that cannot be parsed has nothing measured; nor has a file whose measuring fails, which keeps its Dependencies and is named — by `adr check` on standard error, by the Component page. Test files are left out unless included, as everywhere.

**Functions.**

- TypeScript, JavaScript and Svelte (its script blocks): every function with a body — a function declaration or expression, an arrow function, a method, a constructor, a `get` or `set` accessor, of a class or of an object literal. An overload, an abstract method and what is declared with `declare` have no body and are no functions. Every function counts on its own, an arrow function passed as an argument too.
- Java: every method and constructor with a body — a record's compact constructor, the methods of an anonymous class and of an enum constant's body included. A lambda is part of the method it is written in; a lambda in the initializer of a field is a function of its own.
- Python: every `def`, `async def` included, in a module, a class or a function: a function inside a function is one of its own. A lambda is part of the function it is written in.
- Go: every function and method with a body. A function literal is part of the function it is written in; one assigned to a variable of the package, `var handle = func(…) {…}`, is a function of its own.
- Code outside every function — the top level of a module or of a component's script, the value of a class field that is not a function, an initializer or static block — lies in no function and is not counted.

**Names.** A function is named by what contains it, joined by `.` ([conformance-format.md](conformance-format.md), section 3):

- TypeScript and JavaScript: a function, class or namespace by its name; a method, field or property by its key, `[expression]` where it is computed; a constructor `constructor`; an accessor `get total` or `set total`; a function expression or arrow function by the variable, property or field it is assigned to — `const total = () => …` is `total` —, `default` where a module exports it by default, otherwise by its own name; one passed to a call by the call, without its arguments — `load.map()` for the callback of `load.map(x => …)`, `new Promise()`, `items.filter().map()` along a chain —; otherwise `<anonymous>`. An object literal contains its methods where it is assigned to a name, `api.load`, or passed to a call, `liveMarks.iterate().enter` for the method `enter` of the object passed to `liveMarks.iterate(…)`; one that is neither contains nothing.
- Java: a type by its name; a method or constructor by its name and the types of its parameters as written, without annotations, type arguments and spaces — `Cart.add(Product)`, `Cart.Cart()`, `Cart.add(List,String...)` —, so that overloads are told apart; an anonymous class `<anonymous>`; a lambda in a field by the field.
- Python: a function or class by its name, within the classes and functions that contain it — `Cart.total`, `outer.inner`, `Cart.Line.cents`. A property's setter has the name of its getter, and comes again: `Cart.total#2`.
- Go: a function by its name; a method by its type and its name, `Cart.Total`, whether the receiver is `Cart` or `*Cart`, without type arguments; a function literal of a package variable by the variable. Go has no overloads, but a file may have two `init` functions: `init`, `init#2`.
- A name that comes again in the same file — two callbacks of one call in one function, two anonymous functions, a class declared twice in two blocks — gets `#2`, `#3`, … in the order of the file: `total.<anonymous>#2`. Names do not change when lines move. The suffix is positional: it moves to another function when one of the same name is added or removed before it (conformance-format.md, section 3).
- A function begins on the line of its name in Java, in TypeScript where its text begins, past its decorators, in Python on the line of its `def`, past its decorators, in Go on the line of its `func`; it ends where its text ends.

**Cyclomatic complexity** (McCabe, 1976) of a function: 1, and 1 more for each point at which it decides which way to go:

| Decides | TypeScript, JavaScript, Svelte | Java | Python | Go |
| ------- | ------------------------------ | ---- | ------ | -- |
| Branches | each `if` — an `else if` is an `if` of its own, `else` counts nothing —, each `?:` | each `if`, each `?:` | each `if`, `elif` and conditional expression; `else` counts nothing | each `if` — an `else if` is an `if` of its own |
| Loops | each `for`, `for … in`, `for … of`, `while`, `do … while` | each `for`, enhanced `for`, `while`, `do … while` | each `for` and `while`, and one more for its `else`; each `for` of a comprehension | each `for`, `range` included |
| `switch` | each `case` with a value; `default` counts nothing | each `case` label, `case A, B` once; `default` counts nothing; each `when` guard | each `case` of a `match`, and one less where one is irrefutable, `case _:` or `case name:`; a guard counts nothing | each `case` of a `switch`, a type switch and a `select`; `default` counts nothing |
| Exceptions | each `catch` | each `catch` | each `except`, and one more for the `else` of the `try`; a `try` with `except*` counts nothing | — |
| Short circuits | each `&&`, `\|\|`, `??`, `&&=`, `\|\|=`, `??=`, and each optional access or call `?.` | each `&&`, `\|\|` | each `and`, `or`; each `if` of a comprehension | each `&&`, `\|\|` |
| Defaults | each default value of a parameter or of a destructuring | — | — | — |
| Assertions | — | — | each `assert`, and nothing of what it tests | — |

That is the count of ESLint's rule `complexity` in its classic variant, default values and `?.` included, for TypeScript and JavaScript, and that of Checkstyle's `CyclomaticComplexity` with each `case` counted (`switchBlockAsSingleDecisionPoint` off) for Java, lambdas counted with their method as Checkstyle counts them — so that a person who knows either tool finds the same numbers. ESLint counts a class field's value and a static block as units of their own; Checkstyle counts an initializer block, static or not, as a unit of its own, and a field's value not at all. The suite counts no code outside a function, and makes a lambda in a field's initializer the one function there. For Python it is the count of radon's `cc` (radon 6), which counts neither a function's decorators nor the default values of its parameters, nor does the suite; radon lists a function inside a function, a closure, apart from the list of its file, and the suite lists it as any other. For Go it is gocyclo's (gocyclo 0.6), which names a method `(*Cart).Total` and the function literal of a `var` by the first name the declaration gives; the suite names them `Cart.Total` and by the variable the literal is assigned to. `try`, `finally`, `throw`, `return`, `break` and labels count nothing, nor do types: a conditional type is no branch.

**LCOM4** of a class (Hitz and Montazeri, 1995): the number of connected groups among its methods, two methods being connected when both use one field of the class, or one of them uses the other. 1 is a cohesive class; 2 or more, a class whose groups could be classes of their own. Undefined for a class without methods.

- Classes: TypeScript and JavaScript classes, class expressions included; Java classes, enums and records; Python classes, nested ones included. Not interfaces. Go has none: the methods of a type may lie in every file of its package, and a file alone holds no class to measure.
- Methods: those with a body, static ones and accessors included; a field whose value is a function (`handle = () => …`) is a method. In Python every `def` directly in the class's body, `@property`, `@classmethod` and `@staticmethod` included. Constructors are left out — Python's `__init__` and `__new__` —: they set every field, and would join what does not belong together. So is a method that uses no member of its class and is used by no other method — an override that answers a constant, a hook left empty, as a widget's `ignoreEvent() { return false }`: it says nothing about how the class holds together, and would count as a group of its own. The methods a class is shown with are those LCOM4 counts.
- Fields: TypeScript property declarations and parameter properties (`constructor(private readonly lines: Line[])`), and in TypeScript and JavaScript every member the class writes to through `this` — `this.items = []` in its constructor, as JavaScript declares its fields, `this.count++` in a method — that is not a method; Java fields, a record's components, an enum's constants; in Python what the class's body assigns, and what its methods assign through their first parameter, `self.items = []`.
- Uses: in TypeScript and JavaScript `this.x`, `this['x']`, `Cart.x` for a static member, `const { x } = this` — inside arrow functions too, but not inside a nested class, a function written with `function`, or a method or accessor of an object literal, which have a `this` of their own. In Java the plain name of a field where no parameter or local variable of that name is seen — a local from its declaration to the end of its block, a parameter of a lambda or a `catch` inside it, a pattern variable to the end of the block that holds the pattern —; `this.x` and `Cart.x` with the class's own name; a call of a method of the class without an object, on `this` or on the class's name; `this::m`; the field a method reference is taken on, `allowed::contains`; the accessor of a record's component. Inside an anonymous class, `this` is that class's. In Python `self.x` — whatever the method's first parameter is called, `cls.x` in a class method; a static method has none — and `Cart.x` with the class's own name; inside a lambda or a function within the method too, unless it takes a parameter of that name, and not inside a class within the method.
- Not seen: members inherited from another class — in JavaScript a member the class reads and never writes is taken for one —, and uses through another variable of the same class (`other.x`).

**Declarations**, for abstractness:

- Java: every class, interface, enum, record and annotation type — top-level, nested or local. Abstract are interfaces, annotation types, which Java declares as interfaces, and classes declared `abstract`. An anonymous class is no declaration.
- TypeScript and JavaScript: what a module declares at its top level and inside its namespaces — classes, interfaces, type aliases, enums, functions; a function or class also as a variable initialised with one, and as what the module exports by default. Abstract are interfaces, type aliases, classes declared `abstract`, and what is declared without an implementation: under `declare`, or in a declaration file. A function's overloads are one declaration.
- Svelte: a component is one concrete declaration; what its scripts declare is part of it.
- Python: the classes and functions a module defines at its top level, decorated ones included. Abstract is a class that derives from `ABC` or `Protocol`, is made by the metaclass `ABCMeta`, or has a method decorated `@abstractmethod`.
- Go: the types and functions a file declares for its package — not a method, which belongs to its type, not `init`, which cannot be named, not an alias, which declares no type of its own. Abstract are interfaces.
- **Limits.** Martin counts classes; a TypeScript module offers functions and types more often than classes, so both are counted: an interface or a type alias is abstract — what is used of it has no implementation —, a function or a class is concrete. An interface that only describes the shape of data counts as abstract all the same; a constant, an object of functions, and what CommonJS assigns to `module.exports` count as nothing. Python and Go are counted as TypeScript is, types and functions both. As [vision.md](vision.md) says, A means most for Java.

### Propagation cost of a level (part 13)

How much of a level a change to one of its nodes may reach, on average: the share of the ordered pairs of distinct nodes of the level of which the first depends on the second, directly or through other nodes of the level — the density of the transitive closure of the level's Dependencies (MacCormack, Rusnak and Baldwin, 2006). The nodes are those of section 4 but `(unassigned)`, which takes no part, as in Cycles; test files are left out unless included, type-only Dependencies count. It is 0 where no node depends on another and 1 where every node reaches every other; undefined for a level of fewer than two nodes. MacCormack et al. count the diagonal, every element reaching itself: for N nodes their figure is (P · N (N − 1) + N) / N². The suite leaves it out, since a level has few nodes, where the diagonal would add 1/N to every figure.

### The dependency structure matrix

**The dependency structure matrix** lists the nodes of one level as rows and columns, in the same order. The cell in the row of A and the column of B holds the Dependency from A to B: its weight, and the same list of Source File Dependencies as the edge in the graph opens. The diagonal stays empty. Graph and matrix are two views of one model and share filter and selection.

- **Order.** Within a level, rows are in topological order, so that a Dependency of a row on an earlier row lies below the diagonal; whatever lies above the diagonal closes a Cycle — or a round trip through `(unassigned)`, which section 4 does not call one. The members of a Cycle come as one, and so do those of such a round trip. A row, or a Cycle, comes as soon as everything it depends on outside of itself has come; among those that could come next, the one with the member that is first in the order of the level's nodes: the Components as declared, the own files before the children, `(unassigned)` last, Source Files by path; below a Component without children, the Source Files directly in the directory by path, then its directory nodes by path.
- **Inside a Cycle** the order keeps what lies above the diagonal light. The members are placed one by one: the first member that depends on no member still to be placed; when there is none, the member whose Dependencies from the members still to be placed outweigh its Dependencies on them the most, the first such in the level's order. In a Cycle of two this puts the lighter of the two Dependencies above the diagonal.
- **Expanding.** The row of a Component that contains Source Files, or of a directory node, can be expanded into the rows of the level below it, in that level's order, where the Component stood — and so on, down to Source Files. A cell then holds the Dependencies from the Source Files of its row to those of its column, whatever level each of them is at. The rule still holds: what lies above the diagonal closes a Cycle, at one level or another.

## 6. Problems (part 2)

Structure adds these **Problems** about `.arch/components.yml`:

| Problem                                                                                                                                   | Repair                          |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| The file cannot be read: it is not YAML, or a key the suite owns has a value of the wrong form (`components` is not a map, `paths` is not a list of strings). | —           |
| A segment is not a valid Component ID segment.                                                                                              | —                               |
| A key occurs twice in one `components` map, so that two Components share an ID.                                                             | —                               |
| A pattern of `paths` or `tests` that does not begin with `!` matches no Source File.                                                        | Remove the pattern (previewed). |
| A pattern is absolute or leaves the repository.                                                                                             | —                               |
| Two Components, neither an ancestor of the other, claim the same Source File. The files are listed.                                          | —                               |
| A Component has neither `paths` nor `components`.                                                                                           | —                               |

A Repair is offered only where exactly one change is right. Problems of Structure appear in the same Problems view as those of the Decision Logs, grouped by module.

The Repair takes the pattern out where it stands: from a flow list with one comma, from a block list with its line, and with its key when it was the last one — a Component left with neither `paths` nor `components` is then a Problem of its own, for a person to decide. YAML can be written in more ways than a splice can serve: a Component in braces, a comment between two items, a tag or an anchor on an item. There the Repair is refused with the advice to use an editor. Whatever the suite hands out has been checked to read back as a declaration.

A Trace adds one more, reported on the ADR among the Problems of its Decision Log: **`affects` names a Component ID that is not declared.** Its Repair takes the item out of the list, where it stands, as the Repair for a Relation to a missing ADR does. Traces are checked only against a declaration that can be read: on the Draft, whose IDs follow directories, nothing is reported, and while the file cannot be read, that is the Problem to solve first ([file-format.md](file-format.md), section 5).

## 7. What is not in the repository (part 3)

The model, the Dependencies, the Cycles and the metrics are derived and never stored in the repository. The app caches, per Source File and keyed by the hash of its content, what was extracted from it — its uses, unresolved, and what is measured inside it (section 5); resolution, graph and metrics are recomputed. The cache lives in the app's user-data folder, separately per repository and per version of the analysis. A command-line run computes everything afresh.
