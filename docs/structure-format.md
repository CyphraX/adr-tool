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
- A segment consists of lowercase ASCII letters, digits and dashes, and starts and ends with a letter or a digit. IDs are compared exactly.
- The ID is what every Trace, Rule and Diagram names. Changing a segment, or moving a Component to another parent, changes the ID of that Component and of everything below it. Both are one operation of the suite, **Rename** (part 7), which rewrites the declaration and everything that names the ID through one previewed change set, as Renumber does for ADRs. Before part 7 nothing outside the declaration names a Component, and a segment is changed by editing the file.
- Splitting and merging Components is done by hand. What then names an ID that no longer exists shows up as a Problem (section 6).

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
2. Maven modules: `<modules>` in `pom.xml`, followed recursively — a module of a module becomes a child Component;
3. Gradle projects: `include` lines in `settings.gradle` and `settings.gradle.kts`, read as text, string literals only — `:a:b` becomes the child `b` of `a`;
4. without any of these, the repository as a single unit.

Below each unit, one further level: the directories under the unit's source root. The source root is `src/main/java` where it exists, otherwise `src/` where it exists, otherwise the unit's directory; from there the suite goes down as long as a directory holds exactly one directory and no Source File (this passes over a common base package such as `com/example/shop`), and the directories at that point become the children.

- Only directories that contain at least one Source File become Components. `docs/` does not.
- A drafted Component gets the pattern `<its directory>/**`.
- A segment is made from the directory name: lowercased, every run of characters other than lowercase letters and digits replaced by one dash, dashes at both ends removed; a name that leaves nothing becomes `unit`. Where two siblings would get the same segment, the second in the order of their paths gets `-2`, the third `-3`.

The checks of section 6 run on the Draft as well. What they find is shown as **hints on the Draft**, not as Problems: a Draft is the suite's own proposal, not something the architect declared.

**Adopt** writes the Draft through a previewed change set: as a new `.arch/components.yml`, or, where the file exists without Components, into that file, where nothing else moves. Nobody has to adopt; the module is usable on the Draft.

While `.arch/components.yml` exists but cannot be read (section 6), the suite shows the Draft so that the module stays usable, names the Problem, and does not offer Adopt: it would overwrite what a person wrote.

## 2. Source Files (part 2)

A **Source File** is a file with one of these extensions that survives the exclusions below. All of them count from part 2 on; what arrives later is the reading of their Dependencies.

| Language                | Extensions                                            | Dependencies arrive with |
| ----------------------- | ----------------------------------------------------- | ------------------------ |
| TypeScript / JavaScript | `.ts` `.tsx` `.mts` `.cts` `.js` `.jsx` `.mjs` `.cjs` | part 3                   |
| Svelte                  | `.svelte` — its `<script>` blocks only                | part 3                   |
| Java                    | `.java`                                               | part 4                   |

Declaration files (`.d.ts`, `.d.mts`, `.d.cts`) are Source Files. A Dependency on one is type-only.

### Which files are looked at

- In a git repository: what git tracks, plus untracked files git does not ignore — so that a new file is seen before it is added. git is only ever read. Build output is left out because the repository ignores it, not because of its name.
- Without git: a walk of the directory that honours `.gitignore` files where they exist. In addition `dist/`, `build/`, `out/` and `target/` are left out where they stand next to a build file (`package.json`, `pom.xml`, `build.gradle`, `build.gradle.kts`).
- Never, in either case and at any depth: `node_modules/`, `.git/`, `.arch/`.

### Tests

A Source File is marked **test** when any of these holds:

- a segment of its path is `test`, `tests`, `__tests__` or `e2e`;
- its name ends in `.test.*` or `.spec.*`;
- it lies under `src/test/` (Maven and Gradle);
- a `tests` pattern of a Component that contains it matches it.

Test files are part of the model, so that a Dependency of production code on test code is seen. Views, Cycles and metrics leave them out by default and can include them.

### Files that cannot be read

A Source File that cannot be parsed is **not analysed**: it stays in the model, keeps its Component, and has no outgoing Dependencies. The number of such files is shown. It is not a Problem — the file is not an artefact of the suite.

## 3. Dependencies (parts 3 and 4)

A **Dependency** is directed, from the Source File that uses to the Source File that is used, both inside the repository. Several uses between the same two files are one Dependency. A file never depends on itself.

A Dependency is **type-only** when it exists for the compiler only and is gone at run time. It is type-only only if every use between the two files is.

A use whose target cannot be determined is **not resolved**: it is counted and listed, and it is neither a Dependency nor the use of a Library. The suite never guesses.

A use of something outside the repository is not a Dependency. Where it names a third-party package it is recorded as the use of a **Library**; the inventory that shows Libraries and maps them to the build files arrives later (vision, tier Next). Until then a Library is known by the name the code uses:

- TypeScript and JavaScript: the package name without a subpath — `lodash/fp` is `lodash`, `@codemirror/state/x` is `@codemirror/state`. Node's built-in modules (`node:fs`, `fs`) are not Libraries.
- Java: the package of an import that no file of the repository declares — `org.slf4j` for `org.slf4j.Logger`. Packages beginning with `java.`, `javax.` or `jdk.` are not Libraries. Without a classpath the suite cannot tell which build artefact a package comes from.

### TypeScript and JavaScript (part 3)

Files are parsed one by one; no program is built and no type checker runs. This keeps the analysis fast, incremental per file, and independent of type errors in the repository.

- What counts as a use: `import` and `export … from` declarations, `import x = require('…')`, `require('…')` and dynamic `import('…')` — the last two only with a string literal as argument. Computed specifiers are not followed.
- `import type`, `export type … from`, and an import whose every named binding is marked `type`, are type-only.
- A specifier is resolved with TypeScript's own module resolution, under the compiler options that apply to the importing file:
  - They come from the nearest `tsconfig.json` or `jsconfig.json` above the file. Where that file has `references` (a solution-style configuration), the options of the first referenced project whose `files` and `include` cover the importing file apply instead; where none covers it, the file's own.
  - `baseUrl`, `paths`, `moduleResolution` and `extends` are honoured. `extends` is followed wherever it points, also into `node_modules`, when the file is there; when it is not, the settings it would have brought are missing. `plugins` are never loaded.
  - Where `moduleResolution` is not set, and where there is no configuration file at all, TypeScript's `bundler` resolution applies.
- A relative specifier that ends in the extension of a Source File TypeScript does not know (`./App.svelte`) is resolved as a path.
- An import of a workspace package resolves through that package's `exports`, `main` or `types`. When the result is a Source File, it is a Dependency. When it is not — the package points at build output that is not there or not a Source File — the use is not resolved. It is never a Library use: the package is part of the repository.
- **Dependencies are counted as written.** An import of a barrel file (`./index`) is a Dependency on the barrel, not on the file that defines the imported name. A barrel at the edge of a Component is that Component's interface. Looking through re-exports is a later option, not the default.
- Imports of files that are not Source Files (`.css`, `.json`, images) are ignored.

### Svelte (part 3)

A `.svelte` file is a Source File whose content is the concatenation of its `<script>` blocks (instance and `module`), read as TypeScript. The Svelte compiler is not used; markup and styles are not looked at. Svelte components used in markup are imported in the script, so nothing is lost. Line numbers refer to the `.svelte` file.

### Java (part 4)

Files are parsed with `tree-sitter-java`. There is no classpath and no build tool; resolution works on what the repository's own files declare.

- Every `.java` file contributes its package and its top-level types. Together they form one symbol table per package, across the whole repository.
- What counts as a use:
  - a single-type import;
  - an on-demand import (`import a.b.*`), for every simple type name in the file that the imported package declares;
  - a static import, as a use of the class it names;
  - a simple type name that the file's **own package** declares — this is how Dependencies within a package are found. A simple type name counts where it stands in the position of a type (declarations, `extends`, `implements`, generics, casts, `new`, annotations) or as the qualifier of a static access (`Foo.bar()`, `Foo.BAZ`).
- Resolution order for a simple name follows the language: single-type import, own package, on-demand imports.
- A name that two files of the repository declare in the same package (possible across Maven modules) is not resolved, and nothing is counted.
- A package spread over several Components is fine: a use across that boundary is a real Dependency.
- Java has no type-only Dependencies.
- **Not seen, by design:** reflection, fully qualified names written inside code, members inherited from a type the file does not name, nested types used without their outer type's import. Metrics for Java are therefore a lower bound.

## 4. Dependencies between Components (part 3)

Views show one level of the hierarchy at a time. The **nodes** of a level are:

- the Components of that level — the top-level Components, or the children of one Component — each standing for everything it contains;
- below a parent that owns Source Files itself: one node for those files, labelled `<name> (own files)`;
- at the top level: one node `(unassigned)` for the Unassigned Source Files, when there are any.

A Component without children shows its Source Files as nodes.

- The Dependency from node A to node B is the set of Dependencies from Source Files of A to Source Files of B. Its **weight** is the number of distinct pairs of Source Files. It is type-only when every Dependency in it is.
- The two nodes that are not Components exist to make every Dependency visible. They have a size and no other metric, and they do not count towards fan-in and fan-out.
- A graph of all Source Files of a repository is never drawn; the matrix of section 5 gives the overview.

### Cycles

A **Cycle** is a strongly connected group with more than one member: among the Source Files of one Component without children, or among the nodes of one level. The own-files node takes part like a Component — a Cycle between a parent's own files and its child is real. `(unassigned)` never takes part: it is a bag of unrelated files and would tie everything together. Cycles are reported as groups, never as the elementary round trips inside them.

For each Cycle the suite shows one round trip as an example: a shortest one, and among several the one whose sequence of IDs or paths, starting at its smallest member, sorts first. Among the nodes of a level it also names the **weakest Dependency**: the Dependency on that round trip with the lowest weight, the first such in the round trip's order — the candidate for cutting. Among Source Files every Dependency weighs one, and none is named.

A Cycle that consists of type-only Dependencies alone is marked as such; it does not exist at run time. Cycles are computed on what the view shows: without test files by default.

In Structure a Cycle is a fact. It becomes a Violation only through a Rule of the Conformance module.

## 5. Metrics (part 5)

Every metric is shown with its definition. All of them are computed per Component on the Source Files it contains; "outside" means outside what it contains. By default test files are left out and type-only Dependencies count; Unassigned files count as outside. A Component that contains no Source File has no metrics.

| Metric                 | Definition                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| Size                   | Source Files contained; lines of those files.                                                                 |
| Efferent coupling, Ce  | Source Files inside that depend on at least one Source File outside.                                          |
| Afferent coupling, Ca  | Source Files outside that depend on at least one Source File inside.                                          |
| Instability, I         | Ce / (Ca + Ce); undefined when both are zero. 0 is maximally stable, 1 maximally unstable.                    |
| Fan-out, fan-in        | Components with the same parent that this one depends on, and that depend on it.                              |
| Relational cohesion, H | (R + 1) / N, with N the number of Source Files inside and R the number of Dependencies among them.            |
| Internal share         | Dependencies among the files inside, divided by all Dependencies that start or end inside; undefined when there are none. |

Ce, Ca and I follow Robert C. Martin's definitions, with the Source File in the place of the class.

**The dependency structure matrix** lists the nodes of one level as rows and columns, expandable along the hierarchy. Within a level, rows are in topological order, so that a Dependency of a row on an earlier row lies below the diagonal; whatever lies above the diagonal closes a Cycle. A cell holds the weight and opens the same list of Source File Dependencies as the edge in the graph. Graph and matrix are two views of one model and share filter and selection.

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

With the first Trace (part 7) one more arrives, reported on the ADR: **`affects` names a Component ID that does not exist.** Its Repair takes the item out of the list, where it stands, as the Repair for a Relation to a missing ADR does.

## 7. What is not in the repository (part 3)

The model, the Dependencies, the Cycles and the metrics are derived and never stored in the repository. The app caches, per Source File and keyed by the hash of its content, what was extracted from it (its uses, unresolved); resolution, graph and metrics are recomputed. The cache lives in the app's user-data folder, separately per repository and per version of the analysis. A command-line run computes everything afresh.
