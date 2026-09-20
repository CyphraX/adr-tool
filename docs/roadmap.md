# Roadmap

Records what was deliberately left out of v1, so that it does not drop out of focus.
Agreed in the design session of 2026-09-19. Vocabulary follows [CONTEXT.md](../CONTEXT.md).

This is the plan of the ADR tool, which becomes the Decisions module of a larger suite; where the project as a whole is heading is in [vision.md](vision.md).

## v1

- Desktop app (Electron + Svelte 5 + TypeScript) for Windows, macOS and Linux, plus the UI-free `core` package it is built on
- UI in English; strings externalized so translations can follow
- Browse: ADR list, detail view, Relations graph; one tab per repository; every Decision Log of a repository listed in the sidebar
- Write: new ADR from a Template; Accept, Reject, Deprecate; Amend and Supersede; Correction; Renumber
- Relations stay within one Decision Log
- Editor modes: Markdown source, and source with live preview
- Search: instant full text over number, title and body, plus quick jump
- Problems view: broken Relations, inconsistent Back-references, duplicate numbers, invalid Metadata — each with a repair action
- git: read-only (history, author, date, diff, uncommitted-changes indicator, current branch)
- Foreign formats, read tolerantly and offered for Migration: MADR 3/4, adr-tools
- A documented file format, so that agents and people can write valid ADRs without the app

## Before the first public release

- Editor mode 3, the live editor, in its light form: headings, emphasis, links, lists and code are rendered inline; tables stay source
- Licence and business model (open source or commercial). Until that is decided the app stays local-only: no backend, no accounts, no telemetry
- Distribution: installers for all three platforms, code signing, auto-update
- Final product name; the working title is Softarch Suite (see [vision.md](vision.md))
- Three known gaps of v1 that a first-time user can meet at once (see "Known gaps of v1" below): images with relative paths, the Metadata dialog that can outgrow the window, and the dialogs the window closes over without asking

## Next — the first follow-ups after v1

1. **`adr lint` CLI for CI.** Checks that Metadata is valid, that Relations and Back-references are consistent, and that no numbers collide. Built on `core`; this is what carries the tool into teams.
2. **More foreign formats:** the rest of MADR 2.x and log4brains (v1 reads their Status, from the list under the title, and nothing else).

## Later

- MCP server, so agents get first-class access on top of `core`
- git write: a "commit this ADR" convenience (stage and commit, possibly push)
- Branch overview: `proposed` ADRs on branches that are not checked out, and a warning when a number is already taken on another branch
- Relations across Decision Logs, written as `<log>/<ID>`; a bare ID keeps meaning "same log"
- Live editor: table rendering
- UI translations. The app's own texts are in two modules of the renderer and one of the main process, ready to be replaced. `core` still answers in English sentences — why it refuses an operation, what a change warns about, what is wrong with a piece of Metadata, why a foreign file has no Migration — and so does the wording of Problems once it has moved to `core` for `adr lint`; both need codes before the window can be translated whole
- Read-only export for non-technical readers (static site or PDF)
- ADR → code links ("which ADRs affect this file?")
- Aggregation across repositories, including Relations that cross repository boundaries
- Timeline, Kanban by Status, dashboards

## Known gaps of v1

Found while the milestones were built, written down in [plan.md](plan.md), and looked at one by one in the v1 acceptance of 2026-09-20. Two were closed there (the window asks before it closes on unsaved text; the panes can be resized). The rest was left on purpose, and this is where each one waits.

Before the first public release:

- **Images with relative paths in an ADR do not load.** The renderer has no file access, by design: an ADR is untrusted input. It needs a protocol of its own in the main process that serves files from below the repository's root and nothing else — security-relevant, so it gets its own pull request and review.
- **A Metadata dialog with very many Relations can grow taller than the window.** The dialog lets a picker's matches hang out over its edge, so it cannot simply scroll; the lists need their own scrolling area.
- **Closing the window asks about unsaved text in the editor, not about an open Metadata dialog or a title typed into the New ADR dialog.** What is lost there is a few picks or a line, never a paragraph — but it is lost without a word. And quitting on a Mac with unsaved text has to be run once on a Mac.

With `adr lint`, because `core` has to say it first:

- Problems are grouped under a root cause only when frontmatter cannot be read at all. A file that can be read but has a Status outside the five values voids its Relations, and what that causes on other ADRs is still listed Problem by Problem.

With more foreign formats:

- The header of a MADR file names all three signs the tool knows the format by, not the one that applied.
- A Status section that Migration leaves in the text is named by the first thing that keeps it only.
- Links in adr-tools files with words other than supersede and amend (`Clarifies`) are not Relations; they stay Markdown links in the text.

Later, when a repository shows the need:

- A change set is not atomic across a failing disk. Renumber renames first, so that the likeliest failure — a file held open by another program — happens before anything is written.
- The history dialog does not follow the files while it is open.
- The search does not fold "ß" to "ss".
- The Relations graph draws one Decision Log, scrolls but does not zoom, has no filter by Relation type, and its lines are not read out to a screen reader (the same Relations are in every ADR's detail). An ADR that very many others build on across many layers makes a tall drawing.
