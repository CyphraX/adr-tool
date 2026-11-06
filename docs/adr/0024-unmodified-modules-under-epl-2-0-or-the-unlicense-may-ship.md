---
status: accepted
created: 2026-11-06
decided: 2026-11-06
decision-makers: [Philipp Saal]
tags: [licence, release]
amends: [0010-the-suite-is-open-source-under-the-mit-licence]
relates-to: [0016-mermaid-is-drawn-in-the-renderer-and-exported-as-an-image, 0023-everything-a-release-runs-is-bundled-and-electron-builder]
affects: [app/renderer, cli]
---

# Unmodified modules under EPL-2.0 or the Unlicense may ship beside MIT code

[ADR-0010](0010-the-suite-is-open-source-under-the-mit-licence.md) lists the licences of what the app ships: MIT, ISC, Apache-2.0 and BSD-3-Clause for the code, the SIL Open Font License 1.1 for the IBM Plex fonts, and the notices of Chromium. The notices that release 0.1 writes from its bundle name two more. elkjs 0.9.3 is under the Eclipse Public License 2.0; it lays out Mermaid's `elk` diagrams, and Mermaid brings it. robust-predicates 3.0.3 is under the Unlicense; it comes with d3, through d3-delaunay and delaunator, which Mermaid brings too. The window draws Mermaid blocks with them ([ADR-0016](0016-mermaid-is-drawn-in-the-renderer-and-exported-as-an-image.md)).

So the list of ADR-0010 grows by two. An unmodified third-party module under the EPL-2.0 may ship, as a file of its own beside the MIT code. The window's build puts elkjs into a chunk of its own, which it loads only for a diagram that ELK lays out. Its notice says where its Source Code is: under the EPL-2.0 at https://github.com/kieler/elkjs, tag 0.9.3. The EPL asks that statement of every copy, in whatever form it is distributed (section 3.1(a)), and the notices carry the text of the licence beside it. A module under the Unlicense may ship as well. It puts its code in the public domain and asks nothing.

## Considered Options

- **Leave out ELK.** The window's build could put an empty module in the place of elkjs. A Mermaid block that asks for the `elk` layout would then not be drawn as its author wrote it. The EPL asks little of a copy that is not modified: its licence, and where the source is.
- **Keep the list of ADR-0010 and treat the EPL as an exception, without an ADR.** The notices already ship its text. But ADR-0010 is the list a contributor checks a new dependency against. Its Consequences would say what the installers no longer hold to.
- **Allow weak copyleft in general**: the MPL-2.0, the EPL, the LGPL. One sentence would cover what comes next. But each of them asks something else: the LGPL asks that the library can be replaced in what is shipped. A licence is accepted when a module under it comes, with what it asks written down.

## Consequences

- elkjs is shipped unmodified, in a file of its own. A change to elkjs, or code of the suite in that file, could make it a Modified Work under the EPL, whose Source Code would have to be made available under the EPL as well.
- The notices of a package under the EPL say where its Source Code is (`packages/cli/notices.ts`). A build that bundles another package under the EPL fails until its notice says that too.
- dompurify is under the MPL-2.0 or the Apache-2.0, at the choice of whoever ships it. The suite takes the Apache-2.0, which ADR-0010 lists.
- A new dependency under a licence that neither list names needs an ADR before it ships.
