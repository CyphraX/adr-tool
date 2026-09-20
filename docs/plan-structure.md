# Implementation plan — Structure

How the second module of the suite gets built: Components, the code model, Dependencies, Cycles, metrics, the code viewer, and the first Trace. What the module is for is in [vision.md](vision.md); what it does, exactly, is in [structure-format.md](structure-format.md). Vocabulary follows the [Structure glossary](contexts/structure/CONTEXT.md). Agreed in the design session of 2026-09-20.

[plan.md](plan.md) is the plan of v1 of the Decisions module. It is complete and stays as the record of how that was built.

## Working mode

As in v1: one branch and one pull request per part, `main` stays green, CI on Windows, macOS and Linux, cores built test-first, new terms into the glossary the moment they are settled, hard-to-reverse decisions as ADRs — written in the app as `proposed`, accepted by the author.

Two things carry over from v1 in particular:

- **Something visible early.** Part 3 ends with the first slice in the running app, with a screenshot and how to run it. Java comes after it on purpose: this repository is TypeScript, and it is the first test case.
- **The riskiest pieces are proven first**, as the metadata writer was in M1. Here these are the two spikes of part 1.

## Packages

```
packages/
├── kernel/      # what every module needs: the file-system port, the in-memory file system, change sets
├── core/        # Decisions, as it is; depends on kernel
├── structure/   # pure TypeScript: no Electron, no DOM, no disk access of its own; depends on kernel
├── spikes/      # temporary, part 1: dissolves into structure with parts 3 and 4
└── app/         # depends on kernel, core and structure
```

`structure` works against the file-system port, like `core`. What it gets from git — the files git tracks, plus the untracked ones it does not ignore — comes in through a port as well; the app implements it on `main/git.ts`, tests on a list.

`structure` does not depend on `core`, and `core` not on `structure`. The one place they meet is the `affects` Trace of part 7. `core` reads and writes the key and plans its edits; `structure` knows the Components and plans the edits to the declaration; checking a Trace against the Components, and joining the two plans into the one change set of a Rename, is done by the caller — the app's main process, later the CLI — with a function of `kernel` that joins change sets. When a second kind of Trace exists, that checking moves into `kernel`; the kernel starts minimal and grows as modules need it.

## Parts

### Part 1 — Kernel, and two spikes

- Move `fs/port.ts`, `fs/memory.ts` and `change/change-set.ts` into `packages/kernel`, together with whatever they need and nothing else. `core` re-exports what its callers use, so the app does not change. No behaviour changes; the existing tests are the proof.
- Rename the internal `Draft` type of `core/src/lifecycle/draft.ts`. **Draft** is now a term of the Structure glossary, and one repository should not use the word for two things.
- **Spike (a):** load `web-tree-sitter` with the `tree-sitter-java` grammar as WASM — in Electron's main process, in a worker, and in plain Node, as the later CLI will. Parse a hostile Java file and read its package, imports and top-level types.
- **Spike (b):** `ts.resolveModuleName` with a `ModuleResolutionHost` on top of the file-system port. TypeScript's host is synchronous and the port is not; the expected answer is to load the directory listing and the few files resolution reads (`package.json`, `tsconfig.json`) beforehand. Resolve this repository's own imports, including `@adr-tool/core` from `app`.
- ADR: one core package per module on a shared kernel.

*Done when:* CI is green with the kernel in place; both spikes have a test in plain Node that runs on all three platforms; spike (a) has also been run by hand in Electron's main process and off the main thread, and what was found is written into this plan — or a fallback is. Fallbacks: for (a), the `java-parser` package (pure JavaScript); for (b), a resolver of our own for relative paths, `paths` aliases and workspace packages.

*Status (2026-09-20):* built. `packages/kernel` holds the port, the in-memory file system and change sets, with tests of its own; `Plan` is generic there, and `core` adds the created ADR and the renamed ID to it. The internal `Draft` of `core` is now `PendingFile`. Both spikes live in `packages/spikes`, a temporary package whose halves move into `structure` with parts 3 and 4. Neither fallback is needed. The decision is [ADR-0006](adr/0006-one-core-package-per-module-on-a-shared-kernel.md), created as `proposed` through `core`'s own operations and waiting for the author to accept it in the app.

What spike (b) found (`packages/spikes/src/ts-resolution.ts`):

- The gap between the asynchronous port and TypeScript's synchronous hosts closes with one walk of the repository that keeps its paths and the text of `package.json` and `tsconfig*.json`. What a configuration reaches for beyond that — an `extends` into `node_modules` — is noted as a miss, loaded, and the configuration is parsed again until nothing is missing.
- **`node_modules` is never walked, and need not exist.** Workspace packages are found by their `package.json` and offered to TypeScript under a `node_modules` directory that exists only for it. A fresh clone therefore resolves like an installed one, and a bare specifier that is no workspace package is a Library without any lookup.
- Proven on this repository: the solution-style `tsconfig.json` of `app`, `@adr-tool/core` from the renderer, `core` to `kernel`, `./App.svelte` as a path, the settings of `@electron-toolkit/tsconfig` through `extends`.
- TypeScript's matcher for `include` and `exclude` is not public; the spike carries a small one of its own. It is the same kind of matcher the Component patterns need (open decision 3).

What spike (a) found (`packages/spikes/src/java-outline.ts`, `packages/spikes/electron/`):

- `web-tree-sitter` 0.27 with the prebuilt `tree-sitter-java.wasm` that the grammar's npm package ships reads package, imports of every kind, top-level types and the simple names in type position from a file written to mislead regular expressions, and keeps what it can of a file with syntax errors.
- The code never touches the disk: the caller hands in the bytes of the two `.wasm` files (`Parser.init({ wasmBinary })`, `Language.load(bytes)`). That takes "where do the files lie in a packaged app" out of the analysis and leaves it to the app and the CLI, each of which knows its own layout.
- Run by hand in Electron 44.4 on Windows: the main process, a worker thread of the main process and a utility process all initialise and parse (3 ms for a small file in the main process). In plain Node the same runs in CI, worker thread included. Not run by hand on macOS and Linux; the CI test covers Node there.
- Two findings for part 4: an annotation names its type with a plain `identifier`, not a `type_identifier`; and the qualifier of a static access (`Totals.sum()`) is syntactically the same as a variable (`lines.size()`), so it is a candidate that only the symbol table confirms. The specification says so now.
- pnpm 11 refuses to install while a dependency's build script is undecided. The grammar's `node-gyp` build is switched off in `pnpm-workspace.yaml`; only its `.wasm` is used.
- An ESM entry point of Electron must not `await app.whenReady()` at the top level: `ready` is emitted only after the entry point has loaded, and the two wait for each other.

### Part 2 — Components

- `structure`: read `.arch/components.yml` (sections 1 and 6 of the specification): keys, Component IDs, patterns, who owns a file, Unassigned. Enumerate Source Files (section 2) — for now by extension only, without parsing. The Draft, from workspace packages, Maven modules, Gradle includes and directories. The Problems and the one Repair. Adopt, as a change set — into a new file, and into an existing one that declares nothing.
- Writing the declaration uses the same splice technique as the metadata writer; ADR-0002 applies to `.arch/components.yml`.
- ADR: the analysis never executes anything from the analysed repository.
- No UI yet beyond what the tests need; the app follows in part 3, so that the first thing seen is the graph and not a list of folders.

*Done when:* in `structure`'s tests, over a Node file system that only the tests have, this repository loads without a declaration and drafts `app`, `core`, `kernel` and `structure` (and `spikes`, as long as it exists) with their directories below; fixtures report every Problem of the specification; adopting the Draft produces a file that reads back as the same Components.

*Status (2026-09-20):* built. The done-when is `packages/structure/test/own-repository.test.ts`: this repository drafts as its five packages with the directories under their source roots, 154 Source Files of which one (`eslint.config.mjs`) is Unassigned, in 25 ms, and the adopted Draft reads back as the same Components. The decision is [ADR-0007](adr/0007-the-analysis-never-executes-anything-from-the-analysed.md), `proposed`.

- **The kernel grew once more**, as ADR-0006 foresaw: `TextEdit` with `applyEdits`, and `PendingFiles` with `plan()` and `Refusal`, moved in, because Structure writes `.arch/components.yml` the way Decisions writes ADRs. `PendingFiles` is generic over what a module's writers look at; `core` hands in its view of a file as frontmatter and body. The kernel's `plan()` knows only `Refusal`, and `core`'s `MetadataNotWritableError` is one now.
- **`structure` does not find out what a repository consists of.** That takes git or the disk. Its caller hands in the list of files; `structure` applies the extensions and never looks into `node_modules`, `.git` or `.arch`. The tests ask git the way the app will (`git ls-files --cached --others --exclude-standard`); the walk that honours `.gitignore`, for a folder without git, is the app's and comes with part 3.
- **Problems are a union of `structure`'s own** (`StructureProblem`), with their wording next to them, not a widening of `core`'s `Problem`. The shared Problems view of part 3 tells the modules apart.
- **The Draft, decided while building it** and now in the specification: units nest by the directories they lie in, whichever build file named them; where build files name units, directories beside them are not drafted; a repository without units drafts its directories as the top level, and as one Component where there is nothing to tell apart; a build file that cannot be read names no units.
- **What the suite writes into the declaration is little:** Adopt renders the Draft (flow lists, a `name` only where the segment departs from the directory's name) or splices it into a file that declares nothing, and the Repair takes one pattern out of a flow or block list, the key with the last one. A list written in a way that cannot be edited safely is refused, with the advice to use an editor.
- Fixtures are in memory; there is no fixture directory, so `.gitattributes` and `.prettierignore` did not change.
- **A review of the code against the specification is worked in** (`packages/structure/test/review.test.ts` pins each case down). It found three ways in which the writers could break ADR-0002: the Repair produced broken YAML for a Component written in braces, Adopt replaced Components that were declared after the Draft was shown, and adding under an empty `components` key lost the comments around it. The writers now check what they hand out — the text must read back as what was meant — and refuse where a splice cannot serve. Also from the review: segments are read as written (`007`), the `-2` rule counts up until a segment is free, a tag or anchor never moves to a neighbouring item, the pattern for Gradle's `include` is stricter, and `assign` asks a file only about the Components whose directory it lies in — 20,000 Source Files against 2,400 Components took 4 s and take a fraction of a second.
- Left open on purpose: `paths: *alias` makes the declaration unreadable although it is valid YAML; in a repository without units the Draft leaves `test/` beside `src/` Unassigned.

### Part 3 — TypeScript, JavaScript and Svelte; Cycles; the first slice

- `structure`: the adapter of section 3 — parse file by file, resolve with TypeScript's module resolution, Svelte's script blocks, type-only, Library uses recorded. Dependencies between Components with their weight (section 4). Cycles with example round trip and weakest Dependency.
- `app`: the **module switcher** — the navigation the first public release needs anyway. The Structure view: the Components of one level as a graph, Cycles marked, double click to go down, an edge opens the list of Source File Dependencies behind it. The Draft is marked as a proposal, with its hints, and can be adopted through the change-set preview that exists. The analysis runs off the main thread (open decision 5), and again when files change — the file watching of M2 is there; the per-file cache of section 7.
- The layered layout of M4 (`lib/graph-layout.ts`) is freed from the `Relation` type and reused. New: the members of a Cycle share a layer, and the edges that close it are drawn in red.
- ADR: parser strategy — TypeScript's resolver without a type checker, tree-sitter for Java, no JVM.

*Done when:* the app shows this repository's Components and the Dependencies between them, the Dependency from `app` to `core` lists the Source File Dependencies behind it — which needs the solution-style `tsconfig.json` of `app` and the `.svelte` imports to resolve as the specification says, and a fixture with a Cycle shows it with its weakest Dependency. Screenshot and how to run go to the author.

### Part 4 — Java

The adapter of section 3: symbol table per package, import kinds, the own package, the "not resolved" rule. Maven and Gradle layouts in the Draft are already there from part 2. Fixtures: a multi-module Maven project with a package spread over two modules, on-demand imports, a duplicate simple name.

*Done when:* a Java fixture repository shows its Dependencies, including those within a package, and the limits listed in the specification each have a test that pins the behaviour down.

### Part 5 — Metrics and the matrix

Section 5: size, Ce, Ca, instability, fan-in and fan-out, relational cohesion, internal share — each with its definition in a tooltip; tests off by default. The dependency structure matrix, sharing filter and selection with the graph. The **Component page**: ID, name, description, patterns, number of files, metrics, Dependencies in and out, the Cycles it is part of.

*Done when:* a test recomputes every metric of a fixture from its list of Dependencies, the app shows the same numbers for this repository as `structure` computes, and the matrix puts the Dependencies that close a fixture's Cycle above the diagonal.

### Part 6 — The code viewer

A read-only viewer on CodeMirror 6, which the app already carries: syntax highlighting for the languages of section 2, opened from a Source File Dependency at the line that causes it, and from the file list of a Component. Reading a file goes through the main process, as everything does; the renderer still never names a path. This is the viewer the Review module will later put Annotations into.

*Done when:* from an edge in the graph, two clicks lead to the import line.

### Part 7 — The first Trace: an ADR affects Components

- `core`: the Metadata key `affects`, a list of Component IDs, read and written like the other list-valued keys; edited in the Metadata dialog through a picker of Components.
- A Trace to a Component that does not exist is a **Problem**; its Repair takes the item out of `affects` (specification, section 6).
- **Rename** (specification, section 1) arrives here, where it first has something to rewrite: one previewed change set over the declaration and `affects` in every ADR. Until then a segment is changed by editing the file.
- The Component page lists the ADRs that affect it; an ADR lists its Components.
- The follow-ups recorded in the vision: **Metadata** in [CONTEXT.md](../CONTEXT.md) and the key in [file-format.md](file-format.md). This closes the roadmap's "ADR → code links".
- ADR: Traces are recorded on the source only, unlike Back-references.

*Done when:* an ADR of this repository is given its Components in the app, the Component page shows it, and renaming that Component changes exactly one line in the ADR.

## Open implementation decisions

1. **tree-sitter as WASM in three hosts.** Spike (a). **Verified (2026-09-20):** it runs in plain Node, in Electron's main process, in a worker thread and in a utility process, from bytes the caller hands in. What remains is packaging: electron-builder has to ship the two `.wasm` files outside the archive (`asarUnpack` or `extraResources`), and the CLI finds them with `import.meta.resolve`. That is decided with distribution.
2. **A synchronous resolver on an asynchronous port.** Spike (b). **Verified (2026-09-20):** one walk, a snapshot, and a parse-load-parse loop for what configurations reach for outside of it.
3. **Globs.** A small matcher of our own for the subset the specification allows, or a library (`picomatch`). Decide in part 2; the subset is small and must behave the same on every platform. **Decided (2026-09-20):** a matcher of our own (`packages/structure/src/patterns.ts`, 60 lines, a table of cases as its test). The subset is ours — no matching at any depth, a directory claims what is beneath it, `!` by the order of the list — and a library's defaults would have to be pinned against exactly these points. It has an exact mode for the globs of workspace files, and part 3 can use it for the `include` of a tsconfig, which TypeScript does not make public.
4. **Layout with Cycles.** Decide in part 3 with a throwaway prototype, as the graph of M4 was.
5. **Off the main thread.** `worker_threads` in the main process or Electron's `utilityProcess`. Decide in part 3; the core does not notice. Spike (a) ran tree-sitter in both, so the choice is open on its merits — isolation against start-up cost and message passing — and not on feasibility.

## Risks

- **A repository's own resolution settings are honoured, also where they cost Dependencies.** Under `moduleResolution: node10` TypeScript ignores `exports`, so a workspace package that has nothing else is not resolved. That is the repository's choice; the suite reports such uses as not resolved and does not second-guess the configuration.
- **Precision without a classpath.** Java metrics are a lower bound. The specification says so, and so does the UI wherever a Java metric is shown.
- **Large repositories.** Parsing file by file and caching per file keeps the work proportional to what changed. A first run over ten thousand files must not block the window — hence the worker — and should be measured in part 3 on a large open-source repository.
- **The Draft decides the first impression.** If it is poor, the graph is poor. Part 2 is tested against several real layouts (pnpm, npm workspaces, Maven multi-module, Gradle, a single-package repository).
- **Two glossaries in one code base.** `core` speaks Decisions, `structure` speaks Structure; the kernel speaks neither. Reviews check terms against the right glossary.
