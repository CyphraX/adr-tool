---
status: accepted
created: 2026-09-19
decided: 2026-09-19
decision-makers: [Philipp Saal]
tags: [file-format]
relates-to: [0002-never-reserialize-markdown]
---

# The on-disk contract: file-stem IDs, tool-owned frontmatter, derived Back-references

ADR files are the only source of truth and must read correctly without the tool — on GitHub, in an editor, by an agent. Three rules follow. An ADR's ID is its file name without extension, frozen at creation, and Relations point to it. The Metadata lives in YAML frontmatter whose keys the tool owns, with one list-valued key per Relation type. A `supersedes` or `amends` Relation is mirrored onto the target ADR as a Back-reference (`superseded-by`, `amended-by`) when the new ADR is accepted; the source side stays authoritative, and the Back-reference is a derived copy that the tool checks and repairs.

## Considered Options

- **Relations stored on the source ADR only, the inverse computed.** No redundancy and no merge conflicts, but someone reading a superseded or amended ADR without the tool cannot see what replaced or extended it. adr-tools, MADR and log4brains all write the supersession pointer into the old file too.
- **Bare numbers as IDs (`0003`).** Shorter, and it matches how people speak ("ADR-3"), but it does not work for date-based logs (`YYYYMMDD-slug.md`), whose convention the tool must follow in foreign repositories. The file stem is one rule for both schemes.
- **Status and links in the body, as in adr-tools' `## Status` section.** Closest to the largest legacy base, but it makes part of the body tool-owned and parsing fragile, and Templates could no longer shape the body freely.

## Consequences

- Two branches that amend the same ADR produce a small merge conflict in its frontmatter. The repair action, and later `adr lint`, resolves it from the authoritative side.
- Renaming a file by hand breaks Relations. Only Renumber may change an ID, and it rewrites every reference.
- A title Correction does not rename the file, so ID and title can drift apart.
- Relations are confined to one Decision Log for now. A qualified form (`<log>/<ID>`) can be added later without breaking bare IDs.
