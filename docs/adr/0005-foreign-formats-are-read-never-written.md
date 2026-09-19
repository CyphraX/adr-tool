---
status: proposed
created: 2026-09-20
tags: [core, file-format]
depends-on: [0002-never-reserialize-markdown, 0003-on-disk-contract, 0004-operations-return-change-sets]
---

# Foreign formats are read, never written; Migration writes what was read

Most Decision Logs the tool will ever open were written by adr-tools or in MADR. The tool reads both tolerantly and shows such an ADR like any other — and it never writes either format: every operation that would write to a foreign file is refused, until Migration has rewritten the file into the tool's own format. Migration has no mapping of its own. It writes the Metadata the reader already shows for the ADR, with the writer every other operation uses, as a change set that is previewed first. So the migrated log says what the foreign log said: the same Status, the same Relations, the same Problems.

Three rules follow from it, and the rest of the tool leans on them:

- **Recognition is conservative.** A file is foreign only when it says something the tool's own format cannot: a `## Status` section in a file without frontmatter, a `status` that names a successor, `deciders`. Everything else is an ADR of the tool's own format, whoever wrote it — a MADR file with `status: accepted` and Jekyll's keys is valid as it stands.
- **What another file records about an ADR is not that ADR's Metadata.** MADR notes a supersession on the superseded ADR only. The successor is read as superseding it — next to its Metadata (`impliedSupersedes`), which stays what its own file says — and Migration moves the Relation to where this format keeps it, the successor's `supersedes`. That is the one case in which the tool writes `supersedes` of an ADR that is no longer `proposed`.
- **Nothing is migrated by half.** What cannot be written as it was read is left out and named: a Status kept in the list under the title (the rest of MADR 2 is not read yet), a Status text that would mean something else as a `status`, a value the writer cannot change where it stands — and every ADR whose successor is left out.

## Considered Options

- **Write the foreign formats too.** No Migration would be needed, and a team could keep using adr-tools next to the app. But every operation would exist three times, the formats cannot hold what the operations write (`decided`, `corrections`, Back-references for amendments), and adr-tools' Status section is free text that a byte-preserving writer cannot own.
- **Migrate on open, or silently on the first write.** Convenient, and it breaks the promise that opening a repository never writes and that every change is seen before it is made. A repository that a team only wants to read would be rewritten behind its back.
- **A Migration with a mapping of its own.** The obvious design, and the one that drifts: the reader and the Migration would each interpret a `Superceded by` line, and the first difference between them is a file that reads differently after it was migrated. With one interpretation there is nothing to keep in step, and the test is simple to state.
- **Put the implied supersession into the successor's Metadata.** This was built first. Operations could not tell it from a Relation that is written in the file: Accept of a proposed successor was refused because of a file the ADR never mentions, and a Repair and an edit were offered that wrote nothing.

## Consequences

- A foreign ADR is read-only in the app until it is migrated; the app says so where the write actions would be, and offers Migration for one ADR or for the whole Decision Log.
- The Status section of an adr-tools file is taken out only when the Metadata holds all of it. This is the one edit the tool makes in a body on its own, and it is not a Correction.
- What a Migration wrote is in the team's git history for good. Changing what a reader makes of a format later changes what future Migrations write, never what past ones wrote — one more reason for the readers to guess at nothing.
- A new foreign format costs a reader and, at most, a few lines of Migration; the rest of the tool does not notice.
- The exact rules are in [file-format.md, section 8](../file-format.md#8-foreign-formats).
