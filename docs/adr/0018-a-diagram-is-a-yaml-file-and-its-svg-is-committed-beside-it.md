---
status: accepted
created: 2026-11-02
decided: 2026-11-02
decision-makers: [Philipp Saal]
tags: [diagrams, file-format]
depends-on: [0002-never-reserialize-markdown, 0003-on-disk-contract, 0004-operations-return-change-sets, 0006-one-core-package-per-module-on-a-shared-kernel]
affects: [diagrams]
---

# A Diagram is a YAML file, and its SVG is committed beside it

A Diagram is a picture of the architecture whose elements are Components: it is drawn by a person, it is checked against the code, and it is read on GitHub and in ADRs by people who never open the suite ([vision.md](../vision.md), "4. Diagrams"). Like everything a person makes, it is a file in the repository ([ADR-0003](0003-on-disk-contract.md)); what remained open was what the file looks like, and how its picture reaches those who read the repository without the suite.

A Diagram is a YAML file directly in `docs/architecture/diagrams/` — another directory can be set as `diagrams` in `.arch/config.yml` —, and its ID is its file name without `.yml`. It holds a `title`, a `description`, its `level` (`system-context`, `container` or `component`) with the `scope` of a component view, its `elements` and its `connections`. An element is a Component by its Component ID, an External System or the repository as a box with a name and a description, each at the position `at: [x, y]` and with an optional `size`; a connection has a `from`, a `to` and a `label`. The positions are the layout: the suite keeps them as written and places only what it adds. The file holds nothing the suite computes — no Drift, no suggested connection, no number of Dependencies ([diagrams-format.md](../diagrams-format.md), sections 1 to 4).

The `diagrams` package draws a Diagram as SVG itself, without a browser, and its export writes the picture as `<ID>.svg` beside the file, as a change set that is previewed like any other ([ADR-0004](0004-operations-return-change-sets.md)); an export of a picture that has not changed is an empty change set. The SVG is derived data, and it is committed on purpose: it is the one of the four places in which the vision lets derived data into the repository that belongs to this module ([vision.md](../vision.md), "Stored and derived").

## Considered Options

- **Mermaid, PlantUML or the Structurizr DSL as the file.** The vision keeps a general diagram-as-code editor out. Mermaid and PlantUML have no positions: the engine lays the picture out again, differently with every version, and a person cannot put a box where it belongs. The Structurizr DSL holds a model rather than one picture, and the suite would need a parser and a writer of its own that changes nothing but the lines it means.
- **JSON.** No comments, and a diff of quotes and braces. YAML is what `.arch/components.yml` is written in, a comment beside a box survives, and the ranges of the `yaml` library let the suite change a line without writing the file anew ([ADR-0002](0002-never-reserialize-markdown.md)).
- **The positions in a file of their own.** Two files that have to agree, and moving a box would change a file that says nothing of what the Diagram shows.
- **The SVG not committed**, drawn by the app or by CI when it is needed. GitHub would show no picture, an ADR could not embed one, and a copy of the repository without the suite would have none.
- **The SVG drawn by a browser**, from the canvas of the app. The command line and the MCP server have no browser, and a picture whose text is measured by the fonts of the machine is not the same file on two machines: every export would be a change.
- **Drift drawn into the SVG.** The committed picture would change whenever the code does, and would show as a mistake what the Diagram means on purpose.
- **A file of settings per module** — `.arch/diagrams.yml` for the one directory —, or the setting read by each module on its own. As many files to look in as modules, or as many readers of one file, each with its own Problem when the file cannot be read.

## Consequences

- A Diagram is two files. The picture is stale when the Diagram or the declaration changed and nobody exported it; until a check reports that, an export whose change set is empty is how to tell that it is current. This repository's own picture, `docs/architecture/diagrams/packages.svg`, is tested to be current.
- The picture is deterministic: text is measured by fixed figures per character, not by a font, so that the same Diagram draws to the same bytes everywhere — and text may stand a little narrower or wider than a font draws it. It runs nothing and fetches nothing, escapes every text, has a `<title>` and a `<desc>` for a screen reader, and takes the light or the dark palette from the viewer's setting. Its words are English: a file in the repository has one language, and the window says them in its own (part 7).
- The suite writes into a Diagram only by changing the lines it means — the Repair of an element whose Component is gone now, the editor of part 7 and the Rename of a Component later. The SVG is written as a whole: it is derived, and nobody edits it by hand.
- `diagrams` is a module core as [ADR-0006](0006-one-core-package-per-module-on-a-shared-kernel.md) has them: it depends on the kernel, and on Structure's model, which every other context refers to — through `@adr-tool/structure/model`, the entry without the parsers. The elements of a Diagram are Components, and Drift is measured against Structure's Dependencies ([CONTEXT-MAP.md](../../CONTEXT-MAP.md), "Structure → Diagrams"); Structure knows nothing of Diagrams.
- The directory of the Diagrams is the suite's first setting outside Decisions. It goes into `.arch/config.yml`, beside `.arch/components.yml`: one file for every module, each with a key of its own at the top — `diagrams` for this one ([configuration.md](../configuration.md)). The kernel reads the file for all of them and knows none of the keys; a file it cannot read is one Problem, reported once, and while it stands no module falls back on its default. Each module checks its own key and leaves the others alone.
