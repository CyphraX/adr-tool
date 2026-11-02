---
status: proposed
created: 2026-11-02
decision-makers: [Philipp Saal]
tags: [traces, metadata]
depends-on: [0006-one-core-package-per-module-on-a-shared-kernel]
affects: [core/metadata, app/main]
---

# Traces are recorded on the source only, unlike Back-references

An ADR names the Components it affects in its Metadata, under `affects`: the suite's first Trace, from Decisions into Structure. A Relation between two ADRs is mirrored onto its target as a Back-reference, `superseded-by` or `amended-by`, so that each file reads correctly without the tool. A Trace is not mirrored. It is written on the ADR alone, and which ADRs affect a Component is computed whenever it is asked for — on the Component page now, for a Rule or a Finding later. Every Trace to come is kept the same way: a Finding names its evidence, an Exception the ADR that justifies it, and nothing is written into what they point to ([file-format.md](../file-format.md), section 3; [CONTEXT-MAP.md](../../CONTEXT-MAP.md)).

## Considered Options

- **Mirror the Trace onto the Component, as Back-references do.** `.arch/components.yml` would list under each Component the ADRs that affect it, and would read completely without the tool. But a Back-reference records a decision that has been taken: it is written once, when the ADR is accepted, and stays. A Trace is filing and changes at any Status. Every such change would write two files of two modules, the declaration would change with every ADR, and the two copies would be there to disagree — each way with a Problem and a Repair of its own.
- **Record the Trace on the target only.** The declaration would say which ADRs concern a Component. But whoever writes the ADR knows what it affects, while the Component knows nothing of decisions; an ADR could no longer be understood without a file of another module. And a Draft cannot carry anything.
- **A file of Traces of its own**, beside the declaration. One place for all of them, and a third file to keep in step, which neither the reader of an ADR nor the reader of the declaration looks at.

## Consequences

- `.arch/components.yml` alone does not tell which ADRs affect a Component. The suite does, and so does a search for the Component ID over the ADRs.
- A Trace that points nowhere is a Problem of the ADR that carries it. Its Repair takes the item out and never puts one in: where a Component was renamed by hand, only a person knows the new ID.
- Rename rewrites the sources: the declaration and every ADR that names the Component, in one previewed change set. The more kinds of Trace there are — Rules, Diagrams, Findings — the more files one Rename touches. That is the price of each file being readable on its own.
- Traces are checked only against a declaration that can be read. The Draft's IDs follow directories and are no names to write into an ADR; a Component is named once it is adopted.
- The two cores still do not know each other: `core` reads and writes `affects` as text and is told which Component IDs exist, `structure` plans its half of a Rename, and the app puts the two together ([ADR-0006](0006-one-core-package-per-module-on-a-shared-kernel.md)).
