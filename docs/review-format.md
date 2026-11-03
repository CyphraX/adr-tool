# Review format

The contract of the Review module: what an Annotation and its Replies look like on disk, how an Anchor is found again when the code changes, and which Problems the suite reports about them. The `review` package implements exactly this document, and an agent or a person who follows it can write Annotations without the app.

Vocabulary follows the [Review glossary](contexts/review/CONTEXT.md) and the shared language in [CONTEXT-MAP.md](../CONTEXT-MAP.md). Where the module sits in the suite is in [vision.md](vision.md); how it gets built is in [plan-vision.md](plan-vision.md), parts 8 and 9. Why an Anchor is found again the way section 4 says is in [ADR-0019](adr/0019-an-anchor-is-found-again-by-its-quoted-lines-and-its-history.md); how the suite reads git, in [ADR-0020](adr/0020-git-is-a-port-of-the-kernel-implemented-once-for-node.md).

Three rules stand above everything else:

- **The suite never changes a byte it was not asked to change** ([ADR-0002](adr/0002-never-reserialize-markdown.md)). An Annotation is written by people, agents and the suite alike; whatever the suite writes into it, nothing else in the file moves.
- **Nothing from the analysed repository is ever executed** ([ADR-0007](adr/0007-the-analysis-never-executes-anything-from-the-analysed.md)). The history is read from git without a hook, a filter, a textconv or an external diff, and without the network.
- **Opening a repository never writes.** Finding an Anchor again is derived: its new place is shown, and written only when a person accepts it ([ADR-0004](adr/0004-operations-return-change-sets.md)).

## 1. Where Annotations are

Each Annotation is a Markdown file of its own in one directory, `docs/architecture/annotations/` unless the repository says otherwise:

```yaml
# .arch/config.yml
annotations: docs/reviews        # optional; docs/architecture/annotations when absent
```

- `annotations` is a path relative to the repository root, with `/` between its parts, written as a text: `123` or `true` is a number or a truth value to YAML, and is a Problem; `"123"` is the directory `123`. Other keys of `.arch/config.yml` belong to other modules, or to nobody, and are never touched.
- The directory is created with the first Annotation. Opening a repository never creates it.
- While `.arch/config.yml` cannot be read, or `annotations` is not a relative path inside the repository, no Annotation is read and none is written: they would not be found once the file is repaired. That is a Problem (section 6).

In the directory:

```
docs/architecture/annotations/
  20261102-why-is-the-total-computed-on-every-call.md     ← an Annotation
  20261102-why-is-the-total-computed-on-every-call/       ← its Replies, one file each
    0001-lena-becker.md
    0002-aylin-demir.md
  20261103-this-bypasses-the-repository.md
```

- Every `.md` file directly in the directory is an Annotation, except a `README.md` (in any case). Its **ID** is the file name without `.md`; it is frozen when the Annotation is created, and a Finding of an Assessment names it by it.
- A directory beside it with the same name holds its **Replies**: every `.md` file directly in it is one. Other files, and directories further down, are ignored.
- **Bytes** as in an ADR ([file-format.md](file-format.md), section 1): UTF-8, a byte order mark kept and never added, each file's line endings kept. A new Annotation takes the line ending most Annotations of the directory have, LF when there are none or on a tie; a new Reply takes that of its Annotation.

### A new Annotation's ID

`YYYYMMDD-slug`: the day it is written, and a slug of the first words of its text, made as an ADR's slug is made from its title ([file-format.md](file-format.md), section 7) — lowercase, German umlauts and `ß` written out, other accents dropped, everything that is not a letter or a digit a dash, at most 60 characters. A text that leaves no slug gives the slug of the Source File's name. Where the ID is taken, `-2`, `-3`, … is added until it is free.

### A new Reply's file name

`NNNN-author.md`: the next number after the highest one among the Replies, four digits, and a slug of the author's name (`reply` when it leaves none). Two people who reply on two branches at the same time each add a file of their own, so their Replies meet in a merge without a conflict; that they carry the same number says that neither saw the other.

## 2. An Annotation file

````markdown
---
type: concern
state: open
author: Aylin Demir
date: 2026-11-02
anchor:
  path: src/main/java/com/shop/cart/Cart.java
  lines: 12-14
  commit: 3f2a9c0e8b1d4f6a7c5e2b9d0f1a3c4e5b6d7f8a
cites: [0003-postgres-write-model]
---

```java
    public Money total() {
        return lines.stream().map(Line::price).reduce(Money.ZERO, Money::add);
    }
```

Why is the total computed on every call? With a few hundred lines a cart this
is the hot path of the checkout.
````

The frontmatter is found as in an ADR ([file-format.md](file-format.md), section 2): the first line is `---`, and it ends at the next line that is `---`. It must be a YAML mapping.

| Key | Value | Written by |
| --- | --- | --- |
| `type` | `note`, `question` or `concern` | create |
| `state` | `open` or `resolved` | create, Resolve, Reopen |
| `author` | free text: who wrote it | create |
| `date` | `YYYY-MM-DD`: when it was written | create |
| `anchor` | a mapping: `path`, `lines`, `commit` — the Anchor, with the quoted lines below | create, Attach again, Update the Anchor |
| `cites` | list of ADRs — a Trace ([ADR-0009](adr/0009-traces-are-recorded-on-the-source-only-unlike-back.md)) | create, Cite, Uncite, its Repair |

- **Absent means default:** no `type` is a `note`, no `state` is `open`. The suite writes both, always.
- `author` and `date` may be absent in a file written by hand; nothing is wrong then, and the Anchor is found again without the day it was written (section 4).
- **Keys of others** — any key not in the table, and any key under `anchor` other than its three — are kept byte for byte and never moved, as in an ADR.
- The suite writes keys in the order of the table, `anchor` in block style with its keys in the order `path`, `lines`, `commit`, and `cites` in flow style. A value it writes is written plain where it reads back as the same text, and in double quotes otherwise; `anchor.lines` and `anchor.commit` are always written plain, since they are read by their text: `lines: 12` is line 12, and a commit name of digits only stays that name.

### The Anchor

| Key | Value |
| --- | --- |
| `anchor.path` | The Source File, relative to the repository root, with `/`: the file the lines are in |
| `anchor.lines` | The first and the last line, counted from 1 and both included: `12-14`; one line is `12` |
| `anchor.commit` | The commit HEAD pointed at when the lines were read, by its full name of 40 or 64 hexadecimal digits. Absent when the repository had no commit, or no git |

The **quoted lines** are the lines of the Source File from the first to the last, as they were read. They are not in the frontmatter but at the start of the body, as a fenced code block, so that they read as code on GitHub and in an editor, and need no escaping:

- The body begins with the block; blank lines before it are allowed. Its opening fence is three or more backticks or tildes at the start of a line; what follows it on the line — the suite writes the extension of the Source File, `java`, for the highlighting — is ignored when it is read.
- The block ends at the next line that is made of the same character, at least as many, with up to three spaces before them and nothing but spaces after. Every line in between is a quoted line, exactly as it is written, without its line break.
- The suite writes the fence one character longer than the longest run of backticks in the quoted lines, three at least, so that no quoted line can end the block.
- The block quotes exactly as many lines as `lines` says.

### The text

Everything after the closing fence, without the blank lines right behind it, is the text of the Annotation: Markdown, the author's own. The suite writes it as it is given and never changes it afterwards.

### Traces to ADRs

`cites` names the ADRs the Annotation is about, as `affects` names Components in an ADR: on the Annotation alone, and which Annotations cite an ADR is computed ([ADR-0009](adr/0009-traces-are-recorded-on-the-source-only-unlike-back.md)).

- An item names an ADR the way an ADR names one of another Decision Log ([file-format.md](file-format.md), section 3): `docs/adr/0003-postgres-write-model` — the log's directory relative to the root, `.` for the root, and the ID. Where only one Decision Log of the repository has the ID, the bare ID names it too: `0003-postgres-write-model`.
- The list follows the rules of a list of Metadata: flow or block style, a single value read as a list of one, an item added at the end and taken out where it stands, the key taken out with the last item.

## 3. A Reply file

```markdown
---
author: Lena Becker
date: 2026-11-03
---

We cache it per cart in the next sprint; ADR-0007 has the reasons.
```

- `author` and `date` as in an Annotation; the text is the body, the author's own.
- The Replies of an Annotation are in the order of their file names: by number, and where two share a number, by the author's slug.
- A Reply has no state of its own. Resolving an Annotation resolves the conversation; replying to a resolved one does not reopen it.

## 4. Finding the Anchor again

The code goes on changing after an Annotation is written: lines are inserted above it, its lines are edited, moved, deleted, its Source File renamed, its commit rebased away. Whenever the Annotations are read with the code — by the app when it shows them, by the MCP server and `adr check` later —, the suite looks for each Anchor in the Source File as it is on disk, and says one of three things:

- **Unchanged:** the Source File is at `path`, and its lines `lines` are the quoted lines, exactly but for whitespace at the end of a line.
- **Moved:** the lines are found again, but not as the Anchor has them — at other lines, in a renamed Source File, or with other text. The new place, with the lines as they are now and HEAD's commit, is offered as **Update the Anchor**, a previewed change (section 5). The Annotation is shown at its new place either way; until a person accepts it, nothing is written.
- **Orphaned:** they are not found. That is a Problem, and it has no Repair: only a person knows where the remark belongs now, and **attaches it again** by selecting its lines.

The search goes in this order; the first step that finds the lines decides.

1. **Where the Source File is now.** When the repository has the Anchor's commit, git says what became of `path` between that commit and HEAD, a rename included (as `git diff -M` finds it: half the content the same). Without the commit — after a rebase, in a fresh clone of a rebased branch, or when there was none —, git's renames of the last 1000 commits are looked at, and of every commit since the day before `date` when those are more: from the last commit that renamed `path` on, each rename of the file is followed to the next. The rename may well be older than the Annotation — made upstream while the Annotation was written on a branch that was then rebased onto it —, so `date` does not cut it off. The file at `path` is looked at first, if it is there; if the lines are not found in it, the file it was renamed to.
2. **Unchanged** when it is `path` and its lines `lines` are the quoted lines, whitespace at the end of a line aside.
3. **The text the lines were read in.** The Source File as the Anchor's commit has it, if its lines `lines` are the quoted lines. When the commit is gone, the newest of the last 50 commits that changed the file (followed through its renames) whose version has the quoted lines at `lines` stands in for it: a rebase that did not touch the lines leaves such a version behind. Where there is neither — the lines were read before they were committed —, the search goes on without history.
4. **With history:** the old text and the file now are compared line by line, as a diff does, whitespace aside as for similarity below: a file that is re-indented keeps its lines. A line of the file now is *new* when the diff adds it, *quoted* when it is one of the quoted lines kept, and *other* when it was there before and not quoted — unless it is a *weak* line, blank or without a letter or a digit, a closing brace say, that the old text has more than once: the diff may pair such a line with any of its copies, so where it pairs it says nothing. Only runs of new, quoted and weak lines are looked at:
   1. the quoted lines themselves, compared without regard to whitespace at the start and end of a line or its amount inside it: where several runs have them, the one nearest to where the diff takes the Anchor's first line;
   2. otherwise, when the diff kept some of the quoted lines and only such lines are between them, no further apart than twice the quoted lines and 50 more, the most similar block within 50 lines of them that holds each of them where it is now, if it is similar enough: a line inserted among the quoted lines belongs to the block, and a quoted line kept is not left out for a shorter block;
   3. otherwise the most similar block of lines in those runs within 50 lines before and after where the diff takes the Anchor, if it is similar enough.

   Lines that were there before and not quoted are never taken for the Anchor: a method that is deleted is not found again in its look-alike next to it, nor in a copy of it elsewhere in the file, which the diff keeps as the lines they were.
5. **Without history:** the first and the last of those steps over the whole file — the quoted lines nearest to `lines` —, and the most similar block within 50 lines before and after where the Anchor was.
6. Otherwise the Annotation is **orphaned**.

**Similarity** of a block of lines to the quoted lines is measured on the lines with whitespace at their start and end removed and every run of whitespace inside them made one space. It is one minus the edit distance between the two, in characters, divided by the number of characters of the longer of the two: the edit distance is that of the best pairing of their lines — a quoted line paired with a line of the block costs the characters that differ between them (Levenshtein), a quoted line without a partner costs all its characters, and so does a line of the block without one. A block is **similar enough** when its similarity is at least **0.5**: half of what was quoted is still there, the bar git sets for a rename. Of several equally similar blocks the nearest wins. Blank lines cost nothing; a quote of blank lines only is found by the first step or not at all.

The **Component** of an Annotation is not stored: it is the Component that owns its Source File ([structure-format.md](structure-format.md), section 1) — at the place where the Anchor is found again, or at `path` while the Annotation is orphaned. An Annotation on a file that no Component owns has none.

## 5. What each operation writes

| Operation | Writes |
| --- | --- |
| Create | a new file: `type`, `state: open`, `author`, `date`, `anchor` with the lines as they are on disk and HEAD's commit, `cites` when it cites ADRs, the quoted lines, the text |
| Reply | a new file in the Annotation's directory of Replies: `author`, `date`, the text. The Annotation's file is not touched |
| Resolve, Reopen | `state: resolved`, `state: open`, where the key stands; a missing `state` is inserted after `type` |
| Update the Anchor | for a moved Annotation, the place it is found at: below |
| Attach again | a new place selected by a person, as for Update the Anchor |
| Cite, Uncite | an item added to `cites`, or taken out where it stands |

Update the Anchor and Attach again rewrite the values of `anchor.path`, `anchor.lines` and `anchor.commit` where they stand, `commit` inserted after `lines` when it is missing and taken out with its line when the new Anchor has none, and the quoted lines between the fences. A fence is rewritten only when the new quoted lines need a longer one, and the word after the opening fence only when it was the old Source File's extension and the new one has another. The text and every other line stay.

- Create, Attach again and Update the Anchor read the lines from the disk as it is when they are planned; whoever calls them names the file and the lines, never the quoted lines. They are refused when the Source File is not there or does not have the lines, and when one of the lines holds a carriage return that ends no line, which quoted lines cannot keep. Create is refused besides without an author, with a date that is not a day, with an ADR that does not exist or that several Decision Logs have, and while the directory cannot be used (section 1).
- A write into a file whose frontmatter cannot be read, or whose Anchor cannot be found in it, is refused; so is one into an `anchor` or a `cites` written in a way that a splice cannot serve — a mapping in braces that a key would have to be added to, a comment between two items. A person changes it in an editor then.
- Resolve is refused for a resolved Annotation and Reopen for an open one; a Reply without a text, or without an author, is refused.

## 6. Problems

Review adds these **Problems**. Each has a code and an English sentence; the window words the code in its own language. An Annotation with a Problem of its own file is still listed, with what can be read of it.

| Code | Sentence | Repair |
| --- | --- | --- |
| `unreadable-configuration` | `.arch/config.yml` cannot be read: *why*. No Annotation is read until it is fixed. | — |
| `invalid-annotations-directory` | "annotations" in `.arch/config.yml` must be a relative path inside the repository, not "*value*". No Annotation is read until it is fixed. | — |
| `unreadable-annotation` | *file* cannot be read: *why* — it has no frontmatter, its frontmatter is never closed, is not YAML, or is not a mapping. | — |
| `invalid-type` | *file*: "type" must be note, question or concern, not "*value*". | — |
| `invalid-state` | *file*: "state" must be open or resolved, not "*value*". | — |
| `invalid-key` | *file*: "*key*" must be a text — must be a date of the form YYYY-MM-DD — must be a list of ADRs. | — |
| `no-anchor` | *file* has no Anchor: "anchor" needs "path" and "lines". | — |
| `invalid-anchor` | *file*: the Anchor names a path that is absolute or leaves the repository — must give its lines as a number or a range such as 12-18 — must name its commit by its full name of 40 or 64 hexadecimal digits. | — |
| `no-quote` | *file* does not begin its text with the quoted lines, as a fenced code block that is closed. | — |
| `quote-does-not-match-lines` | *file* quotes *n* lines for lines *range*, which are *m*. | — |
| `unknown-adr` | *file* cites *ADR*, which is no ADR of this repository. | the item is taken out of `cites`, where it stands |
| `ambiguous-adr` | *file* cites *ADR*, which several Decision Logs have: *log/ID*, *log/ID*. Name it with its log. | — |
| `orphaned` | *ID* is orphaned: the quoted lines *range* of *path* are no longer found in it — *path* is gone, and no file it was renamed to has its quoted lines. Attach it again to the lines it is about. | — attached again by hand |
| `unreadable-reply` | *file* cannot be read: *why*, as for an Annotation. | — |
| `replies-without-annotation` | *directory* holds Replies to *ID*, and there is no Annotation *ID*. | — |

- A Trace is checked against the Decision Logs the repository has; an item of another repository (`name:log/ID`) is no ADR of this one.
- **Orphaned** is checked only for an Annotation whose Anchor can be read: an Anchor with a Problem of its form is that Problem first.
- A moved Annotation is no Problem: it is found, and shown where it is. Update the Anchor is offered beside it.

## 7. Examples

The smallest Annotation, written by hand:

````markdown
---
anchor:
  path: src/cart.ts
  lines: 3
---

```
  return price * quantity
```

Rounding?
````

It is a `note`, `open`, of nobody in particular, on line 3 of `src/cart.ts`, and found again from its quoted line and the history of the file.
