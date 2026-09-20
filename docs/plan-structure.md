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
└── app/         # depends on all three
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

### Part 2 — Components

- `structure`: read `.arch/components.yml` (sections 1 and 6 of the specification): keys, Component IDs, patterns, who owns a file, Unassigned. Enumerate Source Files (section 2) — for now by extension only, without parsing. The Draft, from workspace packages, Maven modules, Gradle includes and directories. The Problems and the one Repair. Adopt, as a change set — into a new file, and into an existing one that declares nothing.
- Writing the declaration uses the same splice technique as the metadata writer; ADR-0002 applies to `.arch/components.yml`.
- ADR: the analysis never executes anything from the analysed repository.
- No UI yet beyond what the tests need; the app follows in part 3, so that the first thing seen is the graph and not a list of folders.

*Done when:* in `structure`'s tests, over a Node file system that only the tests have, this repository loads without a declaration and drafts `app`, `core`, `kernel` and `structure` with their directories below; fixtures report every Problem of the specification; adopting the Draft produces a file that reads back as the same Components.

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

1. **tree-sitter as WASM in three hosts.** Spike (a). The grammar's `.wasm` has to be found in a packaged Electron app and in an `npx` run alike.
2. **A synchronous resolver on an asynchronous port.** Spike (b).
3. **Globs.** A small matcher of our own for the subset the specification allows, or a library (`picomatch`). Decide in part 2; the subset is small and must behave the same on every platform.
4. **Layout with Cycles.** Decide in part 3 with a throwaway prototype, as the graph of M4 was.
5. **Off the main thread.** `worker_threads` in the main process or Electron's `utilityProcess`. Decide in part 3; the core does not notice. Spike (a) tries tree-sitter in both.

## Risks

- **Precision without a classpath.** Java metrics are a lower bound. The specification says so, and so does the UI wherever a Java metric is shown.
- **Large repositories.** Parsing file by file and caching per file keeps the work proportional to what changed. A first run over ten thousand files must not block the window — hence the worker — and should be measured in part 3 on a large open-source repository.
- **The Draft decides the first impression.** If it is poor, the graph is poor. Part 2 is tested against several real layouts (pnpm, npm workspaces, Maven multi-module, Gradle, a single-package repository).
- **Two glossaries in one code base.** `core` speaks Decisions, `structure` speaks Structure; the kernel speaks neither. Reviews check terms against the right glossary.
