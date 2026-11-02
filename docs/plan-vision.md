# Implementation plan — the modules of the vision

How the rest of [vision.md](vision.md) gets built: the four modules after Decisions and Structure — Conformance, Diagrams, Review, Assessment —, the Next and Later tiers of every module, Documentation, and the System across repositories. Vocabulary follows [CONTEXT-MAP.md](../CONTEXT-MAP.md) and the glossaries it points to; who each part is for follows [personas.md](personas.md); how the window looks follows [design.md](design.md). Agreed with the author on 2026-11-02.

[plan.md](plan.md) is the record of v1 of Decisions, [plan-structure.md](plan-structure.md) that of Structure, [plan-roadmap.md](plan-roadmap.md) that of the roadmap after v1; all three are complete. This plan is the vision's "Order after ADR v1" from its third step on.

## Decided by the author

On 2026-11-02, before this plan was written:

- **The whole vision is built**: every module, with its Core, Next and Later tiers, and what [vision.md](vision.md) lists across all modules. What the vision marks **Out** stays out.
- **One person in every role.** Whoever builds this plan is its product owner, its stakeholder, its designer, its developer, its tester and its reviewer — the reviewer of a part being someone other than who wrote it. The [personas](personas.md) stand in for the users: a part is done when its persona's scenario works in the running app.
- **Still deferred**, as in [plan-roadmap.md](plan-roadmap.md): distribution, Windows and macOS in CI, and the check of the name for clashes. A run on a Mac and on Windows stays with the author.
- **Working mode:** one branch and one pull request per part, as before. The author does not review them: each pull request is reviewed independently of the one who wrote it, its findings are fixed, and it is merged once CI is green.

## Working mode

As in [plan-roadmap.md](plan-roadmap.md#working-mode), and for every part in this order:

1. **Product owner:** the part's scope and its *done when*, here, against a persona's scenario.
2. **Designer:** where the part sits in the frame of [design.md](design.md) — which module, which pane, which view —, written into the part's status with the first screenshot.
3. **Contract first:** a module's file format is written before its code, in a document of its own (`conformance-format.md`, `diagrams-format.md`, …), and its terms go into its glossary the moment they are settled. A hard-to-reverse decision gets an ADR.
4. **Developer:** the module's core package, test-first, pure TypeScript on the kernel's file-system port ([ADR-0006](adr/0006-one-core-package-per-module-on-a-shared-kernel.md)); then the app; then the module's tools in the MCP server and its words in German.
5. **Tester:** the *done when* in the running app, in English and German, with screenshots; the tests of the core; and a reading of everything the part writes against [ADR-0002](adr/0002-never-reserialize-markdown.md) — nothing outside what was asked changes by a byte.
6. **Reviewer:** an independent review of the pull request; its findings are fixed, or answered in the part's status.

Four things grow with every module rather than in a part of their own, as [vision.md](vision.md) has it "across all modules":

- **The Component page** gets a section for what the module hangs on a Component.
- **The Problems of the repository** — one view for every module ([part 2](#part-2--the-frame-for-many-modules)) — get the module's Problems, each with its Repair where it has one.
- **Search** finds the module's artefacts.
- **The MCP server** reads the module's artefacts as data and plans its writes as previewed changes ([ADR-0013](adr/0013-agents-write-adrs-through-the-mcp-server-as-previewed-change.md)); `adr check` checks what the module can check.

## Parts

The order is the vision's: Conformance first, since it carries the suite into teams; then Diagrams, Review and Assessment, each needing what came before as its source of evidence; then the Next tiers; then Later. Within a module, the core and its format come before the window.

### Part 1 — The plan, the personas, the design

- This plan, [personas.md](personas.md) and [design.md](design.md).
- [vision.md](vision.md) points to this plan from its "Order after ADR v1".

*Done when:* the three documents are merged, and every later part can name its persona and the place in the frame it fills.

### Part 2 — The frame for many modules

For Lena and Aylin. What a window with six modules needs before the third one arrives, and what the vision lists under Decisions' Core that is still missing.

- **The module switcher** takes a module per part from part 4 on, and remembers per tab the view of each module.
- **The Problems of the repository**: one view, reached from every module's sidebar, that lists every Problem the suite knows — of each Decision Log, of the declaration of Components, of every Trace — grouped by module, each opening its artefact in its module, with its Repair. The count stands in every module's sidebar. It replaces nothing: the Problems of a Decision Log stay where they are.
- **Search across artefacts**: the search finds Components by ID and name, and Source Files by path, beside ADRs; a hit opens it in its module.
- **Mermaid in the ADR preview**: a `mermaid` code block is drawn as a diagram in the preview, the live mode and the app's export, and stays a code block in `adr export`, which has no browser. ADRs are untrusted input: Mermaid runs at its strictest security level, its SVG is sanitized, and a block that does not parse stays code with its error beside it.

*Done when:* on this repository, a Trace of an ADR to a Component that does not exist and a broken Relation stand in one list of Problems, each opening in its module; "kernel" finds the Component and its Source Files; an ADR with a flowchart shows it drawn, and a broken one shows its error.

### Part 3 — Conformance: Rules, Violations and `adr check`

For Lena and Jonas. The core of the third module, without a window yet: [conformance-format.md](conformance-format.md), written first, and `packages/conformance`.

- **Rules** in `.arch/rules.yml`, edited by hand or by an agent: which Components may or must not depend on which, by Component ID with patterns (`ui/**`); ordered layers, strict or relaxed; no Cycles, among the Components of a level or inside one; thresholds on metrics of Structure. Each Rule has an ID and a sentence that says why.
- **Violations**, derived from Structure's Dependencies and metrics and never stored, each with the Source File Dependencies behind it and a stable fingerprint — the Rule, the source, the target, no line numbers ([vision.md](vision.md), Conformance).
- **Exceptions** next to the Rules, by fingerprint, each with a reason and optionally a Trace to the ADR that justifies it; an Exception that matches no Violation, or whose ADR does not exist, is a Problem.
- **`adr check`**: `adr lint`, and the Rules against the code, in one run; text, JSON and GitHub annotations at the line of the import that causes a Violation; it fails on a Violation that has no Exception. [cli.md](cli.md) documents it.
- An ADR records the shape of the file and the fingerprint.

*Done when:* on this repository, a Rule that `kernel` depends on nothing, one that `core` and `structure` do not depend on each other, and a layering of `app` over the cores hold; a Rule broken on purpose in a fixture fails `adr check` with the file and line of the import, and an Exception for it makes it pass.

### Part 4 — Conformance in the app

For Lena. The module in the window, with its tools for the agent.

- **Conformance** in the module switcher: the sidebar lists the Rules with the count of their Violations; the centre is the list of Violations, or Structure's Dependency graph with the Violations in red; the detail of a Violation names its Rule, its Source File Dependencies — each line a click into the code viewer —, and offers **Accept as Exception**; that of a Rule says what it says and where it is written.
- **Writing Rules in the window**: a form to add, change and remove a Rule, written into `.arch/rules.yml` as a previewed change that touches its lines only; a file it cannot write without rewriting more, it refuses with a sentence.
- **Exceptions** with their reason and the ADR they cite, a click away; the Problems of part 3 in the repository's list, with their Repairs.
- **The Component page** lists the Rules that name the Component and its Violations; **an ADR** lists the Exceptions it justifies.
- **MCP**: list the Rules, list the Violations — also of a planned import, before it is written —, plan a Rule, plan an Exception.

*Done when:* Lena's scenario of [personas.md](personas.md) works on a copy of this repository with an import from `core` into `structure` added: the Rule is written in the window, the Violation shows in the list and on the graph, opens the import line, is accepted as an Exception that cites an ADR, and `adr check` passes; the agent's scenario through the MCP server sees the Rule before it writes code.

### Part 5 — Patterns and the Baseline

For Lena and Jonas, on a repository that was not built to its rules.

- **Patterns**: layered, hexagonal, clean architecture and modular monolith, each a set of Rules written in roles. Applying one assigns Components to its roles and writes the Rules it stands for, as a previewed change; the Rules stay readable as Rules, and say which Pattern and role they came from.
- **The Baseline**: the fingerprints of today's Violations, recorded in `.arch/baseline.yml` as a previewed change; `adr check` fails only on a Violation that is in neither the Baseline nor an Exception, and says how many the Baseline still holds. A Violation of the Baseline that is gone is reported, so that the Baseline shrinks.

*Done when:* the hexagonal Pattern applied to a fixture of ports and adapters writes its Rules, a Baseline taken of its three Violations lets `adr check` pass, a fourth Violation fails it with only that one named, and fixing one of the three says the Baseline can shrink.

### Part 6 — Diagrams: the model, Drift and SVG

For Lena and Priya. The core of the fourth module: [diagrams-format.md](diagrams-format.md), written first, and `packages/diagrams`.

- **A Diagram** is a diffable text file under `docs/architecture/diagrams/` (configurable): its elements — Components by ID, External Systems as plain boxes with a name and a description —, the connections between them with a label, and the position of each box, which is the layout and is kept as written. Its view level follows C4 — system context, container, component — as a depth of the Component hierarchy.
- **Suggested connections** from Structure's real Dependencies between the shown Components.
- **Drift**, derived and never stored: a connection the code does not have, a Dependency between shown Components that the Diagram leaves out. An element whose Component is gone is a Problem, with its Repair.
- **SVG** drawn by the core, without a browser: the export written beside the Diagram as a previewed change, so that GitHub shows the picture and an ADR can embed it.
- An ADR records the file format.

*Done when:* a Diagram of this repository's packages, written by hand in the format, draws to SVG, suggests the connections the code has, reports a connection added on purpose as Drift, and reports an element with a removed Component as a Problem.

### Part 7 — Diagrams in the app

For Lena. The editor.

- **Diagrams** in the module switcher: the sidebar lists the Diagrams with their Drift; the centre is the canvas; the detail is the selected element or connection.
- **The canvas**: add Components of a level and External Systems; drag boxes, and the positions are written; accept a suggested connection, or draw one; label it. Each change is written into the file as a change of its lines; while dragging, the file is written once when the box is dropped.
- **Drift** in the drawing — red for a connection the code does not have, dashed red for one it has and the Diagram leaves out — and in a list beside it; **Export SVG** writes the picture beside the file.
- **A new Diagram** starts from a level of the Component hierarchy, with its Components placed in Structure's layout and the suggested connections drawn.
- **The Component page** lists the Diagrams that show it; **MCP** reads a Diagram as data and its Drift, and plans changes to it.

*Done when:* Lena draws the container view of this repository from its Components, with GitHub and the file system as External Systems, exports it as SVG, embeds the SVG in an ADR whose preview shows it, adds a Dependency in the code and sees the Diagram's Drift.

### Part 8 — Review: Annotations and their Anchors

For Aylin. The core of the fifth module: [review-format.md](review-format.md), written first, and `packages/review`.

- **An Annotation** is a file of its own under `docs/architecture/annotations/` (configurable): its type — `note`, `question`, `concern` —, its state — open or resolved —, its author and date, its text in Markdown, its replies, and its Traces to ADRs. Its Component is not stored: it follows from its Source File.
- **The Anchor**: the Source File, the line range, the quoted lines and the commit they were read in. When the code changes, the Annotation is found again — the quoted lines where they are now, then the most similar lines near where they were — and its new place is offered as a previewed change; when that fails, it is orphaned, a Problem whose Repair is to attach it again by hand.
- **Replies** under an Annotation, by several authors who meet through git.
- An ADR records how an Anchor is found again, and what counts as similar enough.

*Done when:* the tests move, edit and delete the quoted lines of fixtures across commits, and the Annotation follows its lines, or is orphaned, as the ADR says; a rename of the Source File is followed through git.

### Part 9 — Review in the app

For Aylin. Annotations where code is read.

- **In the code viewer**: select lines and add a `note`, `question` or `concern`; Annotations show beside their lines, open and resolved apart; a click opens them, with replies, **Resolve** and **Reopen**.
- **Review** in the module switcher: the sidebar filters by Component, type, state and author; the centre lists the Annotations; the detail is one Annotation, with its code.
- **Orphaned Annotations** in the repository's Problems, attached again by selecting their new lines.
- **Traces to ADRs**, picked in the Annotation; an ADR lists the Annotations that cite it; the Component page lists its open Annotations; **MCP** reads and plans Annotations.

*Done when:* Aylin annotates three places of a copy of the Java fixture, a commit that moves one of them and deletes another is made from the terminal, and the window shows the first at its new lines and the second as orphaned, attached again in two clicks.

### Part 10 — Assessment: the documents and their registers

For Aylin. The core of the sixth module: [assessment-format.md](assessment-format.md), written first, and `packages/assessment`.

- **An Assessment** is a dated Markdown document under `docs/architecture/assessments/` (configurable): its scope, the **Quality Scenarios** it rates — each classified by a quality attribute of ISO 25010, with its stimulus, its response and its measure —, their ratings, and its **Findings**.
- **A Finding** is a person's judgement with its evidence attached through Traces: a Violation by its fingerprint, a metric value of a Component, an Annotation, an ADR. A Trace to what does not exist is a Problem.
- **A Snapshot**: the metric values of the Components at the time of the Assessment, frozen into it, so that its evidence keeps reading the same.
- **Risks** and **Technical Debt Items**: entries of their own, with their own state — a Risk is open, mitigated, accepted or closed; a Technical Debt Item open, scheduled or paid off —, outliving Assessments, which refer to them.
- An ADR records how a document of prose and a register of entries are both kept as files that read well on GitHub.

*Done when:* an Assessment of the Java fixture, written by hand in the format, reads with its Scenarios, Findings, Snapshot, Risks and Debt; a Finding citing a Violation that is gone reports a Problem; the Snapshot still reads the same after the code changed.

### Part 11 — Assessment in the app

For Aylin. Writing an Assessment with the evidence at hand.

- **Assessment** in the module switcher: the sidebar lists the Assessments by date and the registers of Risks and Technical Debt Items with their counts by state; the centre is the Assessment as a document, or a register as a board by state; the detail is a Scenario, Finding, Risk or Item.
- **A new Assessment** from a Template, with the Quality Scenarios of the last one carried over to be rated again.
- **Evidence** picked from where it is: a Violation, a Component's metric, an Annotation, an ADR — and **Add to an Assessment** from each of them.
- **Take a Snapshot** writes the metric values into the Assessment as a previewed change; the **utility tree** shows the Scenarios under their quality attributes, by importance and difficulty.
- **The Component page** lists the Findings, Risks and Debt that cite it; **MCP** reads and plans the documents and the registers.

*Done when:* Aylin's scenario of [personas.md](personas.md), up to the report, works on a copy of the Java fixture: six Scenarios rated, Findings that cite a Violation, a metric and an Annotation, a Snapshot taken, three Risks recorded, each a previewed change.

### Part 12 — Reports, trends and comparison

For Priya and Aylin. What an Assessment becomes for those who never open the app.

- **A report** of an Assessment as static HTML and as PDF, built on the export of ADRs ([ADR-0014](adr/0014-the-export-is-static-html-from-core-printed-to-pdf-by.md)): the Scenarios and their ratings, the Findings with their evidence as text and pictures, the Risks and Debt it names.
- **Trends** across the Snapshots of a repository's Assessments: each metric of each Component over time.
- **Comparing two Assessments**: Scenarios rated better or worse, Findings new and gone, Risks and Debt opened and closed.
- `adr export` exports reports as well.

*Done when:* Priya's scenario of [personas.md](personas.md) for the Assessment works: the PDF of Aylin's Assessment reads without the app, and the comparison with an earlier one says what changed.

### Part 13 — More metrics

For Lena and Aylin. Structure's Next tier, first half.

- **Complexity per function**, cyclomatic, for TypeScript, JavaScript, Svelte and Java, from the parsers already there ([ADR-0008](adr/0008-dependencies-come-from-parsers-alone-without-a-type-checker.md)); the most complex functions of a Component on its page, each a click into the code.
- **Abstractness and distance from the main sequence** per Component, with the chart of instability over abstractness.
- **LCOM4** per class, as a metric inside a file, and **propagation cost** of a level.
- Every new metric can be the subject of a Rule's threshold, and of a Snapshot.

*Done when:* the numbers of the fixtures agree with a second, independent count in the tests, as the metrics of Structure's part 5 do; the main-sequence chart of the Java fixture shows its modules; a threshold on complexity fails `adr check` at the function.

### Part 14 — History analysis

For Aylin and Lena. Structure's Next tier, second half: what git knows, read-only.

- **Churn** per Source File and Component over a period; **hotspots**, churn times complexity; **temporal coupling** between Source Files and between Components — they change together in the same commits —; **temporal cohesion** inside a Component.
- Read from `git log` without changing anything, in the background, cached like the analysis; renames followed.
- A view of the hotspots and one of the couplings, in Structure; a hotspot or a coupling can be the evidence of a Finding.
- An ADR records what is read from git, and how a commit of a bulk change is kept from distorting the figures.

*Done when:* on this repository the hotspots name files that the history shows changing most, a pair of files that always change together is coupled, and Aylin cites a hotspot in a Finding.

### Part 15 — Libraries

For Lena and Aylin. Structure's Library inventory, Conformance's Rules about Libraries, and the declared licences.

- **The inventory**: the third-party packages read from `package.json`, `pom.xml` and `build.gradle` — read, never run ([ADR-0007](adr/0007-the-analysis-never-executes-anything-from-the-analysed.md)) —, with their declared versions, and which Component uses which Library.
- **Rules about Libraries**: "only `persistence` may use `pg`", in `.arch/rules.yml`, checked by `adr check`.
- **Declared licences**, as far as the repository says them without network access: what an installed package declares, and nothing guessed.

*Done when:* on this repository the inventory lists the Libraries of each package with the Components that use them, a Rule that only `app` may use `electron` holds, one broken on purpose fails `adr check` at the import, and the licences of installed packages are listed with those that cannot be told marked as such.

### Part 16 — Documentation

For Priya and Lena. The seventh module, as its Later tier has it.

- **An arc42 skeleton** in Markdown under `docs/architecture/arc42/` (configurable), written as a previewed change: its twelve chapters, with what people write in them kept as theirs.
- **Live views** that a chapter embeds and the suite fills in: the building-block view from Components and Diagrams (chapter 5), the decisions from the Decision Logs (chapter 9), the Quality Scenarios (chapter 10), the Risks and Technical Debt Items (chapter 11). A live view names what it shows, and reads as a placeholder on GitHub.
- **Documentation** in the module switcher, reading the chapters with their live views; the export as a static site and as PDF, on the export of ADRs.

*Done when:* Priya's scenario of [personas.md](personas.md) works: the arc42 site of a copy of this repository, exported, opens from disk with the current Diagram in chapter 5, the ADRs by Status in chapter 9, and the open Risks in chapter 11.

### Part 17 — The System

For Aylin and Lena. Several repositories looked at as one, as Structure's Later tier and the vision's "System across repositories" have it.

- **A System** names the repositories that belong to it, in a file of its own; each stays a repository of its own, with its own Components.
- **Dependencies across repositories**: where one repository uses a package another one publishes — an npm package name, a Maven artifact —, the System has a Dependency between their Components.
- **The System's view** in Structure: the repositories, their Components and the Dependencies across them; Rules may name a Component of another repository by `<repository>:<Component ID>`, as Relations do since part 13 of the roadmap.

*Done when:* two fixture repositories, one publishing a package that the other uses, open as one System; the Dependency across them shows in the System's view, and a Rule against it fails `adr check` run on the System.

### Part 18 — Suggestions and people

For Lena and Aylin. The Later tiers of Conformance and Structure.

- **Heuristic detection of a Pattern** as a suggestion when Rules are set up: "this structure fits *layered* to 85 %", with the Dependencies that speak against it; adopting it is applying the Pattern of part 5.
- **Author-based figures** from the history of part 14: knowledge distribution per Component and its bus factor. They are delicate in teams: off until switched on, per repository, and never in an export unless asked for.

*Done when:* the fixture of part 5 is suggested hexagonal with the Violations as what speaks against it; the author figures of this repository show only after they are switched on.

### Part 19 — More diagrams

For Lena and Priya. The Later tier of Diagrams.

- **Sequence diagrams** whose participants are Components and External Systems, and **deployment diagrams** whose nodes carry Components; both diffable files, both drawn to SVG, both checked for elements that are gone.
- **Free-hand shapes and notes** on a Diagram, which have no Drift.
- **Further export formats**: PNG, and the Diagram as Mermaid, PlantUML and Structurizr DSL text — as exports; the suite never reads them ([vision.md](vision.md), Diagrams, Out).

*Done when:* a sequence diagram of an export from `app` through `cli` to `core`, and a deployment diagram of the app on a laptop, draw and export; a note on the container view stays when the Diagram's Drift changes.

### Part 20 — More languages

For Aylin. Structure's Later tier: further languages as adapters on the language-neutral model.

- **Python**: modules and packages, absolute and relative imports, resolved against the repository's source roots, read with tree-sitter as WASM as Java is ([ADR-0008](adr/0008-dependencies-come-from-parsers-alone-without-a-type-checker.md)).
- **Go**: packages as directories, imports resolved through `go.mod`.
- Complexity per function for both; their manifests (`pyproject.toml`, `requirements.txt`, `go.mod`) for the Library inventory.

*Done when:* a Python fixture and a Go fixture draft as Components with their Dependencies and Cycles, as the fixtures of TypeScript and Java do, with every use either resolved, a Library, or listed as not resolved.

## Status

The status of each part is recorded under it as it is merged.
