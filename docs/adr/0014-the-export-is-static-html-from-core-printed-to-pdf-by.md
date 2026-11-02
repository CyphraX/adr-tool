---
status: accepted
created: 2026-11-02
decided: 2026-11-02
decision-makers: [Philipp Saal]
tags: [export]
---

# The export is static HTML from core, printed to PDF by the app

The people who live with an architecture's decisions do not all open the tool: a product owner, an auditor, a new colleague on their first day. They need the Decision Logs as something to read — linked, by Status, with the Relations of each ADR — and as something to file or print. The roadmap asks for a read-only export, as a static site or a PDF ([plan-roadmap.md](../plan-roadmap.md), part 10).

`core` turns a repository's Decision Logs into a set of HTML pages (`packages/core/src/export`): an index by Status, one page per ADR at the path of its file with `.html` for `.md`, one page that holds every ADR for printing, a style sheet, and a marker file that names what the export wrote. The pages run no script and fetch nothing: Markdown is rendered with the same sanitizing as the app, every page carries a content security policy that allows its own style sheet and images only, and a link to anything the export does not hold is kept as a web link or turned into text. `adr export` and the app's **Export** write them; the app prints the page for printing to PDF in a window nobody sees, one ADR per printed page.

## Considered Options

- **A static site generator** — Docusaurus, MkDocs, log4brains' own. A second build, with its own runtime and theme, for pages the tool can write itself, and none of them knows Relations, Back-references or the Status of a superseded ADR.
- **A PDF only.** What is filed, but not what is read: links between ADRs are the point of a Decision Log, and a PDF of 50 ADRs is read by searching.
- **A PDF library in `core`** (pdfkit, pdfmake). The layout of Markdown would be written a second time, by hand, for one output. Chromium already lays out the same HTML, and the app ships it.

## Consequences

- The export opens from disk, from a file share or from any static web host, in any browser, with nothing to install.
- It is written only into an empty directory, a new one, or one an earlier export wrote and marked; a later export there removes the pages of ADRs that are gone, and nothing else.
- Images an ADR shows are copied when they are files of the repository; nothing is fetched from the web, and an image from elsewhere becomes a link.
- The command line exports HTML only. A PDF needs a browser engine, which the app has and the command line does not bring along; HTML from `adr export` prints to PDF in any browser, with the same page breaks.
