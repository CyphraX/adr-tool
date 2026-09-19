# Roadmap

Records what was deliberately left out of v1, so that it does not drop out of focus.
Agreed in the design session of 2026-09-19. Vocabulary follows [CONTEXT.md](../CONTEXT.md).

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
- Final product name

## Next — the first follow-ups after v1

1. **`adr lint` CLI for CI.** Checks that Metadata is valid, that Relations and Back-references are consistent, and that no numbers collide. Built on `core`; this is what carries the tool into teams.
2. **More foreign formats:** MADR 2.x and log4brains.

## Later

- MCP server, so agents get first-class access on top of `core`
- git write: a "commit this ADR" convenience (stage and commit, possibly push)
- Branch overview: `proposed` ADRs on branches that are not checked out, and a warning when a number is already taken on another branch
- Relations across Decision Logs, written as `<log>/<ID>`; a bare ID keeps meaning "same log"
- Live editor: table rendering
- UI translations
- Read-only export for non-technical readers (static site or PDF)
- ADR → code links ("which ADRs affect this file?")
- Aggregation across repositories, including Relations that cross repository boundaries
- Timeline, Kanban by Status, dashboards
