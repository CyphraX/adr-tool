# Implementation plan — the roadmap after v1

How the rest of [roadmap.md](roadmap.md) gets built: what stands before the first public release, the follow-ups after v1, and the items under Later. Vocabulary follows [CONTEXT.md](../CONTEXT.md) and, where Components come in, the [Structure glossary](contexts/structure/CONTEXT.md). Agreed with the author on 2026-11-02.

[plan.md](plan.md) is the record of v1, [plan-structure.md](plan-structure.md) that of the Structure module; both are complete. This plan comes before Conformance, the next module in [vision.md](vision.md): the author asked for the roadmap to be finished first, and the vision's order says so now. It builds no module of the vision; the export of part 10 covers ADRs only, and the Documentation module builds on it later.

## Decided by the author

On 2026-11-02, before this plan was written:

- **Licence:** MIT ([ADR-0010](adr/0010-the-suite-is-open-source-under-the-mit-licence.md)).
- **Name:** Softarch Suite, the working title until now ([ADR-0011](adr/0011-the-product-is-called-softarch-suite.md)). The Decisions module is what was called ADR Tool; the repository and the package names keep `adr-tool`.
- **Distribution is deferred:** installers, code signing, auto-update and Windows and macOS in CI stay where the roadmap has them, and are not part of this plan.
- **Left to the author**, because they need what this plan cannot provide: the check of the name for clashes in trademark registers, domains, npm and GitHub ([ADR-0011](adr/0011-the-product-is-called-softarch-suite.md)), and running a quit with unsaved text once on a Mac (roadmap, "Known gaps of v1"). Both stay on the roadmap's list before the first public release.
- **Working mode:** one branch and one pull request per part, as before. The author does not review them: each pull request is reviewed independently of the one who wrote it, its findings are fixed, and it is merged once CI is green.

## Working mode

As in [plan.md](plan.md#working-mode): `main` stays green, cores are built test-first, the contract is written before the code that implements it — [file-format.md](file-format.md) for what lands on disk, a document of its own for a new interface — new terms go into the glossary the moment they are settled, and hard-to-reverse decisions get an ADR, written as `proposed`. Every part ends in the running app or, for a part without a window, in the terminal, checked against its *done when*.

## Parts

The order follows the roadmap: what a first-time user meets at once comes first, then what carries the tool into teams, then the items under Later, cheapest and most independent first. Translations come late on purpose — every part before them adds texts; the two parts after them bring their German texts with them.

### Part 1 — Licence and name

- `LICENSE` (MIT), the `license` field of every package, and the two ADRs.
- The product is called Softarch Suite wherever it names itself: the window, the app's `productName`, its texts, the README; the Decisions glossary and the file format say "the Decisions module" where they said "ADR Tool".
- [vision.md](vision.md) no longer says that a Component without children shows its Source Files: since part 8 of Structure it shows its directories.

*Done when:* nothing outside `docs/adr/`, the fixtures and the history of the plans calls the product ADR Tool, and the window's title reads Softarch Suite.

### Part 2 — The known gaps before the first release

The three gaps of v1 that a first-time user can meet at once (roadmap, "Known gaps of v1").

- **Images with relative paths.** The main process serves files from below a repository's root through a protocol of its own, and nothing else: images only, by their extension, a path that leads out of the root — with `..`, absolute, or through a symbolic link — is refused. The renderer rewrites a relative image source of an ADR into that protocol, relative to the ADR's file. Security-relevant: its own review checks the refusals.
- **A Metadata dialog with very many Relations** keeps inside the window: its lists scroll in an area of their own, and a picker's matches still hang out over its edge.
- **Closing the window** asks about an open Metadata dialog with changes and about a title typed into the New ADR dialog, as it asks about unsaved text in the editor.

*Done when:* an ADR with `![](diagram.png)` next to it shows the image, and `![](../../../etc/passwd)` shows nothing and reads nothing; a Metadata dialog with forty Relations fits a window of 800 pixels; closing the window over a changed Metadata dialog asks first.

*Status (2026-11-02):* built. The protocol is `adr-asset://<repository>/<path>` (`packages/app/src/main/assets.ts`): it answers with an image by its extension from below the root of an open repository, and with the same 404 for everything else — another kind of file, `..`, an absolute path, a symbolic link inside the repository that points out of it, a slash hidden in an encoded segment, a repository that is not open (`packages/app/test/assets.test.ts`). The renderer rewrites the sources of images after the sanitizer and drops every other one before any request is made — one that leads out of the repository, and one with a scheme, a host (`//host/x.png`, which a page loaded from a file reads as a network share) or a backslash (`packages/app/test/markdown.test.ts`). The main process checks the type by the name of what a symbolic link leads to as well, and streams the image from the file it has checked and opened, never more of it than it had then. In the running app, on a copy of the showcase log: `![…](replica.png)` next to ADR 0007 is shown, 360 pixels wide, and `![…](../../../../../etc/passwd)` and `![…](//evil.example/share/x.png)` have no source. The Metadata dialog of an ADR that relates to forty others is 760 pixels high in a window of 800, its lists scroll between title and buttons, and a picker's matches stand over the edge of the lists — placed in the window, above the field where the space below is short — follow the field when a pick makes the list above it longer, and are hidden while the field is scrolled out of sight. Closing the window with a Relation picked asks "Discard what you entered?"; "Keep editing" keeps window and dialog, "Discard and close" closes; a change that was still being planned when the question came up gives way to it, and is dropped. The Mac stays as the roadmap has it.

### Part 3 — The live editor, light form

Editor mode 3 (roadmap, "Before the first public release"): headings, emphasis, links, lists and code are rendered inline where the cursor is not; the line or block the cursor is in shows its source. Tables stay source until part 11. The text is the same text — the mode decorates, it never writes — so a save writes exactly what mode 1 would.

*Done when:* an ADR edited in the live mode saves the same bytes as the same keystrokes in the source mode, and a heading, a bold word, a link, a list and a code block read as rendered while the cursor is elsewhere.

*Status (2026-11-02):* built. The editor's third mode is called Live. What it does to the text is one function, `liveMarks` (`packages/app/src/renderer/src/lib/live.ts`), read from the syntax tree of the editor: which marks it hides — of ATX and setext headings with their space, of emphasis, strikethrough, inline code, links with their target (a `[label]` only where the label is defined), quotes, the backslash of an escape, the fences of a code block, a rule — where a bullet stands for a list mark, and how a line or a span looks (`packages/app/test/live.test.ts`). Every line a selection touches shows its source, and all of a construct while one of its lines does; tables, images, bare URLs and task markers stay source. A hidden range never crosses a line break — the editor would refuse it — and a test checks that for every line of a corpus with the cursor on it. The editor only decorates: it keeps the same document, so a save writes what is in it. In the running app, on a copy of the showcase log, the same keystrokes typed into ADR 0008 in the live mode and in the source mode saved the same bytes; with the cursor elsewhere, the heading, a bold word, inline code, a link and the list read as rendered.

### Part 4 — `adr lint`

The first follow-up after v1 (roadmap, "Next"): a command line for CI, built on `core`, in a package of its own (`packages/cli`). Its contract is a document of its own, `docs/cli.md`.

- `adr lint [path]` finds the Decision Logs of a repository as the app does, checks them, prints each Problem with its file and line, and exits with 1 when there is one. `--format json` for machines.
- The wording of Problems moves from the app into `core`, so that the app and the command say the same, and every Problem has a code.
- The known gap that goes with it: a Status outside the five values voids the ADR's Relations, and what that causes on other ADRs is grouped under that root cause.
- This repository's CI runs `adr lint` on itself.

*Done when:* `adr lint` on the fixture `broken` lists its Problems and exits with 1, on this repository it exits with 0, and CI fails when an ADR of this repository gets a broken Relation.

*Status (2026-11-02):* built. `packages/cli` holds `adr`; `pnpm build` bundles it with both cores into one file, `packages/cli/dist/adr.mjs`, that Node.js runs with nothing beside it. Its contract is [cli.md](cli.md): text, `--format json` and `--format github`; exit 0, 1, or 2 when nothing could be checked — a repository without a Decision Log among them, so that a pipeline in the wrong directory does not pass. It reads through a file system of its own that never writes and never leaves the repository; the kernel keeps no disk access, as before. `core` has three new pieces: the wording of every Problem, moved from the app (`problems/wording.ts`), so that window and command say the same; the code of every Problem, which is its kind, and a compiler check that none is missing; and where a Problem is, file and line (`problems/locate.ts`, `packages/core/test/problem-place.test.ts`). A Status outside the five values is a root cause like frontmatter that cannot be read: what it voids is listed under it, in the app and by the command, and is not repaired on its own (`packages/core/test/group-problems.test.ts`). In the terminal: on the fixture `broken` the command lists ten Problems with their lines and exits with 1; on this repository it prints "No Problems in 1 Decision Log." and exits with 0; on a copy of this repository's log with `depends-on: [0099-gone]` in ADR 0003 it exits with 1 (`packages/cli/test/lint.test.ts`). CI runs it on this repository after the build, with `--format github`. The review of the part changed four things: a Status outside the five values is a root cause only where it is read as none of them, and only for what it voids — a Back-reference to an ADR that carries no such Relation stays a Problem of its own, with its Repair; the file system of the command — and of the app, which had the same gap — resolves symbolic links and stays inside the repository, and leaves out what it cannot read with a word on standard error; text output keeps each Problem on one line, `--format github` names files from the checkout; and lines are looked for where the Metadata is written, never in the text below a frontmatter. The app now names a Problem of the configuration above its panes while the other logs load, as the command counts it. In the running app, on a scratch repository with `status: approved` on an ADR that supersedes another, the Problems view shows two Problems — the Status, with the two it voids under it — as the command does.

### Part 5 — More foreign formats

MADR 2.x in full and log4brains (roadmap, "Next"), each with its reader and its Migration, written into [file-format.md, section 8](file-format.md#8-foreign-formats) first; with them the known gaps of the foreign formats: the header of a MADR file names the sign that applied, a Status section that Migration leaves is named by everything that keeps it, and adr-tools links with words other than supersede and amend are read as `relates-to`.

*Done when:* a fixture of each format opens with every Status and Relation it states, and its Migration previews a change that reads back as the same Decision Log.

*Status (2026-11-02):* built. A file without a `status` key whose first list under the title has an item `Status` or `Deciders` is read as MADR 2 or log4brains (`packages/core/src/foreign/madr-list.ts`): the Status from the list — log4brains' `draft` as `proposed`, "superseded by" as for MADR —, Deciders as one value of `decision-makers`, log4brains' Tags split as it splits them, and the links of a `## Links` section by the words of adr-tools, with `Relates to` among them. Migration writes a frontmatter with all of it, takes the items it read out of the list — the list as a whole when nothing is left — and the Links section when the Metadata holds every line of it; what keeps a section, a Status section of adr-tools included, is named in full in the preview. adr-tools links with other words are `relates-to`, and the line stays. The header of a foreign ADR names the signs that applied (`foreignSigns`), and a Problem in a Links section points at its line. Two fixtures, `madr-2` and `log4brains` (date-named files, `index.md` and the template beside them), open with every Status, Relation, Deciders and Tags they state, and their Migration — like those of `madr` and `adr-tools`, whose goldens gained the `relates-to` lines and MADR 2's file — reads back as the same Decision Log (`packages/core/test/migrate.test.ts`, `madr-2.test.ts`). The review of the part, with a random round trip through some 6,000 generated logs, changed these things:
- Migration no longer fails for a whole log when the list and a Links section at the end of a file are both taken out; what goes is joined where it meets.
- An item that runs on, as Markdown reads it — nested items, a code block, a line right under it — stays in the text, and so do both items of a name the list has twice.
- A paragraph right above the list is not joined to the one after it.
- The template's commented `## Links <!-- optional -->` and a comment behind a link are read.
- A link with other words is a Relation only when it names an ADR, and adr-tools Status text with a link in it (`Deprecated, see …`) is Status text.
- A draft with `decided` in its frontmatter is the same Problem before and after Migration.
- A Problem of a MADR 2 file points at its line also without a Status item.
- Long files cost their length.
- The header names the item, Status or Deciders, that applied.

### Part 6 — Relations across Decision Logs

Written as `<log>/<ID>`; a bare ID keeps meaning "same log" (roadmap, "Later"). The format is extended first. Back-references are written across logs as within one, Renumber rewrites what other logs say about the renumbered ADR, the picker offers the ADRs of the other logs, and the Relations graph draws an ADR of another log as a guest.

*Done when:* an ADR of `docs/decisions` that supersedes one of `docs/adr` is accepted through the preview, both files read correctly without the tool, and no Problem is left.

*Status (2026-11-02):* built. [file-format.md, section 3](file-format.md#3-metadata) says how a Relation or a Back-reference names an ADR of another log: `<log>/<ID>`, the log being its directory from the root of the repository, and a reference to the own log with its directory is the bare ID. `core` reads every log of a repository first and then checks each one with the others' ADRs at hand (`packages/core/src/log/load.ts`): a `DecisionLog` carries them as `guests`, without their text, and its Relations include those that come in from them. A Problem is reported in the log of the ADR it is about — a missing Back-reference on the superseded ADR, in its own log, with its Repair writing the reference to the other log. Accept writes the Back-reference into the other log's file, and refuses what the other log's ADR does not allow; the Metadata dialog and Create name ADRs of other logs, and a reference that is in no log is refused with the repository named; Renumber rewrites what other logs say about the renumbered ADR (`packages/core/src/relations/reference.ts`, `packages/core/test/cross-log.test.ts`). The app shows the other log in front of the number wherever an ADR of it appears — Relations of an ADR, the picker of the Metadata dialog, a cycle in Problems — and goes there on a click; the Relations graph draws it with a dashed border. In the running app, on a scratch repository with the logs `docs/adr` and `docs/decisions`: accepting ADR 0001 of `docs/decisions`, which supersedes ADR 0002 of `docs/adr`, previews two files, writes `status: accepted` and `decided` into the one and `status: superseded` and `superseded-by: [docs/decisions/0001-events-between-services]` into the other, and leaves no Problem in either log. The review of the part changed these things:
- A reference to the own log written with its directory is the bare ID everywhere: Renumber rewrites it and refuses an ADR that names itself so, a Repair takes it out as written, Edit Metadata and Create write the bare ID and name an ADR once.
- What follows from an ADR of another log whose frontmatter or Status cannot be read is listed under that ADR, in the log it shows up in, and is not repaired on its own; `adr lint` lists it under the root cause and counts it once.
- A cycle of `supersedes` through three or more logs is found.
- A log at the root of the repository is named `./<ID>`.
- Renumber looks for whole references in a file it cannot read.

### Part 7 — git write: commit an ADR

"Commit this ADR" (roadmap, "Later"): the files of one ADR are staged and committed with a message the user sees and can change; nothing else that is staged or changed is taken along, and a push is not part of it. The first time the suite writes to git, so an ADR.

*Done when:* in a scratch repository with other changes, committing an ADR commits that ADR's file and nothing else.

*Status (2026-11-02):* built. [ADR-0012](adr/0012-committing-an-adr-runs-git-commit-for-its-files-only.md) records how: `git commit --only -- <files>` with the system's git, so that everything else that is staged stays staged and git runs the hooks and the signing that are configured; a file git does not know yet is announced with `--intent-to-add` and taken back out when the commit fails (`packages/app/src/main/git.ts`, `commitFiles`). The main process plans the commit (`main/commit.ts`): the ADR's file as the last commit has it and as it is now, the file it had before a Renumber that git has not seen as a rename yet, and — offered and chosen — the changed files of the ADRs it names or that name it, since Accept writes the Back-reference into the superseded ADR. It proposes a message from what happened to the ADR — `Accept ADR 0012: …`, `Propose …`, `Renumber ADR 0011 to 0012: …` — and the person can change it. The renderer sends back only which offered files to take and the message; a file that changed since the preview is not committed. The detail of an ADR with uncommitted changes has a **Commit** button; the dialog shows the files with their diffs and git's own words when it refuses (`packages/app/test/commit.test.ts`: other staged and changed files stay as they were, a Renumber is committed as a rename, a refusing hook leaves the index as it was). In the running app, on a scratch repository with a changed file, a staged file and an untracked one: accepting ADR 0001 of `docs/decisions` and committing it without the offered ADR it supersedes made a commit `Accept ADR 0001: Events between services` with that one file; the three other files stayed changed, staged and untracked, the superseded ADR stayed uncommitted, and the sidebar counted one uncommitted ADR.

### Part 8 — Branch overview

`proposed` ADRs on branches that are not checked out, read from git without checking anything out, and a warning when a number is already taken on another branch (roadmap, "Later").

*Done when:* in a scratch repository with a branch that adds ADR 0010, the branch overview lists it, and creating ADR 0010 on `main` warns about it.

### Part 9 — MCP server

Agents get first-class access on top of `core` (roadmap, "Later"; vision, principle 5): reading Decision Logs, ADRs and Problems, searching, and every write operation as a change set that the agent sees before it applies it. A package of its own, `packages/mcp`, speaking over stdio; its contract in `docs/mcp.md`.

*Done when:* an MCP client lists this repository's ADRs, reads one, and creates a new ADR through a previewed change set that reads back as the app would have written it.

*Status (2026-11-02):* built. [ADR-0013](adr/0013-agents-write-adrs-through-the-mcp-server-as-previewed-change.md) records how; the contract is [docs/mcp.md](mcp.md). `packages/mcp` is one file, `dist/adr-mcp.mjs`, that serves one repository on standard input and output. It speaks the protocol itself — `initialize`, `ping`, `tools/list`, `tools/call`, versions 2024-11-05 to 2025-11-25 — and its tools check their arguments against their input schemas (`src/protocol.ts`, `src/schema.ts`). Seven tools read: the Decision Logs, the ADRs of a log, one ADR with its Relations, Problems and body, a search, the Problems with their Repairs, the Templates and the declared Components. Six plan, with `core`, exactly the operations the app plans — a new ADR, a decision, an edit of the body or of the Metadata, a Repair, a Migration — and answer with the change set as unified diffs and its warnings, writing nothing; `apply_change` writes a planned change unless a file it touches changed since, and `discard_change` drops it. Only `apply_change` is annotated as writing. It writes below the directory it serves only, with the rules of the app's main process (`src/files.ts`). The tests talk to it through the reference client of the protocol, `@modelcontextprotocol/sdk` (`packages/mcp/test/server.test.ts`): on a copy of this repository's Decision Log the client lists the ADRs, reads one, plans "Agents reach the Decision Logs over MCP", and after `apply_change` the file is byte for byte what `core`'s `planCreate` gives the app on the same day with the default Template. Run as a process with the reference client's stdio transport against this repository, it listed the twelve ADRs, read ADR-0012 and planned ADR 0013 as a diff; ADR-0013 itself was then created, written, tagged and accepted through the server, each step planned and applied.

### Part 10 — Export

A read-only export for readers who do not use the tool (roadmap, "Later"): a static site of one or every Decision Log — an index by Status, one page per ADR with its Relations as links, nothing that needs a server — from `core`, offered by the app and by `adr export`; a PDF of the same pages from the app.

*Done when:* the export of this repository opens from disk in a browser with working links between ADRs, and the PDF has one ADR per page.

### Part 11 — Timeline, Kanban, dashboard; tables in the live editor

The views under Later: a timeline of the ADRs by the dates they were created and decided, a board by Status whose moves are the operations of the tool with their previews, and a dashboard of a Decision Log — counts by Status, Problems, how long proposed ADRs have waited, the Components the ADRs affect. With them the live editor renders tables.

*Done when:* each view opens on the showcase log and says what the list says; moving a proposed ADR to accepted on the board is an Accept through its preview; a table in the live mode reads as a table while the cursor is outside it.

### Part 12 — Translations

The window in German as well as English (roadmap, "Later"), chosen from the system's language with a setting to override it. What `core` still says in sentences — refusals, warnings of a change, the details of Problems, why a foreign file has no Migration — gets codes first, so that the window can say all of it in either language.

*Done when:* the app in German shows no English text in the Decisions module and the Structure module, and `adr lint` keeps its English output.

### Part 13 — Aggregation across repositories

The repositories open in the window, seen together (roadmap, "Later"): one search, one list and one Problems view across them, and Relations that cross repository boundaries, written in a form the format defines first.

*Done when:* with two repositories open, a search finds ADRs of both, and an ADR that relates to one in the other repository reads as such in both.

### Part 14 — The remaining known gaps

What the roadmap keeps under "Later, when a repository shows the need": a change set that stays atomic across a failing disk, the history dialog following the files while it is open, a search that folds "ß" to "ss", and a Relations graph that zooms, filters by Relation type and is read out to a screen reader.

*Done when:* each of them has its test, and the roadmap lists no known gap that this plan did not close or defer on purpose.

## Status

The status of each part is recorded under it as it is merged.
