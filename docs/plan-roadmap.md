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

### Part 4 — `adr lint`

The first follow-up after v1 (roadmap, "Next"): a command line for CI, built on `core`, in a package of its own (`packages/cli`). Its contract is a document of its own, `docs/cli.md`.

- `adr lint [path]` finds the Decision Logs of a repository as the app does, checks them, prints each Problem with its file and line, and exits with 1 when there is one. `--format json` for machines.
- The wording of Problems moves from the app into `core`, so that the app and the command say the same, and every Problem has a code.
- The known gap that goes with it: a Status outside the five values voids the ADR's Relations, and what that causes on other ADRs is grouped under that root cause.
- This repository's CI runs `adr lint` on itself.

*Done when:* `adr lint` on the fixture `broken` lists its Problems and exits with 1, on this repository it exits with 0, and CI fails when an ADR of this repository gets a broken Relation.

### Part 5 — More foreign formats

MADR 2.x in full and log4brains (roadmap, "Next"), each with its reader and its Migration, written into [file-format.md, section 8](file-format.md#8-foreign-formats) first; with them the known gaps of the foreign formats: the header of a MADR file names the sign that applied, a Status section that Migration leaves is named by everything that keeps it, and adr-tools links with words other than supersede and amend are read as `relates-to`.

*Done when:* a fixture of each format opens with every Status and Relation it states, and its Migration previews a change that reads back as the same Decision Log.

### Part 6 — Relations across Decision Logs

Written as `<log>/<ID>`; a bare ID keeps meaning "same log" (roadmap, "Later"). The format is extended first. Back-references are written across logs as within one, Renumber rewrites what other logs say about the renumbered ADR, the picker offers the ADRs of the other logs, and the Relations graph draws an ADR of another log as a guest.

*Done when:* an ADR of `docs/decisions` that supersedes one of `docs/adr` is accepted through the preview, both files read correctly without the tool, and no Problem is left.

### Part 7 — git write: commit an ADR

"Commit this ADR" (roadmap, "Later"): the files of one ADR are staged and committed with a message the user sees and can change; nothing else that is staged or changed is taken along, and a push is not part of it. The first time the suite writes to git, so an ADR.

*Done when:* in a scratch repository with other changes, committing an ADR commits that ADR's file and nothing else.

### Part 8 — Branch overview

`proposed` ADRs on branches that are not checked out, read from git without checking anything out, and a warning when a number is already taken on another branch (roadmap, "Later").

*Done when:* in a scratch repository with a branch that adds ADR 0010, the branch overview lists it, and creating ADR 0010 on `main` warns about it.

### Part 9 — MCP server

Agents get first-class access on top of `core` (roadmap, "Later"; vision, principle 5): reading Decision Logs, ADRs and Problems, searching, and every write operation as a change set that the agent sees before it applies it. A package of its own, `packages/mcp`, speaking over stdio; its contract in `docs/mcp.md`.

*Done when:* an MCP client lists this repository's ADRs, reads one, and creates a new ADR through a previewed change set that reads back as the app would have written it.

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
