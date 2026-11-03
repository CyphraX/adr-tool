# Implementation plan — the modules of the vision

How the rest of [vision.md](vision.md) gets built: the four modules after Decisions and Structure — Conformance, Diagrams, Review, Assessment —, the Next and Later tiers of every module, Documentation, and the System across repositories. Vocabulary follows [CONTEXT-MAP.md](../CONTEXT-MAP.md) and the glossaries it points to; who each part is for follows [personas.md](personas.md); how the window looks follows [design.md](design.md). Agreed with the author on 2026-11-02.

[plan.md](plan.md) is the record of v1 of Decisions, [plan-structure.md](plan-structure.md) that of Structure, [plan-roadmap.md](plan-roadmap.md) that of the roadmap after v1; all three are complete. This plan is the vision's "Order after ADR v1" from its third step on.

## Decided by the author

On 2026-11-02, before this plan was written:

- **The whole vision is built**: every module, with its Core, Next and Later tiers, and what [vision.md](vision.md) lists across all modules. What the vision marks **Out** stays out.
- **One person in every role.** Whoever builds this plan is its product owner, its stakeholder, its designer, its developer, its tester and its reviewer — the reviewer of a part being someone other than who wrote it. The [personas](personas.md) stand in for the users: a part is done when its persona's scenario works in the running app.
- **Still deferred**, as in [plan-roadmap.md](plan-roadmap.md): distribution, Windows and macOS in CI, and the check of the name for clashes. A run on a Mac and on Windows stays with the author.
- **Working mode:** one branch and one pull request per part, as before. The author does not review them: each pull request is reviewed independently of the one who wrote it, its findings are fixed, and it is merged once CI is green.

Decided for this plan, departing from the vision's "Order after ADR v1": a module's Next tier is built with its module where it completes what the module's persona needs — the Baseline with the Patterns of Conformance (part 5), replies with Annotations (part 8), the utility tree, the reports, trends and comparison with Assessment (parts 11 and 12) —, and the declared licences of Libraries with their inventory (part 15). The rest of the Next tiers follows the four modules, as the vision has it.

## Working mode

As in [plan-roadmap.md](plan-roadmap.md#working-mode), and for every part in this order:

1. **Product owner:** the part's scope and its *done when*, here, against a persona's scenario.
2. **Designer:** where the part sits in the frame of [design.md](design.md) — which module, which pane, which view —, written into the part's status with the first screenshot.
3. **Contract first:** a module's file format is written before its code, in a document of its own (`conformance-format.md`, `diagrams-format.md`, …), and its terms go into its glossary the moment they are settled. A hard-to-reverse decision gets an ADR.
4. **Developer:** the module's core package, test-first, pure TypeScript on the kernel's file-system port ([ADR-0006](adr/0006-one-core-package-per-module-on-a-shared-kernel.md)); then the app; then the module's tools in the MCP server and its words in German.
5. **Tester:** the *done when* in the running app, in English and German, with screenshots; the tests of the core; and a reading of everything the part writes against [ADR-0002](adr/0002-never-reserialize-markdown.md) — nothing outside what was asked changes by a byte.
6. **Reviewer:** an independent review of the pull request; its findings are fixed, or answered in the part's status.

Five things grow with every module — and with every part of Structure — rather than in a part of their own, as [vision.md](vision.md) has it "across all modules" and in "The spine":

- **The Component page** gets a section for what the module hangs on a Component.
- **The Problems of the repository** — one view for every module ([part 2](#part-2--the-frame-for-many-modules)) — get the module's Problems, each with its Repair where it has one.
- **Search** finds the module's artefacts.
- **The MCP server** reads the module's artefacts as data and plans its writes as previewed changes ([ADR-0013](adr/0013-agents-write-adrs-through-the-mcp-server-as-previewed-change.md)); `adr check` checks what the module can check.
- **Rename** of a Component rewrites what the module stores about it — a Rule, an Exception, a Diagram, a Finding — in the one change set of the Rename, as it rewrites the ADRs that name it since part 7 of Structure.

## Parts

The order is the vision's, with the departures decided above: Conformance first, since it carries the suite into teams; then Diagrams, Review and Assessment, each needing what came before as its source of evidence; then the Next tiers; then Later. Within a module, the core and its format come before the window.

### Part 1 — The plan, the personas, the design

- This plan, [personas.md](personas.md) and [design.md](design.md).
- [vision.md](vision.md) points to this plan from its "Order after ADR v1".

*Done when:* the three documents are merged, and every later part can name its persona and the place in the frame it fills.

### Part 2 — The frame for many modules

For Lena and Aylin. What a window with six modules needs before the third one arrives, and what the vision lists under Decisions' Core that is still missing.

- **The module switcher** takes a module per part from part 4 on, and remembers per tab the view of each module.
- **The Problems of the repository**: one view, reached from every module's sidebar, that lists every Problem the suite knows — of each Decision Log, of the declaration of Components, of every Trace — grouped by module, each opening its artefact in its module, with its Repair. The count stands in every module's sidebar. It replaces nothing: the Problems of a Decision Log stay where they are.
- **Search across artefacts**: the search finds Components by ID and name, and Source Files by path, beside ADRs; a hit opens it in its module.
- **Mermaid in the ADR preview**: a `mermaid` code block is drawn as a diagram in the preview, the live mode and the app's export. The export keeps writing through the one code of `adr export` and the app ([ADR-0014](adr/0014-the-export-is-static-html-from-core-printed-to-pdf-by.md)): it takes the drawn diagrams as an input, which the app passes and `adr export`, without a browser, does not — there the block stays code. ADRs are untrusted input: Mermaid runs at its strictest security level, its SVG is sanitized, and a block that does not parse stays code with its error beside it.

*Done when:* on this repository, a Trace of an ADR to a Component that does not exist and a broken Relation stand in one list of Problems, each opening in its module; "kernel" finds the Component and its Source Files; an ADR with a flowchart shows it drawn, and a broken one shows its error.

*Status (2026-11-02):* built.

- **The module switcher** is made from a list (`packages/app/src/renderer/src/lib/modules.ts`), as are the frames of the modules in `App.svelte` (`FRAMES`). A module joins with one entry there, its name in `strings.*.ts`, its frame, and its section of the Problems of the repository. A tab already kept the view of Decisions and that of Structure apart, so nothing was added for that.
- **The Problems of the repository** are put together by `repositoryProblems` (`lib/repository-problems.ts`) from what the window holds, in three sections:
  - each Decision Log's Problems, by log, each root cause once with the Repairs `core` offers;
  - every Trace to a Component that is not declared, set apart and listed once;
  - the Problems of the declaration.
  
  The last come from a new request, `structureOutline` (`main/structures.ts`), which answers from the analysis that Structure keeps for the repository with every Component, Source File, Problem and hint. `RepositoryProblems.svelte` stands in the middle of Decisions and of Structure, and both sidebars hold the row **Repository Problems** with its red count. While Structure analyses, the count carries a "…" and the list says the section follows. On a Draft, what the checks find are hints, with no Repair. A Repair goes through the preview that already exists for it, and the Problems view of a log stays (`packages/app/test/repository-problems.test.ts`).
- **The search** gained `searchComponents` and `searchSourceFiles` (`lib/search.ts`). Every word has to match: the ID or name of a Component, or the path of a Source File, where the file name counts most. Case and accents are ignored, as for ADRs (`packages/app/test/search-artefacts.test.ts`). The palette lists ADRs as before, with the same ranking and at most 12. Below them come at most 6 Components and 8 Source Files, each section under its heading and each hit named by its kind in words, all in one list for the keyboard. While Structure analyses, the palette says whether it searches the last analysis or nothing yet.
- **Mermaid** is [ADR-0016](adr/0016-mermaid-is-drawn-in-the-renderer-and-exported-as-an-image.md), which amends ADR-0014.
  - The code: `lib/mermaid.ts` is pure (configuration, addresses, Mermaid's sentence, a cache of drawings). `lib/sanitize.ts` runs DOMPurify and then reads the drawing's CSS with the browser's own parser. `shared/drawing.ts` is the allowlist of a drawing's markup, which the window and main both hold it against. `lib/diagrams.ts` loads Mermaid and DOMPurify lazily and draws one block at a time, only while it is shown.
  - Where blocks are drawn: `MarkdownDocument.svelte` replaces a block with its drawing and puts its source below it, in the reading view and the preview. In the live mode a block is a widget while the cursor is outside it (`liveDiagrams`, `lib/editor.ts`).
  - The export: `ExportOptions.diagrams` in `core` and `ExportRequest.diagrams` in `packages/cli/src/export.ts` carry the drawings, and `mermaidSources` finds the blocks. The app draws every block light and passes the drawings in, and main checks each one again (`diagramsRequest`).
  - Tests: `packages/core/test/export.test.ts`, and in `packages/app/test/` `mermaid.test.ts`, `drawing.test.ts`, `requests.test.ts`, `live.test.ts`, and `sanitize.test.ts` and `diagrams.test.ts` in jsdom 30.1.3, a dev dependency of the app only. jsdom's CSS parser is not Chrome's: it drops `u\72l(…)` where Chrome decodes it to a `url()`. So the backslash is refused either way, and the escapes are also tried in the running app.

In the running app, in English and in German, on a copy of this repository set up as follows:

- `plugins` added to `affects` of ADR 0006;
- `depends-on: [0099-a-decision-that-is-gone]` added to ADR 0012;
- a pattern `packages/gone/**` added to `cli`;
- an ADR 0016 with a flowchart, and an ADR 0017 whose block does not parse;
- after the review, an ADR 0018 with the review's hostile blocks: `style`, `classDef`, `%%{init}%%` and frontmatter `config:` that hide `url()` behind the escape `u\72l(`, in flowcharts and class, state, ER and block diagrams, each with a beacon on `127.0.0.1`.

What the app showed:

- Both sidebars say "Repository Problems 3". The list holds the broken Relation under Decisions, the Trace under Traces, and the pattern that matches nothing under Structure.
- 0012 opens in Decisions with the list beside it, and `cli` opens its page in Structure.
- The Repair of the Trace previews "Remove plugins from affects" on one file, and Cancel writes nothing.
- "kernel" finds ADRs 0006, 0009 and 0015, then the Components `kernel`, `kernel/change`, `kernel/fs` and `kernel/text`, then the best 8 of 10 Source Files under `packages/kernel/`. A Component opens on its page, and "kernel change-set" opens `packages/kernel/src/change/change-set.ts` in the code viewer.
- ADR 0016 shows the flowchart drawn in the reading view and the live mode, with no script, `foreignObject` or handler in it. "Mermaid source" below it opens its source in both, and the live block stays drawn. With the cursor in the block, its source shows.
- ADR 0017 keeps its code, with "This Mermaid diagram cannot be drawn. Mermaid says: Parse error on line 2: Expecting 'SQE', 'DOUBLECIRCLEEND', 'PE', '-)', …, got 'PS'" beside it.
- **Export → Web pages…** wrote 19 pages and one drawing, `docs/adr/0016-….diagram-1.svg`. No page holds a script, and the content security policy is ADR-0014's. The page of 0016, opened from disk, shows the drawing, and 0017's block stays code. After the review, the drawing is 657 × 191, the size of its view box, in the export's fonts.
- ADR 0018 draws 9 of its 10 blocks with nothing of the beacon in them. The ER diagram is refused by Mermaid itself ("Lexical error on line 3"). The export writes 9 drawings, none naming the beacon or holding a backslash. Opened on their own, they fetch nothing, and nothing reached the beacon. While Mermaid measured the blocks, the window's content security policy blocked their loads.
- The copy changed only as it was set up.

What changed on the way:

- The app takes `mermaidSources` from `core`'s index, as it takes all of `core`.
- The sidebar row is "Repository Problems", since "Problems of the repository" did not fit.
- A drawing is a "Mermaid diagram": Diagram is the Diagrams module's term.

What the review of PR #49 changed:

- CSS escapes got past the scrubbing of the CSS as text. The CSS is now read by the browser's parser (`CSSStyleSheet.replaceSync` for a style sheet, `element.style` for a style attribute), and what is left with a backslash is refused. The `secure` keys gained `theme`, `themeCSS`, `themeVariables`, `fontFamily`, `altFontFamily` and `layout`, among others.
- Main's check of a drawing was a list of words; it is the allowlist of `shared/drawing.ts`, on the markup and never on a label.
- Analysis on demand, as the PO decided: a repository coming to the front is analysed once in the background, with no watcher. The watcher starts once Structure is opened. A repository analysed only for the count is analysed again when its Problems view or the search opens. The repository in front goes first, and an analysis nobody waits for any more is dropped. The count says it is "as of" the last analysis.
- A block no longer shown when its turn comes is not drawn. The preview beside the editor draws once the typing pauses. What failed for a block no longer shown is not kept, nor what failed for reasons other than the block. An open source stays open as the document is set again.
- The export asks where it goes first, then draws. Main keeps the place and gives the window a ticket. A block that Mermaid takes more than 15 seconds over stays code.
- An exported drawing has the size of its view box, so `<img>` does not stretch it, and it uses the export's fonts. It is named by its `accTitle` and `accDescr`. `style.css` gets the rules for drawings only when there are drawings, so an export without any is unchanged byte for byte.
- A link in a drawing opens from the reading view (`xlink:href`). The live block follows the window's theme, and the roles of a drawing are kept for screen readers.
- **Repository Problems** stands in Structure's sidebar always, also before a view exists and in a repository without a Decision Log.
- The outlines are kept out of Svelte's deep proxy, so searching 50,000 Source Files is not slowed down by it.

What remains:

- The search finds the Components and Source Files of the repository in front only. It finds ADRs, as before, in every repository that is open.
- To count the Problems of the declaration, a repository is analysed once when it comes to the front, in the worker, without following changes on disk. Until Structure is opened, the count can be older than the files; it says when it was counted.
- What Mermaid says is in English, in a German window too.
- A drawing in the export is always light. `adr export` does not draw.
- Structure's catch-up with [design.md](design.md) is part 4's.

### Part 3 — Conformance: Rules, Violations and `adr check`

For Lena and Jonas. The core of the third module, without a window yet: [conformance-format.md](conformance-format.md), written first, and `packages/conformance`.

- **Rules** in `.arch/rules.yml`, edited by hand or by an agent: which Components may or must not depend on which, by Component ID with patterns (`ui/**`); ordered layers, strict or relaxed; no Cycles, among the Components of a level or inside one; thresholds on metrics of Structure. Each Rule has an ID and a sentence that says why.
- **Violations**, derived from Structure's Dependencies and metrics and never stored, each with the Source File Dependencies behind it and a stable fingerprint without line numbers ([vision.md](vision.md), Conformance), defined per kind of Rule: the Rule with its source and target Component for a Rule on Dependencies, with the members of the Cycle for a Rule against Cycles, with the Component for a threshold.
- A Rule that names a Component ID that does not exist is a Problem, and a Rename of a Component plans the edits of the Rules file that go with it.
- **Exceptions** next to the Rules, by fingerprint, each with a reason and optionally a Trace to the ADR that justifies it; an Exception that matches no Violation, or whose ADR does not exist, is a Problem.
- **`adr check`**: `adr lint`, and the Rules against the code, in one run; text, JSON and GitHub annotations at the line of the import that causes a Violation; it fails on a Violation that has no Exception. [cli.md](cli.md) documents it.
- An ADR records the shape of the file and the fingerprint of each kind of Rule.

*Done when:* on this repository, a Rule that `kernel` depends on nothing, one that `core` and `structure` do not depend on each other, and a layering of `app` over the cores hold; a Rule broken on purpose in a fixture fails `adr check` with the file and line of the import, and an Exception for it makes it pass.

*Status (2026-11-02):* built. The contract is [conformance-format.md](conformance-format.md), written first, and the decision [ADR-0017](adr/0017-rules-and-exceptions-share-one-file-keyed-by-fingerprint.md): Rules, Exceptions and applied Patterns share `.arch/rules.yml`; every Rule has an `id`, a `why` and an explicit `kind` — `must-not-depend`, `may-only-depend`, `layers` (relaxed or strict), `no-cycles` (`among` or `inside`) and `threshold` on the metrics of Structure, with `tests` and `type-only` as options; Components are named by ID, with `*` within a segment and `**` as a whole one. A Dependency between Source Files stands for the outermost Components below their common ancestor that a Rule names. The fingerprint is per kind: the Rule with its source and target Component, with the members of the Cycle, or with the Component — never a line or a hash, so an Exception keeps matching when the import moves. An Exception names it in keys, with `reason` and an optional `justified-by`; fourteen Problem codes cover the file, among them a Component ID that is not declared, an Exception that matches nothing and an ADR that is not there, and one note, which fails nothing. `packages/conformance` stands on `kernel` and Structure's model alone, under the cores' guard (`.arch/rules.yml` of this repository says so too, and [ADR-0006](adr/0006-one-core-package-per-module-on-a-shared-kernel.md), still proposed, now allows a core to depend on Structure's model): `readRules`, `evaluate`, `checkConformance` with the Violations and the Problems, each said as a code with an English sentence (`src/sentences.ts`), and `planRenameInRules`, which plans the edits a Rename of a Component makes to the file as a change set — each ID where it stands, quoting kept — and refuses a file it cannot read, one that names a Component through a YAML alias, and one it cannot read back; the app's Rename joins it to the declaration and the ADRs in one change set (`packages/app/src/main/traces.ts`). Applied Patterns are read and checked for their form and Component IDs; their Rules are part 5's. Rules are evaluated only against a declaration: on a Draft they are the Problem `rules-without-declaration`. 59 tests in `packages/conformance/test`: every kind, patterns, strict and relaxed layers, Cycles of both scopes, thresholds above and below, the fingerprint when lines move, Exceptions that match, match nothing or name a missing ADR, every Problem of the file, Rename, and the fixture `layered-shop`, broken on purpose by one import. `adr check` (`packages/cli/src/check.ts`, [cli.md](cli.md)) runs what `adr lint` runs, the Problems of `.arch/components.yml` and the Rules, lists the files as the app does — git with its guards, or a walk that honours `.gitignore` (`src/listing.ts`) — and parses only when a Rule needs the code; it prints text, JSON and `::error` annotations at the line of each import, with the Rule's ID as title and its `why` in the message, and fails on a Problem or on a Violation without an Exception; `adr lint` is unchanged. To read TypeScript and Java the command now carries the TypeScript compiler and tree-sitter, the WebAssembly as base64: still one file, about 12 MB, which `adr lint` now takes 0.37 s to start. 19 tests in `packages/cli/test/check.test.ts` cover the three formats, Exceptions, the Problems, the note and Java, and 8 in `listing.test.ts` the listing with its guards — a `core.fsmonitor` the repository configures does not run. CI runs `adr check --format github` in place of `adr lint`, so that a Problem of the log does not hide a Violation. In the terminal: this repository prints "5 Rules hold." in 1.1 s — `kernel` depends on nothing, `core` and `structure` stay apart, `conformance` stands on `kernel` and `structure`, the layers run from `app` over `cli` and `mcp`, `conformance`, the two cores to `kernel`, and no Cycle joins the packages. In a clone with `import type { Repository } from '@adr-tool/core'` in `packages/structure/src/model.ts` it fails at that file and line, with the Rule's reason; an Exception justified by ADR-0009 makes it pass, and still does with lines inserted above the import; naming `docs/adr/0099-never-written` instead is a Problem at its line in `.arch/rules.yml`; with the import gone the Exception is a Problem too. On a copy of the fixture `maven-shop` the Rules are a Problem until the Components are declared; then a strict layering and `no-cycles` inside `cart` find `Page.java:4`, `Cart.java:8` and `Line.java:6`. The command copied to an empty directory does the same, Java included. The review of the part changed six things: a key written twice in the file — a second `rules:`, `to:` twice — is a Problem instead of a Rule left unchecked; a Cycle has every Dependency among its members behind it, so each import on it is annotated, the one that closed it included, and the weakest one is a hint in the sentence; an Exception of a Cycle accepts the Cycles inside it, with the note `exception-can-shrink`, while a Cycle that grew fails; Structure marks the lines of a Dependency whose every use is type-only, and a Rule with `type-only: ignored` points at none of them; the fingerprint carries its kind; and `justified-by` with a web address is the Problem `invalid-justification`. On the reviewer's probes the command now fails on the doubled `to:`, puts a Cycle of `a` and `b` at all three of its imports, passes a Cycle that shrank under its Exception with the note, and points at line 3 only where line 2 is `import type`. Open: the window and the tools of the MCP server are part 4, and with the window the German of Conformance's codes; a Problem of `.arch/components.yml` has a line only where the file is not YAML; `src/listing.ts` repeats the app's walk and git guards, which could move to a package both use.

### Part 4 — Conformance in the app

For Lena. The module in the window, with its tools for the agent.

- **Conformance** in the module switcher: the sidebar lists the Rules with the count of their Violations; the centre is the list of Violations, or Structure's Dependency graph with the Violations in red; the detail of a Violation names its Rule, its Source File Dependencies — each line a click into the code viewer —, and offers **Accept as Exception**; that of a Rule says what it says and where it is written.
- **Writing Rules in the window**: a form to add, change and remove a Rule, written into `.arch/rules.yml` as a previewed change that touches its lines only; a file it cannot write without rewriting more, it refuses with a sentence.
- **Exceptions** with their reason and the ADR they cite, a click away; the Problems of part 3 in the repository's list, with their Repairs.
- **The Component page** lists the Rules that name the Component and its Violations; **an ADR** lists the Exceptions it justifies.
- **Structure's graph catches up with [design.md](design.md)**, since the Violations are drawn on it: a list beside it that a screen reader reads out, its boxes in reading order, and a divider between its panes.
- **MCP**: Structure's Dependencies, Cycles and metrics as data, beside `list_components`; list the Rules, list the Violations — also of a planned import, before it is written —, plan a Rule, plan an Exception.

*Done when:* Lena's scenario of [personas.md](personas.md) works on a copy of this repository with an import from `core` into `structure` added: the Rule is written in the window, the Violation shows in the list and on the graph, opens the import line, is accepted as an Exception that cites an ADR, and `adr check` passes; a Rename of `structure` rewrites the Rule and the Exception in its preview; the agent's scenario through the MCP server sees the Rule before it writes code.

### Part 5 — Patterns and the Baseline

For Lena and Jonas, on a repository that was not built to its rules.

- **Patterns**: layered, hexagonal, clean architecture and modular monolith, each a set of Rules written in roles. Applying one writes the applied Pattern — its name and which Components fill which role — into the Rules file, as a previewed change; the Rules it stands for are derived from it, listed with the others, each saying which Pattern and role it comes from.
- **The Baseline**: the fingerprints of today's Violations, each with the pairs of Source Files behind it, recorded in `.arch/baseline.yml` as a previewed change; `adr check` fails only on a Violation, or a pair of Source Files of one, that is in neither the Baseline nor an Exception, and says how many the Baseline still holds. A Violation of the Baseline that is gone is reported, so that the Baseline shrinks.

- The heading "Patterns" of the Component page, which lists its path patterns, becomes "Path patterns", so that a Pattern has one meaning.

*Done when:* the hexagonal Pattern applied to a fixture of ports and adapters writes the applied Pattern, a Baseline taken of its three Violations lets `adr check` pass, a fourth Violation fails it with only that one named, a second import between two files of an existing Violation fails it as well, and fixing one of the three says the Baseline can shrink.

### Part 6 — Diagrams: the model, Drift and SVG

For Lena and Priya. The core of the fourth module: [diagrams-format.md](diagrams-format.md), written first, and `packages/diagrams`.

- **A Diagram** is a diffable text file under `docs/architecture/diagrams/` (configurable): its elements — Components by ID, External Systems as plain boxes with a name and a description —, the connections between them with a label, and the position of each box, which is the layout and is kept as written. Its view level follows C4 — system context, container, component — as a depth of the Component hierarchy.
- **Suggested connections** from Structure's real Dependencies between the shown Components.
- **Drift**, derived and never stored: a connection the code does not have, a Dependency between shown Components that the Diagram leaves out. An element whose Component is gone is a Problem, with its Repair.
- **SVG** drawn by the core, without a browser: the export written beside the Diagram as a previewed change, so that GitHub shows the picture and an ADR can embed it.
- An ADR records the file format, and that the SVG beside a Diagram is derived data that is committed on purpose.

*Done when:* a Diagram of this repository's packages, written by hand in the format, draws to SVG, suggests the connections the code has, reports a connection added on purpose as Drift, and reports an element with a removed Component as a Problem.

*Status (2026-11-03):* the core is built; the window is part 7, so there is no screenshot yet. The contract is [diagrams-format.md](diagrams-format.md), written first, its terms are in the [glossary](contexts/diagrams/CONTEXT.md), and the decision is [ADR-0018](adr/0018-a-diagram-is-a-yaml-file-and-its-svg-is-committed-beside-it.md): a Diagram is `<ID>.yml` directly in `docs/architecture/diagrams/` — `diagrams` in `.arch/config.yml` moves it, a file of settings that every module shares, each with a key of its own ([configuration.md](configuration.md)), and that the kernel reads (`readConfig`, `openConfig`) —, with a `title`, a `description`, a `level` and the `scope` of a component view, `elements` — a Component by ID, an External System, or the repository in a system context, each `at: [x, y]` with an optional `size` — and `connections` with `from`, `to` and `label`. `packages/diagrams` stands on `kernel` and `@adr-tool/structure/model` alone, under the cores' guard: `openDiagrams` lists and reads them, with fifteen Problem codes, each said as a code with an English sentence and in German in the window's `said.de.ts`; `suggestConnections` counts a Source File for the deepest shown Component that contains it, without test files unless asked; `driftOf` says a connection the code does not have and a Dependency the Diagram leaves out, only against a declaration; `planRepair` takes out an element whose Component is gone, with its connections, by its lines alone; `drawDiagram` draws the SVG — deterministic, without a script or anything fetched, light and dark, without Drift —, and `planExport` writes it as `<ID>.svg` beside the Diagram as a change set that is empty while the picture is current. 58 tests in `packages/diagrams/test`, on the fixture `shop` — a container view with a gone Component, a connection on purpose and a Dependency left out, a component view and a system context — and on this repository: [docs/architecture/diagrams/packages.yml](architecture/diagrams/packages.yml), written by hand, draws to the `packages.svg` beside it, its sixteen suggested connections are all drawn, a connection from `kernel` to `core` is Drift, and without `mcp` in the declaration the element on line 18 is a Problem whose Repair takes out its lines and those of its three connections (`test/own-repository.test.ts`; `pnpm --filter @adr-tool/diagrams export-own` draws the picture again). The review of the part changed seven things: in a component view the scope's own Source Files — `packages/core/src/index.ts`, say — count for the scope, so a connection from outside to a part that the code reaches through them is not Drift, and a Dependency through them that the Diagram leaves out is `scope-dependency-not-in-diagram`; a connection the code does not have is only perhaps not in it, `connection-perhaps-not-in-code` with the counts, while Structure could not resolve imports or read files; a key the suite owns written twice is `unreadable-diagram` with the detail `key-twice`; a position or a size beyond 1 000 000 is a Problem; the export is refused while the declaration cannot be read, `no-export-without-declaration`, and on a Draft the picture shows the IDs; `.arch/config.yml` is read by the kernel, which says its one Problem `unreadable-config` once for every module, and ADR-0018 records the file with a key per module and now depends on ADR-0006; and a test holds the package to the kernel, Structure's model and `yaml` among its imports. The Diagram of this repository now shows `conformance`, and `.arch/rules.yml` holds `diagrams` to `kernel` and `structure`, beside `conformance` in the layers: `adr check` prints "6 Rules hold.", and fails at the line of an import of `@adr-tool/core` added to `packages/diagrams/src/svg.ts`. Open: the window, the tools of the MCP server, Rename in a Diagram and the placing of a new Diagram, which are part 7's, and a check — in `adr check`, say — that the committed picture is current.

### Part 7 — Diagrams in the app

For Lena. The editor.

- **Diagrams** in the module switcher: the sidebar lists the Diagrams with their Drift; the centre is the canvas; the detail is the selected element or connection.
- **The canvas**: add Components of a level and External Systems; drag boxes; accept a suggested connection, or draw one; label it. What is changed on the canvas is held in the window until **Save**, which previews it as the change of the lines it touches, as the editor of an ADR does; leaving with changes that are not saved asks first.
- **Drift** in the Diagram — red for a connection the code does not have, dashed red for one it has and the Diagram leaves out — and in a list beside it; **Export SVG** writes the picture beside the file.
- **A new Diagram** starts from a level of the Component hierarchy, with its Components placed in Structure's layout and the suggested connections drawn.
- **The Component page** lists the Diagrams that show it; **MCP** reads a Diagram as data and its Drift, and plans changes to it.

*Done when:* Lena draws the container view of this repository from its Components, with GitHub and the file system as External Systems, saves it through its preview, exports it as SVG, embeds the SVG in an ADR whose preview shows it, adds a Dependency in the code and sees the Diagram's Drift; a Rename of a Component it shows rewrites the Diagram in the preview of the Rename.

*Status (2026-11-03):* built. **Where it sits:** Diagrams is the module switcher's word after Structure. Its sidebar has Repository Problems under *Check*, then the Diagrams, each with the count of its Drift as a red badge and a dot while it has changes that are not saved, where they are kept, and **New Diagram**. The centre is the canvas: the title, then **Add Component**, **Add External System**, **Undo**, **Export SVG** and **Save**, the one primary button. Between the canvas and the detail, *What the Diagram says* lists every box and connection as a sentence, a button the keyboard reaches in reading order, with the Drift below them. At the foot, a line says how the canvas is used, above the legend. The detail is the selected element, its connections and its Drift, or the selected connection, or the Diagram with its Problems and their Repairs ([design.md](design.md), which now says how a Diagram is laid out and what its red and dashes mean). Screenshots of Lena's scenario: `docs/screenshots/vision-7-save.png`, `vision-7-adr.png`, `vision-7-problem.png`, and in German `vision-7-drift-de.png` and `vision-7-rename-de.png`; the README has `readme/diagrams.png`.

**In the running app**, on a clone of this repository, in English and in German (Playwright on Electron), Lena:

1. starts *The containers of Softarch Suite* from the container level: nine Components and their 25 connections, placed as Structure lays them out, previewed as one new file;
2. adds GitHub and the file system as External Systems, which land at the first free spot on the grid and are brought into view;
3. drags them, connects `cli` to GitHub and `kernel` to the file system, and labels one on the canvas and the other in the detail;
4. saves through the preview, which holds those eight changes as the lines of the two new boxes, where they were dragged to, and of the two connections;
5. exports `containers.svg` and embeds it in a new ADR, whose reading view shows the picture at the width of the page;
6. adds `export { DIAGRAMS_KEY } from '../../diagrams/src/location'` to `packages/kernel/src/index.ts`, after which both Diagrams show `kernel` depending on `diagrams` as Drift, dotted on the canvas, with **Draw it**;
7. renames `cli` to `command-line` in Structure: the preview holds 8 files, among them `containers.yml` and `packages.yml` with only their ID lines changed, and both pictures drawn again;
8. moves a box and saves. Repository Problems then has the stale picture, with **Export the picture again** / **Das Bild neu exportieren**;
9. finds the Diagram with <kbd>Ctrl</kbd> <kbd>K</kbd>.

**The core grew** (`packages/diagrams`, 58 tests then 94):

- `planDiagramEdit` makes the seven edits the window holds until **Save** — move, add, remove and describe an element; add, remove and label a connection — each as a splice of the lines it is about, read back and compared before it is planned. It refuses what it cannot write line by line, such as a position over several lines, an element in a flow list, or a label as a block. `spliceBetween` turns the result into one edit.
- `planNewDiagram` and `newDiagramText` write a new Diagram, and `readEdits` and `readNewDiagram` read what the window or an agent hands in, field by field, with limits.
- `planRenameInDiagrams` rewrites `component`, `from`, `to` and `scope` where they name the Component, quoting kept. It warns of a Diagram it cannot read, and draws again every picture that was current, against the declaration as the Rename leaves it.
- `checkPicture` is the Problem `stale-picture`, whose Repair is `planExport`.

The window holds no text of its own: the German is in `strings.diagrams.de.ts` and `said.de.ts`. The app has 30 new tests (`diagram-canvas`, `diagram-overview`, `diagram-requests`), and `traces.test.ts` checks the Rename of this repository with its picture.

**What grows:**

- *The Component page* lists the Diagrams that show it (`ComponentDiagrams.svelte`).
- *Repository Problems* has a Diagrams section, with Repairs named by what they do.
- *Search* finds a Diagram by title and ID.
- *MCP:* six tools, each a plan until `apply_change` (`packages/mcp/src/diagrams.ts`, 7 tests): `list_diagrams`, and `read_diagram`, which reads the code as `adr check` does and answers the Drift, the suggestions and the Problems with their Repair. Then `plan_new_diagram`, `plan_diagram_change` (which says when the picture is left behind), `plan_diagram_export` and `plan_diagram_repair`. The code is read through `@adr-tool/cli/code`, and `packages/cli/bundle.ts` builds both programs as one file, so `adr-mcp.mjs` is now about 13 MB.
- *`adr check`* reads `.arch/config.yml` and fails on its Problem. It checks the Diagrams (`src/check-diagrams.ts`, 4 tests): a Problem of a Diagram, a stale picture among them, fails it. A Drift is a note at the line of its connection, or of the element that uses, and fails nothing. The summary line reads "1 Diagram: no Problem, no Drift." on this repository ([cli.md](cli.md)).
- *Rename* is the Diagrams' as above.

**Fixed in the scenario:**

- An added box landed outside the view.
- The picture in an ADR was wider than its page.
- A Rename left the pictures stale, which `adr check` now fails.
- A label on the canvas was crossed by a line drawn after it.

**Departures:**

- The Drift of a Dependency the Diagram leaves out is dotted and faint rather than dashed red: since part 6, dashed red is a connection that is only perhaps not in the code.
- The Diagram of this repository gained the connections that `cli` and `mcp` now have.

**Open:**

- The independent review.
- Moving several boxes at once.
- Choosing which suggested connections a new Diagram starts with: all of them are drawn.

### Part 8 — Review: Annotations and their Anchors

For Aylin and Lena. The core of the fifth module: [review-format.md](review-format.md), written first, and `packages/review`.

- **git as a port of the kernel**, first: the cores of this part and of part 14 read history, and the hardened way the app runs git (`packages/app/src/main/git.ts`) becomes a port that the kernel defines and the app and the command line implement.

- **An Annotation** is a file of its own under `docs/architecture/annotations/` (configurable): its type — `note`, `question`, `concern` —, its state — open or resolved —, its author and date, its text in Markdown, its replies, and its Traces to ADRs. Its Component is not stored: it follows from its Source File.
- **The Anchor**: the Source File, the line range, the quoted lines and the commit they were read in. When the code changes, the Annotation is found again — the quoted lines where they are now, then the most similar lines near where they were — and its new place is offered as a previewed change; when that fails, it is orphaned, a Problem whose Repair is to attach it again by hand.
- **Replies** under an Annotation, by several authors who meet through git.
- An ADR records how an Anchor is found again, and what counts as similar enough.

*Done when:* the tests, across commits of fixtures, cover a block of quoted lines that moves, one quoted line that is edited, the quoted lines deleted, the Source File renamed, and a rebase that removes the commit of the Anchor: the Annotation follows its lines in the first, second and fourth case and after the rebase, and is orphaned in the third.

*Status (2026-11-02):* the core is built; the window follows in part 9. git is a port of the kernel (`packages/kernel/src/git`: HEAD, whether a commit is there, a file at a commit, the changes between two commits, the log of the repository or of one file with its renames), with a scripted history in memory for tests, and one hardened implementation for Node.js in `@adr-tool/cli/git`, which the app's main process now runs as well ([ADR-0020](adr/0020-git-is-a-port-of-the-kernel-implemented-once-for-node.md)). [review-format.md](review-format.md) is the contract: an Annotation under `docs/architecture/annotations/` — or where `annotations` in `.arch/config.yml` says —, its quoted lines as the fenced code block its text begins with, each Reply a file of its own so that two people replying on two branches merge without a conflict. `packages/review` reads Annotations with their Problems, plans Create, Reply, Resolve, Reopen, Update the Anchor, Attach again, Cite and Uncite as change sets that touch only their lines, and finds an Anchor again as [ADR-0019](adr/0019-an-anchor-is-found-again-by-its-quoted-lines-and-its-history.md) says: the rename followed through git, the text the lines were read in — the Anchor's commit, or after a rebase a version of the file that stands in for it — compared with the file now, so that only lines new since then or quoted lines kept may be the Anchor's; the quoted lines first, then the most similar block, similar enough from one half on. The five cases are tested on scripted histories (`packages/review/test/find.test.ts`) and on repositories made with `git init`, a rebase with its old commits pruned among them (`packages/cli/test/anchors.test.ts`). The window words every code of `review` in German too.

### Part 9 — Review in the app

For Aylin and Lena. Annotations where code is read.

- **In the code viewer**: select lines and add a `note`, `question` or `concern`; Annotations show beside their lines, open and resolved apart; a click opens them, with replies, **Resolve** and **Reopen**.
- **Review** in the module switcher: the sidebar filters by Component, type, state and author; the centre lists the Annotations; the detail is one Annotation, with its code.
- **Orphaned Annotations** in the repository's Problems, attached again by selecting their new lines.
- **Traces to ADRs**, picked in the Annotation; an ADR lists the Annotations that cite it; the Component page lists its open Annotations; **MCP** reads and plans Annotations.

*Done when:* Aylin annotates three places of a copy of the Java fixture, a commit that moves one of them and deletes another is made from the terminal, and the window shows the first at its new lines and the second as orphaned, attached again in two clicks.

### Part 10 — Assessment: the documents and their registers

For Aylin and Lena. The core of the sixth module: [assessment-format.md](assessment-format.md), written first, and `packages/assessment`.

- **An Assessment** is a dated Markdown document under `docs/architecture/assessments/` (configurable): its scope, the **Quality Scenarios** it rates — each classified by a quality attribute of ISO 25010, with its stimulus, its response and its measure —, their ratings, and its **Findings**.
- **A Finding** is a person's judgement with its evidence attached through Traces: a Violation by its fingerprint, a metric value of a Component, an Annotation, an ADR. A Trace to what does not exist is a Problem.
- **A Snapshot**: the metric values of the Components at the time of the Assessment, frozen into it, so that its evidence keeps reading the same.
- **Risks** and **Technical Debt Items**: entries of their own under `docs/architecture/` (configurable), with their own state — a Risk is open, mitigated, accepted or closed; a Technical Debt Item open, scheduled or paid off —, outliving Assessments, which refer to them.
- An ADR records how a document of prose and a register of entries are both kept as files that read well on GitHub.

*Done when:* an Assessment of the Java fixture, written by hand in the format, parses without a Problem into its Scenarios, Findings, Snapshot, Risks and Technical Debt Items; a Finding citing a Violation that is gone reports a Problem; the Snapshot still reads the same after the code changed.

### Part 11 — Assessment in the app

For Aylin and Lena. Writing an Assessment with the evidence at hand.

- **Assessment** in the module switcher: the sidebar lists the Assessments by date and the registers of Risks and Technical Debt Items with their counts by state; the centre is the Assessment as a document, or a register as a board by state; the detail is a Scenario, Finding, Risk or Item.
- **A new Assessment** from the last one: its scope and its Quality Scenarios carried over to be rated again, its ratings and Findings left behind.
- **Evidence** picked from where it is: a Violation, a Component's metric, an Annotation, an ADR — and **Add to an Assessment** from each of them.
- **Take a Snapshot** writes the metric values into the Assessment as a previewed change; the **utility tree** shows the Scenarios under their quality attributes, by importance and difficulty.
- **The Component page** lists the Findings, Risks and Technical Debt Items that cite it; **MCP** reads and plans the documents and the registers; a Rename of a Component rewrites the Findings and the Snapshot that name it.

*Done when:* Aylin's scenario of [personas.md](personas.md), up to the report and without the hotspot, which part 14 adds, works on a copy of the Java fixture: six Scenarios rated, Findings that cite a Violation, a metric and an Annotation, a Snapshot taken, three Risks recorded, each a previewed change.

### Part 12 — Reports, trends and comparison

For Priya and Aylin. What an Assessment becomes for those who never open the app.

- **The export moves to the kernel**, first: the sanitizing of Markdown and the writer that only writes into a directory it may write to, which the export of ADRs has in `core` and `cli` ([ADR-0014](adr/0014-the-export-is-static-html-from-core-printed-to-pdf-by.md)), so that a module's core can export without depending on another's ([ADR-0006](adr/0006-one-core-package-per-module-on-a-shared-kernel.md)).
- **A report** of an Assessment as static HTML and as PDF: the Scenarios and their ratings, the Findings with their evidence as text and pictures, the Risks and Technical Debt Items it names, and what changed since the Assessment before it.
- **Trends** across the Snapshots of a repository's Assessments: each metric of each Component over time.
- **Comparing two Assessments**: Scenarios rated better or worse, Findings new and gone, Risks and Technical Debt Items opened and closed — in the window, and in the report.
- `adr export` exports reports as well.

*Done when:* Priya's scenario of [personas.md](personas.md) for the Assessment works: the PDF of Aylin's Assessment reads without the app, and says what changed since the earlier one.

### Part 13 — More metrics

For Lena and Aylin. Structure's Next tier, first half.

- **Complexity per function**, cyclomatic, for TypeScript, JavaScript, Svelte, Java, Python and Go, from the parsers already there ([ADR-0008](adr/0008-dependencies-come-from-parsers-alone-without-a-type-checker.md)); the most complex functions of a Component on its page, each a click into the code.
- **Abstractness and distance from the main sequence** per Component, with the chart of instability over abstractness.
- **LCOM4** per class, as a metric inside a file, and **propagation cost** of a level.
- Every new metric can be the subject of a Rule's threshold — a function's complexity with a fingerprint of the Rule, the Source File and the function — and of a Snapshot, and the MCP server reads it.

*Done when:* the numbers of the fixtures agree with a second, independent count in the tests, as the metrics of Structure's part 5 do, complexity in the fixtures of all six languages, `python-shop` and `go-shop` among them; the main-sequence chart of the Java fixture shows its modules; a threshold on complexity fails `adr check` at the function.

### Part 14 — History analysis

For Aylin and Lena. Structure's Next tier, second half: what git knows, read-only.

- **Churn** per Source File and Component over a period; **hotspots**, churn times complexity; **temporal coupling** between Source Files and between Components — they change together in the same commits —; **temporal cohesion** inside a Component.
- Read from `git log` without changing anything, in the background, cached like the analysis; renames followed.
- A view of the hotspots and one of the couplings, in Structure, read by the MCP server too; a hotspot or a coupling can be the evidence of a Finding.
- An ADR records what is read from git, and how a commit of a bulk change is kept from distorting the figures.

*Done when:* on this repository the hotspots name files that the history shows changing most, a pair of files that always change together is coupled, and Aylin cites a hotspot in a Finding.

### Part 15 — Libraries

For Lena and Aylin. Structure's Library inventory, Conformance's Rules about Libraries, and the declared licences.

- **The inventory**: the third-party packages read from `package.json`, `pom.xml` and `build.gradle`, beside the manifests of Python and Go that part 20 reads already (`pyproject.toml`, `requirements.txt`, `go.mod`) — read, never run ([ADR-0007](adr/0007-the-analysis-never-executes-anything-from-the-analysed.md)) —, with their declared versions, and which Component uses which Library, extending the uses of Libraries that Structure finds already (`LibraryUse`) and mapping the name a distribution is installed by to the name it is imported by (`PyYAML` → `yaml`); on the Component page, in search and through the MCP server.
- **Rules about Libraries**: "only `persistence` may use `pg`", in `.arch/rules.yml`, checked by `adr check`.
- **Declared licences**, as far as the repository says them without network access: what an installed package declares, and nothing guessed.

*Done when:* on this repository the inventory lists the Libraries of each package with the Components that use them, a Rule that only `app` may use `electron` holds, one broken on purpose fails `adr check` at the import, and the licences of installed packages are listed with those that cannot be told marked as such.

### Part 16 — Documentation

For Priya and Lena. The seventh module, as its Later tier has it.

- **An arc42 skeleton** in Markdown under `docs/architecture/arc42/` (configurable), written as a previewed change: its twelve chapters, with what people write in them kept as theirs.
- **Live views** that a chapter embeds and the suite fills in: the building-block view from Components and Diagrams (chapter 5), the decisions from the Decision Logs (chapter 9), the Quality Scenarios (chapter 10), the Risks and Technical Debt Items (chapter 11). A live view names what it shows, and reads as a placeholder on GitHub.
- **Documentation** in the module switcher, reading the chapters with their live views; the export as a static site and as PDF, on the export of ADRs.

- The live views are filled where the modules meet — in the app and the command line —, not by one module's core reaching into another's ([ADR-0006](adr/0006-one-core-package-per-module-on-a-shared-kernel.md)).

*Done when:* Priya's scenario of [personas.md](personas.md) works: the arc42 site of a copy of this repository, exported, opens from disk with the current Diagram in chapter 5, the ADRs by Status in chapter 9, and the open Risks and Technical Debt Items in chapter 11.

### Part 17 — The System

For Aylin and Lena. Several repositories looked at as one, as Structure's Later tier and the vision's "System across repositories" have it.

- **A System** names the repositories that belong to it, in `.arch/system.yml` of the repository that holds it; each stays a repository of its own, with its own Components.
- **Uses across repositories**: where one repository uses a package another one publishes — an npm package name, a Maven artifact —, the System connects the Components of both. To the repository that uses it the package stays a Library; the [Structure glossary](contexts/structure/CONTEXT.md) gets the term for the connection in the System when this part settles it.
- **The System's view** in Structure: the repositories, their Components and the Dependencies across them; Rules may name a Component of another repository by `<repository>:<Component ID>`, as Relations do since part 13 of the roadmap.

*Done when:* two fixture repositories, one publishing a package that the other uses, open as one System; the connection across them shows in the System's view, and a Rule against it fails `adr check` run on the System.

### Part 18 — Suggestions and people

For Lena and Aylin. The Later tiers of Conformance and Structure.

- **Heuristic detection of a Pattern** as a suggestion when Rules are set up: "this structure fits *layered* to 85 %", with the Dependencies that speak against it; adopting it is applying the Pattern of part 5.
- **Author-based figures** from the history of part 14: knowledge distribution per Component and its bus factor. They are delicate in teams: off until switched on, per repository, in the person's own settings of the app and never in the repository, and never in an export unless asked for.

*Done when:* the fixture of part 5 is suggested hexagonal with the Violations as what speaks against it; the author figures of this repository show only after they are switched on.

### Part 19 — More diagrams

For Lena and Priya. The Later tier of Diagrams.

- **Sequence diagrams** whose participants are Components and External Systems, and **deployment diagrams** whose nodes carry Components; both diffable files, both drawn to SVG, both checked for elements that are gone.
- **Free-hand shapes and notes** on a Diagram, which have no Drift.
- **Further export formats**: PNG and PDF, beside SVG. Diagrams as code — Mermaid, PlantUML, Structurizr DSL — stay out, as [vision.md](vision.md) has it.

*Done when:* a sequence diagram of an export from `app` through `cli` to `core`, and a deployment diagram of the app on a laptop, draw and export; a note on the container view stays when the Diagram's Drift changes.

### Part 20 — More languages

For Aylin. Structure's Later tier: further languages as adapters on the language-neutral model.

- **Python**: modules and packages, absolute and relative imports, resolved against the repository's source roots, read with tree-sitter as WASM as Java is ([ADR-0008](adr/0008-dependencies-come-from-parsers-alone-without-a-type-checker.md)).
- **Go**: packages as directories, imports resolved through `go.mod`.
- Complexity per function for both; their manifests (`pyproject.toml`, `requirements.txt`, `go.mod`) for the Library inventory.

*Done when:* a Python fixture and a Go fixture draft as Components with their Dependencies and Cycles, as the fixtures of TypeScript and Java do, with every use either resolved, a Library, or listed as not resolved.

*Status (2026-11-03):* built, without complexity: **complexity per function for Python and Go moves into part 13**, which then counts it for every language at once, from the parsers already there. The contract is [structure-format.md](structure-format.md), sections 1 to 3, with the new sections "Python", "Go" and "Manifests". Both languages are read as Java is, with tree-sitter as WebAssembly ([ADR-0008](adr/0008-dependencies-come-from-parsers-alone-without-a-type-checker.md)): `tree-sitter-python` and `tree-sitter-go` 0.25.0 bring their `.wasm` in their npm packages, their native builds stay switched off, and `smol-toml` reads `pyproject.toml`; nothing of the repository runs, and no interpreter, go command, environment or module cache is asked. **Python**: `import` and `from … import`, absolute and relative, anywhere in a file; an absolute import is looked up in the directory the file's top-level package lies in, as pytest and a script have it, then in the source roots of its Python project — what `pyproject.toml`, `setup.cfg` or `setup.py` names for setuptools, Poetry, Hatch, PDM, uv or pytest, then `src`, then the project's directory —, then in those of the other projects, where it must be found once; namespace packages have no file and are no Dependency; an import in the block of `if TYPE_CHECKING:` is type-only; the standard library (`sys.stdlib_module_names` of 3.13, with what 3.8 to 3.14 removed and added) is no Library, and a Library is named by its top-level import name. **Go**: packages as directories, every `go.mod` a module with what it requires and its replacements by a directory of the repository, `go.work`'s replacements first, nested modules the repository's whether or not anything names them; the standard library and cgo's `C` are skipped; a Library is named by the module `go.mod` requires; `_test.go` files are tests, seen only by the tests of their package. A use of another package lands on the file that declares the name used, on the line of the use, so that Dependencies stay between files. **The Draft** takes the members of a uv workspace and the modules nested in a Go repository as units, drafts the root as a unit of code beside them where it declares a Python project or holds Python or Go of its own, and starts below the source root a Python project names. **Manifests**: `pyproject.toml` (PEP 621, PEP 735, Poetry), `requirements.txt` and its kin, and `go.mod` give the Libraries they declare as a minimal record, the same for every language — the manifest, the name, the version as written, the group, the line —, not yet joined to the Libraries the code uses; part 15 adds `package.json`, `pom.xml` and `build.gradle` and maps a distribution's name to its import. The app's analysis worker loads a grammar only where the repository has its language, the code viewer highlights Python and Go, build output beside `pyproject.toml`, `setup.py`, `setup.cfg` or `go.mod` is left out of the walk, and `__pycache__`, `.venv` and the caches of tox, mypy, pytest and ruff are not watched; the four new codes for a file that cannot be read have their German. `adr check` carries the two grammars as base64 too, about 13 MB in one file, and walks as the app does. The fixtures `python-shop` and `go-shop` pin every use: Python 10 Dependencies, a Cycle of `cart` and `pricing` whose weakest Dependency is `cart` → `pricing`, one of `cart.py` and `line.py` whose way back is type-only, `requests`, `yaml` and `pytest` as Libraries and `shop.pricing.tariffs` not resolved; Go 13 Dependencies over `billing`, `cart`, `catalog`, `cmd` and `web`, the nested module `billing` reached through `replace`, a Cycle of `cart.go` and `line.go`, `uuid` as the one Library and `example.com/shop/payments` not resolved. 46 tests in `packages/structure/test/python`, `go`, the two fixtures and `manifests.test.ts`, and further ones for the Draft, the app's worker and `adr check` on both languages. In the app, in English: `python-shop` draws its three Components and the Cycle in under a second, with 10 Source Files, 10 Dependencies, 3 Libraries and one not resolved, opens `rules.py` from the edge with Python highlighted, and shows the Cycle of `cart.py` and `line.py` inside `cart`; `go-shop` draws its five Components without a Cycle, opens `web/server.go` at `inv.For(c)`, and shows the Cycle of `cart.go` and `line.go` inside `cart`. No ADR: what is read follows ADR-0007 and ADR-0008. The review of the part changed fourteen things: `setup.cfg` is split at its first `=` or `:` by indexOf, not by a pattern that took 19 s on three long lines; a `pyproject.toml` or `setup.cfg` that only configures a tool (`[tool.ruff]`, `[flake8]`) no longer drafts the root's directories beside a pnpm workspace or Maven modules; Go is looked at only where the go command looks, not in `testdata`, `vendor` or below a name beginning with `_` or `.`; a Go package indexes what its files declare, so that 200 files of 400 declarations resolve in 0.05 s instead of 22 s; a function literal's variables are no declarations of its package; Python looks first where the file's top-level package lies, so a Django project in `backend/` resolves without packaging configuration; a selection of a name that is not exported, or from a qualifier the file declares inside, is neither a use nor listed; Java, Python and Go each have their note that their numbers are a lower bound, in English and German; parts 13 and 15 name Python and Go; `..` in a `replace` or a configured source root is folded within the repository; an external test package sees `export_test.go`; a namespace directory named like a module of the standard library is passed over; a relative import above the top-level package is not resolved; and each record of a manifest has its line. Open: build constraints are not evaluated, Python's imports made by calling something are not seen, and `GOPATH` mode names a Library by its import path.

## Status

The status of each part is recorded under it as it is merged.
