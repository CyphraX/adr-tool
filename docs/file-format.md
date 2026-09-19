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
| `decision-makers` | list of free-text strings                    | Edit Metadata                       |
| `tags`            | list of free-text strings, compared exactly  | Edit Metadata                       |
| `supersedes`      | list of IDs                                  | Supersede; Edit Metadata while `proposed` |
| `amends`          | list of IDs                                  | Amend; Edit Metadata while `proposed` |
| `depends-on`      | list of IDs                                  | Edit Metadata                       |
| `relates-to`      | list of IDs                                  | Edit Metadata                       |
| `superseded-by`   | list of IDs — a Back-reference               | Accept of the superseding ADR       |
| `amended-by`      | list of IDs — a Back-reference               | Accept of the amending ADR          |
| `corrections`     | list of `{ date, author, note }`; `date` is required, `author` and `note` are optional | Correction |

Rules:

- **Absent means default.** A missing `status` is `accepted`. A missing list is empty. The tool removes a key rather than leaving an empty list behind.
- **Dates** are calendar dates, `YYYY-MM-DD`, written unquoted. Quoted dates are read too. There are no times.
- `decided` must not be present while the Status is `proposed`.
- **IDs in Relations** are bare IDs of ADRs in the same Decision Log — `0003-postgres-write-model`, not `ADR-3`, not a path, not a Markdown link.
- **Lists** may be written in flow style (`[a, b]`) or block style; both are read, and a single value where a list is expected is read as a list of one. The tool keeps the style a list already has. It writes new lists in flow style, and `corrections` in block style. It adds an item at the end and takes an item out where it stands; it never reorders a list. A comment inside a flow list, next to the item to take out, belongs to nobody the tool could name: it refuses, and a person removes the item.
- **New keys** are inserted in the order of the table above, relative to the tool's keys that are already there. Existing keys are never reordered.
- **Foreign keys** — any key not in the table — belong to whoever wrote them. They are preserved byte for byte, together with their comments and blank lines, and never moved.
- `corrections` is in chronological order; the tool appends.

## 4. Body

- The body is the author's. The tool changes it in exactly one situation: Migration of a foreign ADR may remove a `## Status` section whose content was captured completely in the Metadata, and shows the diff first.
- The **title** is the text of the first level-one ATX heading (`# …`) in the body that is not inside a code block. An ADR without one is shown under its ID.
- A new ADR gets its body from a Template (section 7).

## 5. What each operation writes

"Has been accepted" below means the Status is `accepted`, `deprecated` or `superseded`.

| Operation  | In the ADR itself                                   | In other files |
| ---------- | --------------------------------------------------- | -------------- |
| Create     | new file; `status: proposed`, `created`; for Supersede or Amend also `supersedes` or `amends` | nothing |
| Accept     | `status: accepted`, `decided`                       | every `supersedes` target: `status: superseded`, this ID added to `superseded-by`; every `amends` target: this ID added to `amended-by` |
| Reject     | `status: rejected`, `decided`                       | nothing |
| Deprecate  | `status: deprecated`                                | nothing |
| Correction | the author's edit of the body, plus one entry appended to `corrections` | nothing |
| Edit Metadata | items added to or removed from `decision-makers`, `tags`, `depends-on`, `relates-to` — and, while the ADR is `proposed`, `supersedes` and `amends` | nothing |
| Renumber   | the file is renamed                                 | every Relation and Back-reference that names the old ID is rewritten |

- Supersede may target an ADR that is `accepted` or `deprecated`; Amend only one that is `accepted`.
- `supersedes` and `amends` are fixed once an ADR is no longer `proposed`: they took effect when it was accepted, or never will. `decision-makers`, `tags`, `depends-on` and `relates-to` can be edited at any Status. Such an edit is not a Correction and leaves no entry in `corrections`: a Correction is about the text of the decision, and these keys are filing, not text. git still shows who changed them.
- An item that is added must be valid — an ID of another ADR in the same Decision Log, and for `supersedes` and `amends` one that may be superseded or amended. An item that is already there can be removed wherever the list may be edited, valid or not: that is how a `depends-on` or `relates-to` Relation to an ADR that does not exist is repaired. A broken `supersedes` or `amends` on an ADR that is no longer `proposed` is not edited here; it is a Problem, and repairing it belongs to the Problems view.
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
4. Nothing found: the repository has no Decision Log yet. The first ADR is created in `docs/adr` (section 7).

Opening a repository never writes. `.adr/` is created the first time something has to be configured.

```yaml
# .adr/config.yml
logs:
  - path: docs/adr
    naming: sequential    # or: date; optional, detected when absent
templates:
  default: madr           # optional; `minimal` when absent
```

## 7. Templates and new ADRs

A **Template** is a Markdown file that gives a new ADR its body. It never contains frontmatter: the Metadata of a new ADR comes from the tool. A Template that starts with `---` frontmatter cannot be used, and the tool says so.

- Templates of a repository live in `.adr/templates/`, one `.md` file each; the file name without `.md` is the Template's name.
- Three Templates are built in: `minimal` (a title and a few sentences), `nygard` (Context, Decision, Consequences) and `madr`. A file of the same name in `.adr/templates/` takes the place of a built-in one.
- `templates.default` in `.adr/config.yml` names the Template that is preselected. Without it, that is `minimal`.
- Three placeholders are filled in when an ADR is created, once and without any logic: `{{title}}`, `{{date}}` (today, `YYYY-MM-DD`) and `{{number}}` (the prefix of the new ID as written, e.g. `0009`).

A new ADR:

- **ID.** In a `sequential` log the number is the highest existing number plus one, padded to four digits or to the widest prefix the log already has. In a `date` log the prefix is today's date. The slug is made from the title: lowercase, German umlauts and `ß` written out (`ä` → `ae`), other accents dropped, everything that is not a letter or a digit turned into a dash, at most 60 characters. A title that leaves no slug is refused, and so is an ID that already exists — the tool does not skip ahead to a free one.
- **Metadata.** `status: proposed` and `created`. An ADR created to supersede or amend another one also carries that Relation; the target must be one that may be superseded or amended (section 5). Nothing is written to the target until the new ADR is accepted.
- **Bytes.** The file uses the line ending most ADRs of its Decision Log use, LF when there are none or on a tie, and has no byte order mark.
- In a repository without any Decision Log, the first ADR is created in `docs/adr`, where the tool finds it again without any configuration.

## 8. Foreign formats

ADRs written by adr-tools and in MADR 3/4 are recognized and read tolerantly — Status in a `## Status` section or a `status:` key in other spellings, "superseded by" in its various forms, unknown Status values shown as written. The tool never writes these formats. The first time it is asked to modify such an ADR it offers Migration into the format above. The mapping is specified here when the readers are built; what is known about the formats is in [the survey](research/adr-format-survey.md).

## 9. Examples

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
