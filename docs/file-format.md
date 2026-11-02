# File format

The on-disk contract of the Decisions module of Softarch Suite: what an ADR file looks like, which parts the tool owns, and what each operation writes. `core` implements exactly this document, `adr lint` will check against it, and an agent or a person who follows it can write valid ADRs without the app.

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
- Everything after the closing line is the body. A file without frontmatter is all body — and still a valid ADR. (A file that keeps its Status in its text — in a `## Status` section, or in the list under its title — is read as the foreign format it is: section 8.)
- The frontmatter must be a YAML mapping without duplicate keys. If it is not, or if the closing `---` is missing, that is a Problem: the ADR is still listed and its text shown, but the tool refuses to write Metadata to the file until a person has fixed it.

## 3. Metadata

No key is required. A file with no Metadata at all is an `accepted` ADR with no Relations — unless it is read as a foreign format, which keeps its Metadata elsewhere (section 8).

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
| `affects`         | list of Component IDs — a Trace ([structure-format.md](structure-format.md), section 1) | Edit Metadata; Rename of a Component |
| `superseded-by`   | list of IDs — a Back-reference               | Accept of the superseding ADR       |
| `amended-by`      | list of IDs — a Back-reference               | Accept of the amending ADR          |
| `corrections`     | list of `{ date, author, note }`; `date` is required, `author` and `note` are optional | Correction |

Migration (section 8) writes `status`, `created`, `supersedes`, `amends`, `superseded-by` and `amended-by`, with the values it read from the foreign format, and gives MADR's `deciders` the name `decision-makers`.

Rules:

- **Absent means default.** A missing `status` is `accepted` — in a file that does not keep its Status in its text (section 8). A missing list is empty. The tool removes a key rather than leaving an empty list behind.
- **Dates** are calendar dates, `YYYY-MM-DD`, written unquoted. Quoted dates are read too. There are no times.
- `decided` must not be present while the Status is `proposed`.
- **IDs in Relations** name ADRs — `0003-postgres-write-model`, not `ADR-3`, not a file name, not a Markdown link. A bare ID names an ADR of the same Decision Log. An ADR of another Decision Log of the repository is named by that log's directory and its ID, joined by `/`: `docs/adr/0003-postgres-write-model` — the directory as section 6 finds it, relative to the repository root, with `/` between its parts and none at its end; a log at the root of the repository is `.`: `./0001-x`. The same holds for Back-references: an ADR of `docs/adr` superseded by one of `docs/decisions` lists `docs/decisions/0001-new` in `superseded-by`. A directory-qualified ID that names the ADR's own log means the same as the bare ID — for every check, Repair and Renumber —; the tool writes the bare one, and an ADR is named once. A Relation never leaves the repository (that is section 6's concern, and the roadmap's).
- **Component IDs in `affects`** are IDs as `.arch/components.yml` declares them — `core/metadata`, not a directory, not a display name. A Trace is recorded on the ADR alone: nothing is written into the declaration, and which ADRs affect a Component is computed ([ADR-0009](adr/0009-traces-are-recorded-on-the-source-only-unlike-back.md)).
- **Lists** may be written in flow style (`[a, b]`) or block style; both are read, and a single value where a list is expected is read as a list of one. The tool keeps the style a list already has. It writes new lists in flow style, and `corrections` in block style. It adds an item at the end and takes an item out where it stands; it never reorders a list. A comment inside a flow list, next to the item to take out, belongs to nobody the tool could name: it refuses, and a person removes the item.
- **New keys** are inserted in the order of the table above, relative to the tool's keys that are already there. Existing keys are never reordered.
- **Foreign keys** — any key not in the table — belong to whoever wrote them. They are preserved byte for byte, together with their comments and blank lines, and never moved.
- `corrections` is in chronological order; the tool appends.

## 4. Body

- The body is the author's. The tool changes it in exactly one situation: Migration of a foreign ADR may remove what of the text its Metadata now holds completely — the `## Status` section of adr-tools, the items of MADR 2's list and its `## Links` section — and shows the diff first (section 8, "Migration").
- The **title** is the text of the first level-one ATX heading (`# …`) in the body that is not inside a code block. An ADR without one is shown under its ID. A leading number that repeats the ADR's own (`# 3. Title` in `0003-….md`, as adr-tools writes it) is not part of the title; the heading itself stays as it is. The price: a title that really begins with the ADR's own number and a dot — "3. Normalform reicht aus" in `0003-….md` — is shown without it. That takes a coincidence, nothing is written, and the text below the header still shows the heading in full.
- A new ADR gets its body from a Template (section 7).
- An **image** the body names is shown from the repository: a relative path is read relative to the ADR's file, a path with a leading slash relative to the root of the repository, as on GitHub. Only images are shown — by their extension: `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.avif`, `.apng`, `.svg`, `.bmp`, `.ico` — and only from below the root of the repository; a path that leads out of it, with `..` or through a symbolic link, shows nothing. Images from the web or another host (`https://…`, `//host/…`) are not loaded: the app makes no request the person did not ask for.

## 5. What each operation writes

"Has been accepted" below means the Status is `accepted`, `deprecated` or `superseded`.

| Operation  | In the ADR itself                                   | In other files |
| ---------- | --------------------------------------------------- | -------------- |
| Create     | new file; `status: proposed`, `created`; for Supersede or Amend also `supersedes` or `amends` | nothing |
| Accept     | `status: accepted`, `decided`                       | every `supersedes` target: `status: superseded`, this ADR added to `superseded-by`; every `amends` target: this ADR added to `amended-by` — by its bare ID in the same log, as `<log>/<ID>` in another (section 3) |
| Reject     | `status: rejected`, `decided`                       | nothing |
| Deprecate  | `status: deprecated`                                | nothing |
| Correction | the author's edit of the body, plus one entry appended to `corrections` | nothing |
| Edit Metadata | items added to or removed from `decision-makers`, `tags`, `depends-on`, `relates-to`, `affects` — and, while the ADR is `proposed`, `supersedes` and `amends` | nothing |
| Renumber   | the file is renamed; its bytes do not change        | every Relation and Back-reference that names the old ID names the new one, in every Decision Log of the repository |
| Rename of a Component | — (it is an operation on `.arch/components.yml`, [structure-format.md](structure-format.md), section 1) | every item of `affects` that names the old Component ID, or an ID below it, names the new one |
| Migration  | the Metadata as it was read from the foreign format; a `## Status` section that the Metadata holds completely is taken out (section 8) | the successor of a superseded MADR ADR: this ID added to `supersedes` |

- Supersede may target an ADR that is `accepted` or `deprecated`; Amend only one that is `accepted`.
- `supersedes` and `amends` are fixed once an ADR is no longer `proposed`: they took effect when it was accepted, or never will. (Migration writes them as the foreign format had them, which changes no Relation: section 8.) `decision-makers`, `tags`, `depends-on`, `relates-to` and `affects` can be edited at any Status. Such an edit is not a Correction and leaves no entry in `corrections`: a Correction is about the text of the decision, and these keys are filing, not text. git still shows who changed them.
- An item that is added must be valid — another ADR of the repository, by its bare ID in the same Decision Log or as `<log>/<ID>` in another, and for `supersedes` and `amends` one that may be superseded or amended; for `affects`, the ID of a Component that `.arch/components.yml` declares. While that file declares nothing, or cannot be read, no Component can be added: the Draft's IDs follow directories and are no name to write down. An item that is already there can be removed wherever the list may be edited, valid or not: that is how a `depends-on` or `relates-to` Relation to an ADR that does not exist is repaired. A broken `supersedes` or `amends` on an ADR that is no longer `proposed` is not edited here; it is a Problem, and repairing it belongs to the Problems view.
- A Relation on an ADR that is `proposed` or `rejected` has no effect on its target. The app may show it as pending; nothing is written.
- An effect stays when the ADR that caused it is later deprecated or superseded itself.

### Renumber

Two branches that each added "the next ADR" leave a `sequential` Decision Log with two ADRs of one number. Renumber moves one of them; which one is the person's choice.

- Renumber is for an ADR that shares its number with another one, in a `sequential` log. Every other ID stays frozen: tickets, commit messages and wikis point to it.
- The new number is the highest number of the log plus one, written as wide as a new ADR's would be (section 7). The rest of the file name — the slug, as it was written — stays.
- Wherever an ADR names the renumbered ADR in `supersedes`, `amends`, `depends-on`, `relates-to`, `superseded-by` or `amended-by` — by its bare ID in its own log, as `<log>/<old ID>` in another log of the repository —, the item is rewritten where it stands, in the same form: its position, its quoting and everything around it stay. The refusals below hold for the files of every log.
- The body of an ADR is its author's (section 4), also here. Text that mentions the old ID — a Markdown link to the old file name, say — is not changed; the tool names the ADRs that have such text, and correcting a dead link is what a Correction is for.
- Renumber is refused when the ADR names itself in a Relation, and when an ADR whose frontmatter cannot be read, or one in a foreign format (section 8), mentions the old ID anywhere in its file — or names the ADR's number, as MADR 4 does (`superseded by ADR-0002`): the tool cannot tell what it would leave behind, or may not write it.
- A heading that carries the old number (`# 3. Title`) stays as it is, like all text; the tool says so, and the title is shown with that number from then on.

### Rename of a Component

A Component's ID changes when its segment does ([structure-format.md](structure-format.md), section 1). Rename writes the new segment into the declaration and rewrites the Traces in the same change set.

- Wherever an ADR names the old ID in `affects`, or an ID below it — `core/metadata` when `core` is renamed —, the item is rewritten where it stands: its position, its quoting and everything around it stay. Where the list holds the new ID already, the old item just leaves.
- Every Decision Log of the repository is rewritten; Traces do not stay within one log.
- The body is not touched, and not searched either: a Component ID is a common word, and what the text says about a Component is its author's.
- Rename is refused when an ADR in a foreign format (section 8) names the old ID in `affects` — it is migrated first —, and when an ADR whose frontmatter cannot be read has a line that begins with `affects:`: the tool cannot tell what it would leave behind.

### Consistency — what counts as a Problem

- A Relation or Back-reference that names an ADR which does not exist — an ID that is not in the Decision Log, a directory that is no Decision Log of the repository, an ID that is not in that one —, or the ADR's own ID.
- An item of `affects` that names no Component of `.arch/components.yml`. Traces are checked only against a declaration that can be read: the Draft's IDs are a proposal that follows directories, and a declaration that cannot be read is a Problem of its own, which comes first.
- A `supersedes` or `amends` Relation on an ADR that has been accepted, without the matching Back-reference on its target — or a Back-reference without such a Relation. The Relation is authoritative; the repair rewrites the Back-reference. This holds across Decision Logs as within one; a Problem is reported in the log of the ADR it is about.
- An ADR that is `superseded` although no ADR that has been accepted supersedes it, or the reverse.
- A cycle of `supersedes` Relations — within a log, or through the logs it passes, as many as there are; each log reports the cycles its ADRs are part of.
- Two ADRs with the same number in a `sequential` log.
- Metadata that breaks section 2 or 3: invalid YAML, a Status outside the five values, a malformed date, a value of the wrong type, `decided` on a `proposed` ADR. What follows only from such a file — its Relations unknown or void — is listed under it and not repaired on its own, also in another log: there it is headed by the ADR that causes it, named by its reference, and the command counts it once (docs/cli.md).

### Repairs

Some Problems have a Repair. A Repair is an operation like any other: it is planned, shown as a diff, and writes exactly the lines below. Every Repair follows one rule — **the Relation is authoritative**: what an ADR that has been accepted says in `supersedes` and `amends` is taken as true, and Back-references and the `superseded` Status are made to fit it.

| Problem | The Repair writes |
| ------- | ----------------- |
| The Status is not written in lowercase | the Status in lowercase; its quoting stays |
| A Relation or Back-reference names an ADR that does not exist, or the ADR's own ID | the item is taken out of its list, where it stands |
| `affects` names a Component that is not declared | the item is taken out of `affects`, where it stands. Where the Component was renamed by hand, the Trace is mended in the Metadata dialog instead: the Repair cannot know the new ID |
| A Back-reference is missing | the ID is added to `superseded-by` or `amended-by` of the target |
| A Back-reference without a Relation in effect behind it | the item is taken out of `superseded-by` or `amended-by` |
| The target of a `supersedes` Relation in effect is not `superseded` | `status: superseded` on the target — if its Status is `accepted` or `deprecated`, which is what may be superseded. Any other Status, or one that cannot be read, is a person's to sort out first |
| An ADR is `superseded`, but no ADR that has been accepted supersedes it | `status: accepted`. The tool cannot know whether the ADR was `deprecated` before; the preview says so, and Deprecate is one step away |
| A cycle of `supersedes` Relations | one `supersedes` item of the cycle is taken out; the person says which. What that Relation had caused on its target — the Back-reference, the `superseded` Status — is a Problem of its own afterwards, with its own Repair. Where several cycles share ADRs, what is left of them is reported again |
| Two ADRs with the same number | Renumber of one of them; the person says which |

- Taking a Back-reference out, or the `superseded` Status back, rests on what the other ADR says right now. The preview says what that is — the other ADR is still `proposed`, was `rejected`, or does not name this one — so that a person can tell a stale Back-reference from a successor that needs fixing.
- One Repair repairs one Problem and is previewed on its own. There is no "repair everything".
- When the Relation is what is wrong — the successor forgot its `supersedes`, say — the Repair is the wrong tool: `supersedes` and `amends` of an ADR that is no longer `proposed` are changed by hand, in the file.
- No Repair for Metadata that breaks section 2 or 3 otherwise — frontmatter that cannot be read, a malformed date, a Status outside the five values, a value of the wrong type: the tool cannot know what was meant. A person fixes the file.
- A Problem that is only reported because an ADR's frontmatter cannot be read, or because its Status is none of the five values and so voids its Relations, has no Repair: that file is fixed first. Such Problems are listed under their root cause, by the app and by `adr lint` ([cli.md](cli.md)). A Repair that would write into an ADR whose frontmatter cannot be read is refused.

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

ADRs written by adr-tools, in MADR 2, 3 and 4, and by log4brains are recognized and read tolerantly — Status in a `## Status` section, in the list under the title or in a `status:` key in other spellings, "superseded by" in its various forms, unknown Status values shown as written. What is known about the formats is in [the survey](research/adr-format-survey.md).

- **The tool never writes these formats.** An ADR in a foreign format is listed, shown, searched and drawn like any other. Every operation that would write to its file — a lifecycle step, a Correction, Edit Metadata, a Repair, a Renumber of an ADR that the file mentions — is refused and points to Migration — or, for a file that has none, to what a person can do about that —, and so is one that could only be completed by writing to it: a new ADR, or a Relation of a `proposed` one, that would supersede or amend it. Migration (below) is the one operation that writes to such a file.
- "Foreign format" is about the file as a whole. It has nothing to do with the foreign keys of section 3, which live in a frontmatter of the tool's own format.
- **Recognition is conservative.** A file is foreign only when it carries something the format above cannot say — with one sign that is weaker than the others, the list under the title (see MADR 2 below): a file of the tool's own format that has no `status` key and happens to have `* Status: …` or `* Deciders: …` in its first list is taken for MADR 2's, and is not written until it is migrated or a person gives it a `status` key. Everything else is an ADR in the tool's own format, whoever wrote it: a MADR file with `status: accepted`, a `date` and Jekyll's `nav_order` is a valid ADR with two foreign keys (section 3), and there is nothing to migrate.
- **What is read is what Migration writes.** The Metadata the tool shows for a foreign ADR is exactly the Metadata its Migration puts into the frontmatter. Nothing is guessed for display that would not be written — and what cannot be resolved is written as it is read, as the Problem it is, for a person to correct.
- The header of a foreign ADR says which of the signs below made the tool read it so.
- The mappings follow.

### adr-tools

A file is read as adr-tools' when it has **no frontmatter** and its body has a level-two ATX heading `Status` (`## Status`, any case, outside a code block). The **Status section** runs from that heading to the next ATX heading of any level, or to the end of the file — as adr-tools itself reads it.

Every non-blank line of the section is either a **link line** — `<words> [<label>](<target>)` and nothing else: one link per line, no list marker; the label may contain brackets — or a line of **Status text**. Several lines of Status text are one text, joined by a space.

| In the file | Read as |
| ----------- | ------- |
| Status text that is one of the five values, in any case (`Accepted`) | that Status, in lowercase |
| no Status text | `accepted` — unless a "superseded by" line says otherwise |
| any other Status text (`On hold`) | shown as written; a Problem, as in the tool's own format |
| `Supersedes […](0001-x.md)`, also spelled `Supercedes` | `supersedes: [0001-x]` |
| `Superseded by […](0002-y.md)`, also spelled `Superceded by` | `superseded-by: [0002-y]`, and the Status is `superseded` whatever the Status text says |
| `Amends […](…)`, `Amended by […](…)` | `amends`, `amended-by` |
| `Relates to […](…)` — the words log4brains' template suggests | `relates-to`: what the line says, all of it |
| a link line with other words (`Clarifies […](…)`, `Clarified by […](…)`) to an ADR | `relates-to`: the one Relation of the format above that says nothing about the direction or the kind. Its words are not in the Metadata, so the line keeps the Status section in the text when the ADR is migrated. A link with other words to a file whose name does not begin with a number (`See [the guide](guide.md)`) names no ADR (section 1) and is no Relation |
| a link line whose words begin with one of the five values (`Deprecated, see […](…)`) | Status text, not a Relation: the line says what the Status is, in words the tool does not know — shown as written, and a Problem |
| `Date: 2016-02-12` on a line of its own before the first level-two heading — the first such line | `created`, when it is a calendar date. Anything else after `Date:` stays what it is, text of the body, and is no Problem |

- The words of a link line are compared without regard to case, and a colon after them is ignored. A target that is named twice counts once. Its target names an ADR when it is a bare file name ending in `.md` (`0001-x.md`, `./0001-x.md`): the ID is that name without `.md`. A path, a URL or an anchor names nothing; such a line stays in the body like one with other words.
- adr-tools writes the title as `# 1. Title`. The number is not part of the title (section 4).
- A Status in a case other than lowercase is not a Problem here: that is how adr-tools writes it.
- `Date:` is the day the ADR was created; adr-tools never changes it.

### MADR

MADR 3 and 4 keep their metadata in YAML frontmatter, as the format above does, and most of what they write is valid as it stands: `status: accepted`, `decision-makers`, and keys the tool does not know. A file is read as MADR's only when it says one of the two things the format above cannot:

- its `status` begins with `superseded by` (in any case, also spelled `superceded by`), or
- it has a `deciders` key that names somebody and no `decision-makers` key — MADR 3's name for the same people. A `deciders` that is empty, a mapping (the template's `{list everyone involved}`), or a list with anything but single values in it is a foreign key like any other: under the name `decision-makers` it would be a Problem, and Migration makes none.
- A file whose frontmatter cannot be read is nobody's format: it is a Problem first (section 2).

| In the file | Read as |
| ----------- | ------- |
| `status: superseded by [ADR-0005](0005-x.md)` — MADR 3, a Markdown link | `status: superseded`, `superseded-by: [0005-x]`; the target as in a link line of adr-tools |
| `status: "superseded by ADR-0005"` — MADR 4, an identifier | the same, when exactly one ADR of the Decision Log has the number 5. The identifier may be written `ADR-0005`, `ADR 5`, `ADR5`, `0005`, `5` or `#5`, in any case. A colon after "superseded by" is ignored |
| a "superseded by" whose target names no ADR, or a number that two ADRs share | `status: superseded`, and the target in `superseded-by` as it is written (`ADR-0042`): a Problem, as any ID that is not in the Decision Log. Migration writes it that way too — the tool's own format never resolves an identifier, so a person corrects it before or after |
| "superseded by" and nothing after it | `status: superseded`, no Back-reference |
| `deciders: Kim Becker, Alex Roth` | `decision-makers`, the value as it stands — a single value is a list of one, and the tool does not split what a person wrote |
| `date`, `consulted`, `informed`, `parent`, `nav_order`, … | foreign keys (section 3), untouched. MADR's `date` is the day the ADR was last updated: neither `created` nor `decided` |
| any other `status` — `on hold`, the quoted placeholder of MADR 4's template | as in the format above: shown as written, and a Problem |
| MADR 3's placeholder, `status: {proposed \| … }` without quotes | not valid YAML: frontmatter that cannot be read (section 2) |

- **MADR records a supersession on the superseded ADR only**; it has no `supersedes`. The format above takes the Relation as authoritative, so while an ADR is read as MADR's and names its successor, the successor is read as superseding it — in memory; its file is not touched. Migration of the superseded ADR writes `supersedes` into the successor: the one case in which `supersedes` of an ADR that is no longer `proposed` is written by the tool (section 5), because the Relation is not new, it only moves to where this format keeps it.
- A Relation that is read this way is not part of the successor's Metadata, which stays what its own file says. It counts wherever Relations count — the graph, the consistency of the log — and is offered nowhere for editing or for a Repair: there is nothing in the successor's file to change. Accepting a `proposed` successor writes nothing to the superseded ADR, which says all there is to say already.
- Only the successor that the `status` names is read this way. A `superseded-by` key in the same file is a Back-reference like any other, and needs a Relation behind it.
- A number that a file of MADR names and that no ADR has (`superseded by ADR-0042`) is waiting for one. Renumber does not move an ADR onto such a number, and a new ADR that gets it says so in its preview: it will be read as the successor.
- `adr-template.md` in the directory is no ADR: its name follows no naming scheme (section 1).

### MADR 2 and log4brains

MADR 2, and log4brains, which grew out of it, keep their metadata in the body: in the first list under the title — `* Status: accepted`, `* Deciders: …`, `* Date: …`, log4brains with `-` and an item `Tags` — and their links to other ADRs in a section `## Links`. A file is read this way when it has **no `status` key in a frontmatter** — or no frontmatter — and the first list of its body, before the first level-two heading, has an item `Status: …` or `Deciders: …`.

- "The first list" is the first run of bullet items (`*`, `-`, `+`, indented by up to three spaces) outside a code block. An item **runs on**, as Markdown reads it, over what is indented under it — nested items, a code block — and over a line of text right under it, without a blank line in between; the list ends at the first line that is none of these, nor an item, nor blank. The name of an item is compared in any case, and only the first item of a name is read, from its first line.
- An HTML comment — the template's `<!-- optional -->` — is not part of a value, of a link line, or of the heading `## Links`; an item without a value is none. A Deciders or Tags value that is in square brackets as a whole is the template's placeholder (`[list everyone involved in the decision]`), not a value; a Status that is one is shown as written and is a Problem, as MADR 4's quoted placeholder is.
- A `status` key that is there counts, also when it is empty: the list is not looked at then, and the file is MADR 3's or the tool's own.
- A file with a `## Status` section and no frontmatter is adr-tools', whatever else it has.
- The **Links section** runs from a level-two heading `Links` (any case) to the next heading. An item of it that is a link line as in adr-tools, after its list marker, is a Relation by its words; anything else in it is text.

| In the file | Read as |
| ----------- | ------- |
| `* Status: rejected` | that Status, read like the Status text of adr-tools: any case; anything else shown as written, and a Problem |
| `- Status: draft` — log4brains | `proposed`: the tool has no state before it, and a draft is not decided |
| `* Status: superseded by [ADR-0005](0005-x.md)`, also `superseded by ADR-0005` | as `status: superseded by …` of MADR 3 and 4 above: `superseded`, the successor in `superseded-by`, and the successor read as superseding it |
| no item `Status` — the file has an item `Deciders` | `accepted`, as in the format above and in log4brains |
| `* Deciders: Kim Becker, Alex Roth` | `decision-makers`, the value as it stands — one value: the tool does not split what a person wrote. Not read when the frontmatter has `decision-makers` or `deciders` |
| `- Tags: api, reporting` | `tags: [api, reporting]`, split at commas and spaces as log4brains splits them. Not read when the frontmatter has `tags` |
| `* Date: 2020-10-16`, any other item | not read. MADR's date is the day of the last update — neither `created` nor `decided` — and log4brains' is the day it sorts by; the item stays where it is |
| in `## Links`: `- Supersedes [x](x.md)`, `Superseded by`, `Amends`, `Amended by`, `Relates to` | `supersedes`, `superseded-by`, `amends`, `amended-by`, `relates-to`, with the spellings and the targets of the link lines of adr-tools |
| in `## Links`: a link with other words to an ADR — `Refined by [ADR-0004](0004-x.md)` | `relates-to: [0004-x]`, as in adr-tools; a link with other words to another file — `See [the guide](guide.md)` — is none |
| in `## Links`: a link that names no ADR, an item that is no link, text | not read |

### Migration

Migration rewrites an ADR in a foreign format into the format above: once, as a change set that is previewed like every other, for one ADR or for every foreign ADR of a Decision Log. Afterwards the file is one of the tool's own, and everything works on it.

**What is read is what is written.** Migration puts the Metadata the tool shows for the ADR into its frontmatter, with the writer every other operation uses: new keys in the order of section 3, in the file's line ending, existing keys and foreign keys untouched. Reading the migrated log gives the same Status, the same Relations and Back-references and the same Problems as before — a Problem that is a person's to solve is not made to disappear, and none is added.

| Format | Migration writes |
| ------ | ---------------- |
| adr-tools | a frontmatter in front of the text, and a blank line after it unless the text begins with one: `status` — always, also `accepted` —, `created` when the `Date:` line gave one, and `supersedes`, `amends`, `superseded-by`, `amended-by` as the link lines say. The `## Status` section is taken out when the Metadata holds all of it (below) |
| MADR, `status: superseded by …` | `status: superseded` in the place and the quoting of the old value, and `superseded-by` with the successor — or with the identifier as it is written, when it names no ADR. In the successor's file: this ID added to `supersedes` |
| MADR, `deciders` | the key is renamed to `decision-makers` where it stands; its value stays as it is written |
| MADR 2, log4brains | a frontmatter in front of the text when there is none, and in it `status` — always, also `accepted` —, `decision-makers` and `tags` as the items say, and the Relations and Back-references of the Status and of the Links section. The items that were read are taken out of the list — but an item that runs on stays, its first line written into the Metadata and the rest where it is, and so do both items of a name the list has twice, which the preview names —; the list goes as a whole, with the blank lines after it, when nothing is left of it, and one blank line stays when text stands right above it. An item with a Status the tool does not know stays, as such Status text of adr-tools does. The Links section is taken out when every line of it is in the Metadata (below). A successor that the Status names gets `supersedes`, as for MADR |

- A Status the tool does not know is written as it is read (`status: On hold until the partner programme starts`), quoted where YAML asks for it. It was a Problem before and is the same Problem afterwards; leaving it out would make the ADR `accepted` without anybody having said so. The one Status text that cannot be written as it is read begins with "superseded by" and is no link line (`Superseded by ADR 2`): as a `status` that is MADR's way of naming a successor, and the file would say something else than it said. There is no Migration for such a file until a person has made a link line of it.
- **The Status section** of a file of adr-tools is removed — from its heading to the next heading; at the end of a file together with the blank lines in front of it, so that the file ends where its text ends — when every line of it is in the Metadata afterwards: its Status text is empty or, whatever its case, the Status that was read, and every other line is a link line that became a Relation or a Back-reference. Otherwise the whole section stays, and the preview names everything in it that keeps it: Status text that a "superseded by" line overruled (`Proposed`), Status text the tool does not know, a link with other words (`Clarifies`, whose Relation is in the Metadata, its words are not), a link that names no ADR, a code block. The **Links section** of MADR 2 and log4brains follows the same rule: it is taken out when every item of it is a link line that became a Relation or a Back-reference with the words of the format above, and stays otherwise, named by what keeps it; blank lines and the list markers are no content. A section that is followed by a heading of level three or deeper stays too: what stands under that heading would change its place in the document. And so does the section of a file that has a second `## Status` further down: only the first is read, and with it gone the file would say something else about its Status than its Metadata. These are the edits the tool makes in a body on its own (section 4). It is not a Correction and leaves no entry in `corrections`: no sentence of the decision changes.
- The `Date:` line of adr-tools, the number in its title and everything else in the body stay as they are.
- **The successor.** MADR's supersession moves to where this format keeps it: `supersedes` of the successor, although that ADR is no longer `proposed` — the Relation is not new. Migration of one ADR therefore writes to two files. When the successor is itself in a foreign format, Migration of the one ADR is refused: the successor, or the whole Decision Log, is migrated first. Migration of a Decision Log migrates both. The successor is written whatever its Status is; a Relation of a `proposed` successor is pending before and afterwards.
- **What cannot be migrated is left out, never half done.** Migration of a Decision Log leaves out, and names in its preview: a file that has no Migration (above); an ADR whose successor's frontmatter cannot be read; an ADR with a value the writer cannot change where it stands — a `status` written as a block of several lines, a `supersedes` in the successor that is no list —; and every ADR whose successor is left out, since a Back-reference without the Relation behind it would be a Problem that Migration made. Asked for one such ADR, Migration is refused with the same words. When nothing is left to migrate, that is a refusal too.
- An ADR whose frontmatter cannot be read is nobody's format, and is not migrated. A Decision Log without any ADR in a foreign format: there is nothing to migrate, and the tool says so.
- A list that has items already keeps them where they are; what Migration adds comes after them.

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
