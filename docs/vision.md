# Vision — Softarch Suite

Where this project is heading beyond the ADR tool: one desktop workbench for a software architect, in which decisions, code structure, rules, diagrams, review notes and assessments are connected to each other.
Agreed in the design session of 2026-09-19. Vocabulary follows [CONTEXT-MAP.md](../CONTEXT-MAP.md) and the glossaries it points to.

[roadmap.md](roadmap.md) and [plan.md](plan.md) remain the plan of the Decisions module and are not replaced by this document. ADR v1 was finished first (accepted on 2026-09-20); the first module after it, Structure, has its own plan in [plan-structure.md](plan-structure.md) and its contract in [structure-format.md](structure-format.md).

This list is meant to be complete, and for one developer that is only honest with tiers. Every module is split into **Core** (the first version of that module), **Next** and **Later**, and says what is deliberately **Out**.

## Name and branding

- **Softarch Suite** is the working title from now on. The final name is settled before the first public release, after a check for clashes (trademarks, domains, npm, GitHub). That check is due before the release of the Decisions module, not before the suite.
- Icon idea: a stylised curved arrow whose arrowhead is a cotton ball.

## Principles

1. **Files in the repository are the truth.** [ADR-0003](adr/0003-on-disk-contract.md) applies to the whole suite. What a person makes — an ADR, a Component declaration, a Rule, a Diagram, an Annotation, an Assessment — is a file in the repository, in a documented format, readable without the app: on GitHub, in an editor, by an agent. What the suite computes is derived and can be recomputed at any time. No backend, no accounts, no telemetry; people collaborate through git.
2. **The connections are the product.** The modules are not independent tools behind one launcher. Everything attaches to the **Component**, and artefacts of different modules are connected by **Traces**. Without that the suite would be six average tools, each competing with a specialist.
3. **Architecture level, not code-quality level.** The suite explains and guards structure. It does not replace SonarQube or ESLint.
4. **The analysis never executes anything from the analysed repository.** No `mvn`, no `gradle`, no tsconfig plugins, no rule scripts. Manifests are read, never run. This costs precision (no resolved Java classpath) and buys the ability to open an unknown repository safely. ADRs and code from foreign repositories are untrusted input.
5. **No built-in LLM.** Documented file formats and an MCP server make the suite operable by whatever agent the user brings.
6. **The suite never changes a byte it was not asked to change** ([ADR-0002](adr/0002-never-reserialize-markdown.md)), and every operation returns a change set ([ADR-0004](adr/0004-operations-return-change-sets.md)). Both hold for every module.

## Who it is for

- **First:** a single architect or developer working on their own repository.
- **Teams** are reached through git and CI, not through a server: artefacts are reviewed as diffs, and the CLI gates the build.
- **Later:** a consultant or reviewer assessing someone else's system, served by report export. Principle 4 is what makes that scenario safe.

Code analysis starts with **TypeScript/JavaScript and Java**, on a language-neutral model, so that further languages arrive as adapters. The suite's own repository is its first test case, as it already is for ADRs.

## The spine

- A **Component** is a building block the architect names and declares in a file in the repository, mapped to code by path patterns, e.g. `core/metadata` → `packages/core/src/metadata/**`. Components are hierarchical. A **Draft** is derived from workspace packages, Maven modules, Gradle projects and folders; the architect adopts and refines it.
- A Component has a stable **Component ID** (a path of segments) apart from its display name. **Rename** is an operation of the suite that rewrites every Trace, Rule and Diagram through one change set, as Renumber does for ADRs. Splitting and merging stay manual; what is left dangling shows up as Problems.
- The smallest unit of the code model is the **Source File**, in both languages. It is what the code viewer opens and what Annotations attach to. Class-level metrics such as LCOM are metrics inside a file, not a further graph level.
- A **Trace** is a typed, directed connection between artefacts of different modules: an ADR *affects* a Component, a Finding *cites* an Annotation, an Exception is *justified by* an ADR. It is stored on the source artefact only; the opposite direction is computed. A Trace that points nowhere is a Problem with a Repair. **Relation** keeps its meaning: ADR to ADR within one Decision Log.
- The C4 words "container" and "component" name view levels of the one Component hierarchy. They are not further kinds of building block.

## Modules

One module is one bounded context and, in code, one UI-free core package; a small shared kernel holds what all of them need. It starts with the file-system port and change sets and grows as modules need it — the git wrapper, Traces and Problems are its likely next contents. The first two are `packages/kernel` and `packages/structure` ([plan-structure.md](plan-structure.md)).

### 1. Decisions

The ADR tool as described in [roadmap.md](roadmap.md). What the suite adds:

- **Core:** the first Trace, "this ADR affects these Components", as an additive Metadata key. This is the roadmap's "ADR → code links" item, given its anchor. Mermaid blocks are rendered in the ADR preview.
- **Later:** everything already listed under Later in the roadmap.

### 2. Structure

What the code is made of and how its parts depend on each other. Everything else hangs on this module, and it is the visible slice the suite starts with.

- **Core**
  - Declare Components: hierarchy, Component ID, display name, path patterns; the derived Draft; a list of the Unassigned Source Files.
  - Code model for TypeScript/JavaScript (files parsed one by one and imports resolved with TypeScript's own module resolution — no program, no type checker; Svelte files through their script blocks) and Java (`tree-sitter-java` as WASM, resolution through imports and a symbol table per package). No JVM, in line with [ADR-0001](adr/0001-electron-svelte-typescript-throughout.md). Java stays imprecise below class level; accepted, because architecture analysis works on file, package and Component level.
  - **Dependency** graph of the Components of one level at a time, going down the hierarchy; a Component without children shows its Source Files. A graph of all Source Files of a repository is never drawn — the matrix gives the overview. An edge between Components opens the Source File Dependencies behind it.
  - **Cycles** among the Components of a level and among the Source Files of a Component.
  - Dependency structure matrix.
  - Metrics per Component: afferent and efferent coupling (Ca, Ce), instability, size, relational cohesion, the share of internal Dependencies.
  - Read-only code viewer with syntax highlighting; a Dependency opens the import line that causes it.
  - Re-analysis when files change, in the background; the cache lives in the app's user-data folder, never in the repository.
  - Rename a Component through a change set — with the first Trace, when there is something outside the declaration to rewrite.
- **Next**
  - Complexity per function (needed for hotspots); abstractness and distance from the main sequence (mainly meaningful for Java); LCOM4 per class; propagation cost.
  - History analysis from git, read-only: churn, hotspots (churn × complexity), temporal coupling between Source Files and between Components, temporal cohesion within a Component.
  - **Library** inventory: third-party packages read from `package.json`, `pom.xml` and `build.gradle`, and which Component uses which Library.
- **Later**
  - Declared licences of Libraries, as far as they can be read without network access.
  - Author-based figures (knowledge distribution, bus factor). They are delicate in teams and can be switched off.
  - Further languages as adapters.
  - A **System** spanning several repositories, with Dependencies across them; goes together with the roadmap's "aggregation across repositories".
- **Out:** vulnerability scanning — Dependabot, OWASP Dependency-Check and Snyk do it better, and it needs the network. Code style, duplication, test coverage, bug patterns, security smells.

### 3. Conformance

The intended architecture, declared, and checked against the code.

- **Core**
  - **Rules** in a declarative file in the repository, edited through the UI and just as well by hand or by an agent: allowed and forbidden Dependencies between Components, ordered layers, "no cycles", thresholds on metrics (fitness functions). One mechanism, one view.
  - **Patterns**: ready-made sets of Rules for an architecture style — layered, hexagonal, clean architecture, modular monolith. Choose one, assign Components to its roles, and the Rules stand.
  - **Violations**: listed, shown on the Dependency graph, each opening the Source File and line that causes it. Violations are derived and never stored. A Violation has a stable fingerprint (Rule, source, target — no line numbers) so that other artefacts can point to it.
  - **Exceptions**: an accepted Violation, recorded next to the Rules with a reason and, optionally, a Trace to the ADR that justifies it.
  - The CLI's `check` for CI. `adr lint` ships first, as the roadmap says, and becomes part of it.
- **Next**
  - **Baseline**: a recorded set of Violation fingerprints, so that CI fails only on new Violations. This is what makes the module usable on a legacy code base.
  - Rules about Libraries ("only `persistence` may use `pg`").
- **Later:** heuristic detection as a set-up suggestion ("this structure fits *layered* to 85 % — adopt it?").
- **Out:** rules as code in the manner of ArchUnit; they would break principle 4. Detection of GoF design patterns: many false positives, little architectural meaning.

### 4. Diagrams

- **Core**
  - Model-based **Diagrams**: the elements are Components, plus **External Systems** as plain boxes. View levels after C4 — system context, container, component — as depths of the Component hierarchy.
  - Edges are suggested from the real Dependencies; layout is manual and stored.
  - **Drift** is flagged: an edge in the Diagram that the code does not have, a real Dependency between shown Components that the Diagram omits, an element whose Component is gone (the last one is a Problem).
  - Stored as a diffable text file, with an optional committed SVG export so that GitHub shows the picture and ADRs and documents can embed it.
- **Later:** sequence and deployment diagrams; free-hand drawing; further export formats.
- **Out:** a general diagram-as-code editor for Mermaid, PlantUML or Structurizr DSL. Mermaid is rendered in previews, nothing more.

The Dependency graph of the Structure module is a derived view, not a Diagram.

### 5. Review

Reading code as an architect and leaving remarks that survive change.

- **Core**
  - **Annotations** on a line range in the code viewer, of type `note`, `question` or `concern`, either open or resolved. Stored outside the source file, as readable files in the repository.
  - The **Anchor**: path, line range, the quoted lines and the commit. When the code changes, the Annotation is re-anchored by fuzzy matching; when that fails it is **orphaned** and reported as a Problem, with re-attaching by hand as the repair.
  - Lists and filters: by Component, type, state, author.
  - Traces from an Annotation to ADRs. The Component of an Annotation follows from its Source File and is not stored.
- **Next:** replies under an Annotation. Several authors already meet through git; threads make that a conversation.
- **Out:** editing code — the viewer stays read-only. Integration with pull-request comments on GitHub or elsewhere.

### 6. Assessment

Architecture evaluation: a qualitative judgement, backed by what the other modules know.

- **Core**
  - An **Assessment** is a dated document in the repository. It rates **Quality Scenarios**, classified by the quality attributes of ISO 25010, and records **Findings**.
  - A **Finding** is a human judgement with evidence attached through Traces: Violations, metric values, Annotations, ADRs.
  - A **Snapshot** of the metrics, frozen into the Assessment, so that the evidence still reads the same after the code has moved on.
  - **Risks** and **Technical Debt Items** are entries of their own with their own state. They outlive Assessments; an Assessment refers to them.
- **Next:** trends across Snapshots; comparison of two Assessments; a utility tree for Quality Scenarios; report export (HTML, PDF) for the consultant scenario.
- **Out:** an automatic overall score. The figures support the judgement; they do not make it.

### 7. Documentation

- **Later:** an arc42 skeleton in Markdown whose chapters embed live views from the other modules — building-block view (Components, Diagrams), decisions (chapter 9, ADRs), quality scenarios (chapter 10), risks and technical debt (chapter 11). Export as a static site or PDF; this is the roadmap's "read-only export for non-technical readers".
- **Out:** a general documentation editor or wiki.

### Across all modules

- **Core:** navigation built for several modules from the first public release on. A Component page: everything that hangs on one Component — ADRs, Dependencies, Rules, Violations, Diagrams, Annotations, Findings, Risks. One Problems view for the whole repository. Search across every kind of artefact.
- **Next:** the MCP server, on top of the cores.
- **Later:** report export; UI translations; System across repositories.

## Stored and derived

| Stored in the repository (made by a person)                                                                                                     | Derived (recomputed, never in the repository)                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| ADRs, Templates, Component declarations, Rules, applied Patterns, Diagrams, Annotations, Assessments, Quality Scenarios, Findings, Risks, Technical Debt Items | code model, Dependencies, metrics, Cycles, Violations, Drift, history figures, Problems |

Derived data enters the repository in exactly three places, each deliberately:

1. an **Exception** — a declaration that names a Violation by its fingerprint;
2. the **Baseline** — a set of Violation fingerprints;
3. the **Snapshot** inside an Assessment — frozen metric values kept as evidence.

## On disk, in a user's repository

Directory names in other people's repositories are hard to take back, and the product name is a working title. The names are therefore product-neutral.

- `.arch/` — configuration and model: Components, Rules, Exceptions, Baseline.
- `docs/architecture/` (configurable) — what people read: Diagrams, Assessments, Risks, Technical Debt Items, Annotations, later the arc42 documents. Visible, so that it is found on GitHub.
- `.adr/config.yml` keeps being read, for good. Decision Logs stay where they are.
- The analysis cache lives in the app's user-data folder.

Each module gets its own format specification, as [file-format.md](file-format.md) is for ADRs. The formats are not decided here.

## Order after ADR v1

1. **Structure** — Components, Dependency graph, cycles, core metrics, the code viewer, and the first Trace (ADR affects Component).
2. **Conformance** — Rules, Patterns, Violations, Exceptions, `check` in CI. This is what carries the suite into teams.
3. **Diagrams**
4. **Review** — Annotations in the viewer that already exists.
5. **Assessment** — needs modules 1 to 4 as sources of evidence.
6. The Next tiers: history analysis, Library inventory, Baseline, MCP server.
7. Later: Documentation, export, System.

**First public release:** the Decisions module alone, under the suite's name and with navigation built for further modules. The roadmap's list "Before the first public release" stays valid.

## Decisions that will need an ADR when they are built

Not written yet, because the trade-off only becomes real with the code:

- Parser strategy: TypeScript compiler API and tree-sitter for Java, no JVM sidecar.
- The analysis never executes anything from the analysed repository (principle 4).
- One core package per module plus a shared kernel.
- Traces are stored on the source only, unlike Back-references.

## Follow-ups in existing documents

Deliberately not done with this document, because they describe behaviour that does not exist yet:

- [CONTEXT.md](../CONTEXT.md): **Problem** stays as it is. Within Decisions it means an inconsistency in a Decision Log; the wider, suite-wide meaning is in the shared language of [CONTEXT-MAP.md](../CONTEXT-MAP.md).
- [CONTEXT.md](../CONTEXT.md): **Metadata** gains the key for the "affects" Trace once Structure is built.
- [file-format.md](file-format.md): the same key, with its exact name and value form.
- [roadmap.md](roadmap.md): `adr lint` and "ADR → code links" are re-read in the light of this document when their turn comes.
