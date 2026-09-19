# File format

The on-disk contract of ADR Tool: what an ADR file looks like, which parts the tool owns, and what each operation writes. `core` implements exactly this document, `adr lint` will check against it, and an agent or a person who follows it can write valid ADRs without the app.

Vocabulary follows [CONTEXT.md](../CONTEXT.md). The reasons behind the contract are in [ADR-0002](adr/0002-never-reserialize-markdown.md) and [ADR-0003](adr/0003-on-disk-contract.md).

The overriding rule: **the tool never changes a byte it was not asked to change.** Everything below that says "the tool writes" means it writes that, and nothing else in the file moves.

## 1. Decision Logs and files

A **Decision Log** is a directory. Every `.md` file directly inside it whose name follows the log's naming scheme is an ADR; other files (a `README.md`, an index, a template) and subdirectories are ignored.

### Naming schemes and IDs

| Scheme       | File name           | Example                         |
| ------------ | ------------------- | ------------------------------- |
| `sequential` | `NNNN-slug.md`      | `0003-postgres-write-model.md`  |
| `date`       | `YYYYMMDD-slug.md`  | `20260919-postgres-write-model.md` |

- The **ID** of an ADR is its file name without `.md`. IDs are compared exactly, including case, and are unique within their Decision Log.
- In a `sequential` log the leading digits are the ADR's **number** (at least four digits, zero-padded; "ADR-3" is `0003`). Two ADRs with the same number are a Problem, solved by Renumber.
- In a `date` log the leading eight digits are a calendar date. Several ADRs may share a date; their slugs tell them apart.
- A log's scheme comes from `.adr/config.yml`. Without configuration it is detected: if every numeric prefix in the directory is a valid eight-digit date the log is `date`, otherwise `sequential`. An empty log is `sequential`.
- The tool writes slugs in lowercase ASCII letters, digits and dashes. It reads any slug.
- An ID is frozen when the ADR is created. Changing the title does not rename the file. Only Renumber changes an ID.

### Bytes

- Files are UTF-8. A byte order mark is tolerated and preserved; the tool never adds one.
- **Line endings are preserved.** A file's line ending is that of its first line break. Lines the tool inserts use that ending; existing lines are left alone even if the file mixes endings. A file without any line break counts as LF.
- A new file uses the line ending that most ADRs in its Decision Log use, LF if there are none.
- Whether a file ends with a newline is left as it is.

## 2. Structure of an ADR file

```
---                 ← optional frontmatter: the Metadata
status: accepted
---
                    ← body: free Markdown, owned by the author
# Title

Text …
```

- Frontmatter is present if the very first line is `---`. It ends at the next line that is `---`. Trailing spaces or tabs on these two lines are tolerated.
- Everything after the closing line is the body. A file without frontmatter is all body — and still a valid ADR.
- The frontmatter must be a YAML mapping without duplicate keys. If it is not, or if the closing `---` is missing, that is a Problem: the ADR is still listed and its text shown, but the tool refuses to write Metadata to the file until a person has fixed it.

## 3. Metadata

No key is required. A file with no Metadata at all is an `accepted` ADR with no Relations.

| Key               | Value                                        | Written by                          |
| ----------------- | -------------------------------------------- | ----------------------------------- |
| `status`          | `proposed`, `accepted`, `rejected`, `deprecated` or `superseded`, lowercase | create, Accept, Reject, Deprecate, and Accept of a superseding ADR |
| `created`         | date                                         | create                              |
| `decided`         | date                                         | Accept, Reject                      |
| `decision-makers` | list of free-text strings                    | the author, through the app         |
| `tags`            | list of free-text strings, compared exactly  | the author, through the app         |
| `supersedes`      | list of IDs                                  | Supersede                           |
| `amends`          | list of IDs                                  | Amend                               |
| `depends-on`      | list of IDs                                  | the author, through the app         |
| `relates-to`      | list of IDs                                  | the author, through the app         |
| `superseded-by`   | list of IDs — a Back-reference               | Accept of the superseding ADR       |
| `amended-by`      | list of IDs — a Back-reference               | Accept of the amending ADR          |
| `corrections`     | list of `{ date, author, note }`; `date` is required, `author` and `note` are optional | Correction |

Rules:

- **Absent means default.** A missing `status` is `accepted`. A missing list is empty. The tool removes a key rather than leaving an empty list behind.
- **Dates** are calendar dates, `YYYY-MM-DD`, written unquoted. Quoted dates are read too. There are no times.
- `decided` must not be present while the Status is `proposed`.
- **IDs in Relations** are bare IDs of ADRs in the same Decision Log — `0003-postgres-write-model`, not `ADR-3`, not a path, not a Markdown link.
- **Lists** may be written in flow style (`[a, b]`) or block style; both are read, and a single value where a list is expected is read as a list of one. The tool keeps the style a list already has. It writes new lists in flow style, and `corrections` in block style.
- **New keys** are inserted in the order of the table above, relative to the tool's keys that are already there. Existing keys are never reordered.
- **Foreign keys** — any key not in the table — belong to whoever wrote them. They are preserved byte for byte, together with their comments and blank lines, and never moved.
- `corrections` is in chronological order; the tool appends.

## 4. Body

- The body is the author's. The tool changes it in exactly one situation: Migration of a foreign ADR may remove a `## Status` section whose content was captured completely in the Metadata, and shows the diff first.
- The **title** is the text of the first level-one ATX heading (`# …`) in the body that is not inside a code block. An ADR without one is shown under its ID.
- A new ADR gets its body from a Template.

## 5. What each operation writes

"Has been accepted" below means the Status is `accepted`, `deprecated` or `superseded`.

| Operation  | In the ADR itself                                   | In other files |
| ---------- | --------------------------------------------------- | -------------- |
| Create     | new file; `status: proposed`, `created`; for Supersede or Amend also `supersedes` or `amends` | nothing |
| Accept     | `status: accepted`, `decided`                       | every `supersedes` target: `status: superseded`, this ID added to `superseded-by`; every `amends` target: this ID added to `amended-by` |
| Reject     | `status: rejected`, `decided`                       | nothing |
| Deprecate  | `status: deprecated`                                | nothing |
| Correction | the author's edit of the body, plus one entry appended to `corrections` | nothing |
| Renumber   | the file is renamed                                 | every Relation and Back-reference that names the old ID is rewritten |

- Supersede may target an ADR that is `accepted` or `deprecated`; Amend only one that is `accepted`.
- A Relation on an ADR that is `proposed` or `rejected` has no effect on its target. The app may show it as pending; nothing is written.
- An effect stays when the ADR that caused it is later deprecated or superseded itself.

### Consistency — what counts as a Problem

- A Relation or Back-reference that names an ID which does not exist in the Decision Log, or the ADR's own ID.
- A `supersedes` or `amends` Relation on an ADR that has been accepted, without the matching Back-reference on its target — or a Back-reference without such a Relation. The Relation is authoritative; the repair rewrites the Back-reference.
- An ADR that is `superseded` although no ADR that has been accepted supersedes it, or the reverse.
- A cycle of `supersedes` Relations.
- Two ADRs with the same number in a `sequential` log.
- Metadata that breaks section 2 or 3: invalid YAML, a Status outside the five values, a malformed date, a value of the wrong type, `decided` on a `proposed` ADR.

## 6. Finding Decision Logs

The tool looks, in this order, and stops at the first step that yields something:

1. `.adr/config.yml` in the repository root.
2. `.adr-dir` in the repository root — adr-tools' file holding the relative path of its directory.
3. The directories `docs/adr`, `doc/adr` and `docs/decisions`; each one that exists is a Decision Log.
4. Nothing found: the app asks, and the answer is written to `.adr/config.yml`.

Opening a repository never writes. `.adr/` is created the first time something has to be configured.

```yaml
# .adr/config.yml
logs:
  - path: docs/adr
    naming: sequential    # or: date; optional, detected when absent
```

Further keys arrive with Templates and are specified then.

## 7. Foreign formats

ADRs written by adr-tools and in MADR 3/4 are recognized and read tolerantly — Status in a `## Status` section or a `status:` key in other spellings, "superseded by" in its various forms, unknown Status values shown as written. The tool never writes these formats. The first time it is asked to modify such an ADR it offers Migration into the format above. The mapping is specified here when the readers are built; what is known about the formats is in [the survey](research/adr-format-survey.md).

## 8. Examples

The smallest valid ADR:

```markdown
# Use Postgres for the write model

We need transactions across aggregates, and the team runs Postgres already.
```

An ADR using most of the Metadata:

```markdown
---
status: accepted
created: 2026-03-02
decided: 2026-03-09
decision-makers: [Kim Becker, Alex Roth]
tags: [persistence]
supersedes: [0001-sqlite-for-everything]
depends-on: [0002-event-sourced-orders]
amended-by: [0009-postgres-for-read-model]
corrections:
  - date: 2026-09-19
    author: Kim Becker
    note: Spelling
# a foreign key: preserved, never touched
nav_order: 3
---

# Postgres for the write model

We use Postgres …
```
