# Changelog

What each release of Softarch Suite contains. Versions follow [Semantic Versioning](https://semver.org); while the version starts with 0, a minor release may change what a file format or a command promises, and says so here. How a release is made is in [docs/release.md](docs/release.md).

## [0.1.0] — unreleased

The first release: the desktop app as installers for Linux, Windows and macOS, and the command line and the MCP server as one file each. Two modules of the suite have their window — Decisions and Structure —; Conformance, Diagrams, Review and Assessment have their cores, and Conformance is checked from the command line. The app runs locally: no backend, no account, no telemetry ([ADR-0010](docs/adr/0010-the-suite-is-open-source-under-the-mit-licence.md)). The window speaks English and German.

### Downloads

- **Linux, x64:** a `.deb`, an AppImage and a `.tar.gz`.
- **Windows, x64:** an installer for the account that runs it, and a portable `.exe`.
- **macOS:** a `.dmg` and a `.zip` each for Apple silicon and for Intel.
- **`adr.mjs` and `adr-mcp.mjs`**, for Node.js 22.12 or later, and `SHA256SUMS`.

The installers are not signed with a certificate; the Mac build is signed ad hoc. The installers for Windows and macOS are built in CI but have not been tried by hand yet. The app does not update itself. The [README](README.md#download) says how to install each and how to open an unsigned app.

### Decisions

The Architecture Decision Records of a repository, where they already are: Markdown files with their Metadata in front matter ([docs/file-format.md](docs/file-format.md)). Nothing is written without a preview of every file it changes, and nothing beyond the lines that were asked for ([ADR-0002](docs/adr/0002-never-reserialize-markdown.md), [ADR-0004](docs/adr/0004-operations-return-change-sets.md)).

- **Browse:** one tab per repository, every Decision Log in it, the ADRs filtered by Status, each with its Metadata, Relations and Back-references, and its text rendered.
- **Relations graph:** which ADR supersedes, amends, depends on or relates to which, across the Decision Logs of a repository; it zooms, filters by Relation type, and reads each line out to a screen reader.
- **Write:** a new ADR from a Template; Accept, Reject, Deprecate, Supersede, Amend and Renumber; a Correction when a decided ADR is saved. A change set is written all of it or nothing ([ADR-0015](docs/adr/0015-a-change-set-is-written-beside-its-files-and-renamed-into.md)).
- **Edit** in three modes: the Markdown source, the source with a live preview, and Live, which renders the text in place, tables included.
- **Timeline, Board and Dashboard:** each ADR from creation to decision; a column per Status, where a drag decides; the counts, the Problems, the waiting proposals and the latest decisions.
- **Mermaid** blocks drawn in the reading view, the preview, the live mode and the export, at Mermaid's strictest and sanitized ([ADR-0016](docs/adr/0016-mermaid-is-drawn-in-the-renderer-and-exported-as-an-image.md)).
- **Problems and Repairs:** broken Relations, inconsistent Back-references, duplicate numbers and invalid Metadata, each with a Repair where the tool can know what was meant; **Repository Problems** lists those of every module in one place.
- **Search** over number, title and body in every open repository, ignoring case and accents and reading "ß" as "ss", and over the Components and Source Files of the repository in front.
- **Several repositories:** Every ADR and Every Problem across the open ones, and Relations to an ADR of another repository.
- **git:** the branch, the uncommitted ADRs, each ADR's history with its diffs, **Commit** for an ADR's files alone ([ADR-0012](docs/adr/0012-committing-an-adr-runs-git-commit-for-its-files-only.md)), and the ADRs of other branches, with a warning when a number is taken there.
- **Export** as static web pages and as a PDF, one ADR per page ([ADR-0014](docs/adr/0014-the-export-is-static-html-from-core-printed-to-pdf-by.md)).
- **Foreign formats:** MADR 2, 3 and 4, log4brains and adr-tools are read as they are, and **Migration** converts them ([ADR-0005](docs/adr/0005-foreign-formats-are-read-never-written.md)).

### Structure

The Components of the code and the Dependencies between them ([docs/structure-format.md](docs/structure-format.md)), read with parsers alone: nothing of the analysed repository runs ([ADR-0007](docs/adr/0007-the-analysis-never-executes-anything-from-the-analysed.md), [ADR-0008](docs/adr/0008-dependencies-come-from-parsers-alone-without-a-type-checker.md)).

- **Components** declared in `.arch/components.yml`, or a **Draft** derived from pnpm and npm workspaces, Maven modules, Gradle projects, uv workspaces and Go modules, which **Adopt** writes.
- **Dependencies** of TypeScript, JavaScript, Svelte, Java, Python and Go, with **Cycles**, their example round trip and their weakest Dependency; the Libraries the code uses and those its manifests declare.
- **Views:** the graph of each level, the dependency structure matrix, the metrics table — size, coupling, instability, fan-out and fan-in, cohesion, abstractness and distance, and the propagation cost of the level — and the main sequence.
- **Inside the code:** the most complex functions of a Component, counted as each language's usual tool counts them, and the classes whose methods fall apart by LCOM4; levels down through the directories to single files; a read-only code viewer that marks the import behind a Dependency.
- **Traces and Rename:** an ADR names the Components it affects, a Component lists its ADRs ([ADR-0009](docs/adr/0009-traces-are-recorded-on-the-source-only-unlike-back.md)), and Rename rewrites the declaration, the ADRs and the Rules that name a Component in one change.
- The analysis runs in a worker, caches per file, follows changes on disk, and counts a file its parser fails on as not analysed without losing the rest.

### Conformance, Diagrams, Review and Assessment

Their cores are built, each pure TypeScript with a contract of its own; their windows follow ([docs/plan-vision.md](docs/plan-vision.md)).

- **Conformance:** Rules and Exceptions in `.arch/rules.yml` — must-not-depend, may-only-depend, layers, no Cycles, and thresholds on the metrics — with Exceptions keyed by a fingerprint that survives moved code ([docs/conformance-format.md](docs/conformance-format.md), [ADR-0017](docs/adr/0017-rules-and-exceptions-share-one-file-keyed-by-fingerprint.md)). `adr check` checks them.
- **Diagrams:** a Diagram as a YAML file whose boxes are Components, its Drift from the code, and its SVG ([docs/diagrams-format.md](docs/diagrams-format.md), [ADR-0018](docs/adr/0018-a-diagram-is-a-yaml-file-and-its-svg-is-committed-beside-it.md)).
- **Review:** Annotations on code, with Replies, whose Anchors are found again across commits, renames and rebases ([docs/review-format.md](docs/review-format.md), [ADR-0019](docs/adr/0019-an-anchor-is-found-again-by-its-quoted-lines-and-its-history.md)).
- **Assessment:** Assessments with Quality Scenarios, Findings and their evidence, Snapshots of the metrics, and the registers of Risks and Technical Debt Items ([docs/assessment-format.md](docs/assessment-format.md), [ADR-0021](docs/adr/0021-an-assessment-is-markdown-with-yaml-blocks-each-risk-a-file.md)).

### The command line, `adr`

One file that Node.js runs, for CI and for anyone who wants the checks without the window ([docs/cli.md](docs/cli.md)).

- `adr lint` checks the Decision Logs by the app's rules.
- `adr check` does that, checks `.arch/components.yml`, and checks the Rules of `.arch/rules.yml` against the code, each Violation at the line of its import; `--format github` annotates a pull request.
- `adr export` writes the Decision Logs as web pages.
- `adr --version` prints the version.

### The MCP server, `adr-mcp`

The Decision Logs of a repository for agents over the Model Context Protocol, with the app's operations, each planned as a change the person sees before `apply_change` writes it, and the metrics of a Component as data ([docs/mcp.md](docs/mcp.md), [ADR-0013](docs/adr/0013-agents-write-adrs-through-the-mcp-server-as-previewed-change.md)).

### Known limitations

- Unsigned installers, no auto-update, and no run by hand on Windows or macOS yet; the tests run on Linux alone ([docs/roadmap.md](docs/roadmap.md)).
- `adr lint`, `adr check` and the MCP server speak English only.
- The name Softarch Suite has not been checked against trademark registers, domains, npm and GitHub ([ADR-0011](docs/adr/0011-the-product-is-called-softarch-suite.md)).

[0.1.0]: https://github.com/CyphraX/adr-tool/releases/tag/v0.1.0
