# ADR Tool

A desktop application for browsing, writing and relating the Architecture Decision Records that live in a git repository. Working title; early development.

![ADR Tool showing a Decision Log: the list of ADRs with their Status, and one ADR with its Relations](docs/screenshots/m2-light.png)

## Documents

- [CONTEXT.md](CONTEXT.md) — the domain language. Code uses these terms.
- [docs/adr/](docs/adr/) — the decisions this project rests on, written in the tool's own format.
- [docs/plan.md](docs/plan.md) — milestones towards v1.
- [docs/roadmap.md](docs/roadmap.md) — what is in v1 and what comes after.
- [docs/vision.md](docs/vision.md) — where the project is heading: the ADR tool as the first module of an architect's suite. Its vocabulary is mapped in [CONTEXT-MAP.md](CONTEXT-MAP.md).
- [docs/plan-structure.md](docs/plan-structure.md) and [docs/structure-format.md](docs/structure-format.md) — the plan and the contract of the second module, Structure: Components, Dependencies, Cycles.

## Development

Requires Node 22.12 or newer and pnpm 11.

```bash
pnpm install
```

```bash
pnpm dev
```

The app reopens the repositories of the last run. To see every Status, Relations and a Problem at once, open the showcase Decision Log in `packages/core/test/fixtures/showcase`.

**Structure** is the second button in the header: it shows the Components of the repository in front and the Dependencies between them, a Draft as long as nothing is declared. To see a Cycle between two Components with its weakest Dependency, and one between two files, open `packages/structure/test/fixtures/shop` — with the whole path, since `pnpm dev` runs in `packages/app`:

```bash
ADR_TOOL_REPO="$PWD/packages/structure/test/fixtures/shop" pnpm dev
```

`packages/structure/test/fixtures/maven-shop` is the same for Java: a Maven project of three modules, one package spread over two of them.

![The Structure view of this repository: its packages, app selected with what it depends on](docs/screenshots/s3-structure.png)

Above the drawing, **Matrix** shows the same level as a dependency structure matrix — a row's numbers are its Dependencies on the columns, and what lies above the diagonal closes a Cycle; a Component's row expands into its parts — and **Metrics** as a table of size, coupling, instability, cohesion and internal share, each with its definition on the heading. A selected Component shows its page on the right.

![The metrics of this repository's packages, and the page of structure](docs/screenshots/s5-metrics.png)

A line number in the details opens the Source File in a read-only viewer, with the lines of the Dependency marked: from a line in the graph, two clicks lead to the import that causes it.

![The import of core in app's main process, opened from the line between app and core](docs/screenshots/s6-code.png)

Below a Component without children the levels go on through its directories, as deep as the folders do: each directory has its graph, its row in the matrix, its metrics and its page, down to the Source Files. The directories are the view's own — nothing declares them, and nothing writes them.

![The directory lib below the renderer, with its metrics and what uses it](docs/screenshots/s8-directories.png)

Once the Components are declared, an ADR names those it affects in its Metadata dialog — the first Trace from Decisions into Structure, kept on the ADR alone ([ADR-0009](docs/adr/0009-traces-are-recorded-on-the-source-only-unlike-back.md)). The ADR links to them, the page of a Component lists the ADRs that affect it, and **Rename** gives a Component a new segment, rewriting the declaration and every ADR that names it in one previewed change. This repository declares its Components in `.arch/components.yml`, its Draft adopted.

![Renaming structure: one line in the declaration, one in the ADR that affects it](docs/screenshots/s7-rename.png)

`pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and `pnpm build` are what CI runs, on Linux for now; Windows and macOS are switched off until distribution (see [roadmap.md](docs/roadmap.md)).

## Layout

- `packages/kernel` — what every module of the suite needs and none of them owns: the file-system port, splice edits and change sets ([ADR-0006](docs/adr/0006-one-core-package-per-module-on-a-shared-kernel.md)).
- `packages/core` — the domain core of the Decisions module in pure TypeScript. No Electron, no DOM, no disk access of its own; its type check fails if it reaches for any of them.
- `packages/structure` — the core of the Structure module, under the same guard: Components, Source Files and who owns them, the Draft, Adopt, Rename, the Dependencies and Cycles of TypeScript, JavaScript, Svelte and Java, the metrics and the dependency structure matrix ([structure-format.md](docs/structure-format.md)). Java is read with `tree-sitter-java` as WebAssembly, whose two `.wasm` files the caller hands in. It reads build files as text and never runs anything of the repository it looks at ([ADR-0007](docs/adr/0007-the-analysis-never-executes-anything-from-the-analysed.md)), and parses without a type checker ([ADR-0008](docs/adr/0008-dependencies-come-from-parsers-alone-without-a-type-checker.md)). Its entry `@adr-tool/structure/model` is everything but the parsers: that is what the app's main process and renderer use, while the analysis runs in a worker thread.
- `packages/app` — the Electron + Svelte 5 desktop app. The renderer is sandboxed and talks to the main process only through the preload bridge.

Prettier never formats Markdown in this repository, and the fixtures under `packages/core/test/fixtures` are exempt from git's line-ending normalization: the tool promises never to change a byte it was not asked to change ([ADR-0002](docs/adr/0002-never-reserialize-markdown.md)), and its own repository is its first test case.
