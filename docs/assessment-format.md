# Assessment format

The contract of the Assessment module: where the Assessments of a repository and the registers of its Risks and Technical Debt Items are, what each of them looks like on disk, how a Finding names its evidence and what that evidence is checked against, what a Snapshot freezes, which Problems the suite reports, and what each operation writes. The `assessment` package implements exactly this document, and an agent or a person who follows it can write an Assessment, a Risk or a Technical Debt Item without the app.

Vocabulary follows the [Assessment glossary](contexts/assessment/CONTEXT.md) and the shared language in [CONTEXT-MAP.md](../CONTEXT-MAP.md). Where the module sits in the suite is in [vision.md](vision.md); how it gets built is in [plan-vision.md](plan-vision.md), parts 10 to 12. Every section names the part it arrives with, so that this document never promises more than the code does. Why a document of prose and a register of entries are kept the way they are is recorded in [ADR-0021](adr/0021-an-assessment-is-markdown-with-yaml-blocks-each-risk-a-file.md).

Three rules stand above everything else:

- **The suite never changes a byte it was not asked to change** ([ADR-0002](adr/0002-never-reserialize-markdown.md)). An Assessment is a document a person writes; whatever the suite writes into it — a Scenario, a rating, a Finding, a piece of evidence —, nothing else in the file moves.
- **The judgement is the person's.** The suite reads structure only from the places this document names: the frontmatter and the small YAML blocks of the entries. Every heading and every sentence around them is the author's, and the suite never rates, scores or concludes anything on its own ([vision.md](vision.md), Assessment: "Out: an automatic overall score").
- **What is derived is never stored, except in the Snapshot.** Violations and metric values are recomputed from the code whenever they are asked for. A Finding names them; only the Snapshot beside an Assessment freezes metric values, on purpose, so that its evidence keeps reading the same ([vision.md](vision.md), "Stored and derived", place 3).

## 1. Where they are (part 10)

Three directories, each with a key of its own in the suite's settings ([configuration.md](configuration.md)):

```yaml
# .arch/config.yml
assessments: docs/assessments # optional; docs/architecture/assessments when absent
risks: docs/risks             # optional; docs/architecture/risks when absent
debt: docs/debt               # optional; docs/architecture/debt when absent
```

- Each key is a path relative to the repository root, with `/` between its parts, written as a text — `123` or `true` is a number or a truth value to YAML, and is a Problem; `"123"` is the directory `123`. Without the key, or with nothing after it, the default. Assessment reads these three keys and no other.
- A key that is not a relative path inside the repository is a Problem at its line (section 7), and **nothing of its directory is read or written** while it stands: what is there would not be found once the key is fixed. The other two directories are read all the same.
- While `.arch/config.yml` cannot be read at all, nothing of the module is read or written, and the defaults are not used. That is the one Problem of the file, said once for every module ([configuration.md](configuration.md), section 2).
- A directory is created with its first file. Opening a repository never creates it, and never writes.

In the directories:

```
docs/architecture/assessments/
  20260512-a-first-look-at-the-shop.md
  20261103-the-shop-before-the-checkout-rewrite.md             ← an Assessment
  20261103-the-shop-before-the-checkout-rewrite.snapshot.yml   ← its Snapshot (section 4)
docs/architecture/risks/
  20261103-a-change-to-the-search-breaks-the-page.md           ← a Risk
docs/architecture/debt/
  20261103-two-classes-util-in-one-package.md                  ← a Technical Debt Item
```

- Every `.md` file directly in one of the directories is an entry of it — an Assessment, a Risk, a Technical Debt Item —, except a `README.md` (in any case). Other files, and directories further down, are ignored; in the directory of the Assessments, so is every file but a Snapshot.
- Its **ID** is the file name without `.md`, frozen when it is created: a Finding names a Risk by it, the next Assessment names the one it follows by it. An ID is one part of a path on every system, as an Annotation's is ([review-format.md](review-format.md), section 1): a file whose name without `.md` holds a `\` or a control character, or ends in a dot or a space, is not an entry.
- **Bytes** as in an ADR ([file-format.md](file-format.md), section 1): UTF-8, a byte order mark kept and never added, each file's line endings kept. A new file takes the line ending most files of its directory have, LF when there are none or on a tie.

### A new ID

`YYYYMMDD-slug`: the day of the Assessment, or the day a Risk or a Technical Debt Item is recorded, and a slug of its title, made as an ADR's slug is made ([file-format.md](file-format.md), section 7) — lowercase, German umlauts and `ß` written out, other accents dropped, everything that is not a letter or a digit a dash, at most 60 characters. A title that leaves no slug is refused. Where the ID is taken, `-2`, `-3`, … is added until it is free. A file written by hand may have any name ending in `.md`.

Each Risk and each Technical Debt Item is a file of its own, so that two people who record one on two branches each add a file, and their entries meet in a merge without a conflict; only two entries of one title on one day collide, and git says so ([ADR-0021](adr/0021-an-assessment-is-markdown-with-yaml-blocks-each-risk-a-file.md)).

## 2. An Assessment (part 10)

An Assessment is a Markdown document: frontmatter, a title, and the author's text, in which the **entries** — its Quality Scenarios and its Findings — stand as headings, each with a small YAML block below it.

````markdown
---
date: 2026-11-03
status: draft
authors: [Aylin Demir]
scope: [cart, catalog, web]
previous: 20260512-a-first-look-at-the-shop
---

# The shop before the checkout rewrite

Two weeks on the three Maven modules of the shop, before the checkout is rewritten.

## Quality Scenarios

### The total of a large cart shows at once

```yaml
scenario: S1
attribute: performance-efficiency/time-behaviour
source: A customer
stimulus: adds a product to a cart of 200 lines
artifact: cart
environment: normal operation, at the Christmas peak
response: the cart shows its new total
measure: within 100 ms
importance: H
difficulty: M
rating: partly-met
```

The total is computed on every call, over every line.

## Findings

### The web reaches into the catalog past the cart

```yaml
finding: F1
scenarios: [S3]
evidence:
  - violation: web-through-cart
    from: web
    to: catalog
  - metric: instability
    component: cart
  - annotation: 20261102-the-page-searches-the-catalog-itself
  - adr: 0001-the-web-shows-the-catalog-through-the-cart
  - risk: 20261103-a-change-to-the-search-breaks-the-page
```

`Page` searches the catalog itself, against ADR-0001.
````

### The frontmatter

The frontmatter is found as in an ADR ([file-format.md](file-format.md), section 2): the first line is `---`, and it ends at the next line that is `---`. It must be a YAML mapping without a key written twice.

| Key | Value | Written by |
| --- | --- | --- |
| `date` | `YYYY-MM-DD`, required: the day of the Assessment | create |
| `status` | `draft` or `final` | create, Finish |
| `authors` | list of texts: who wrote it | create |
| `scope` | list of Component IDs — a Trace ([ADR-0009](adr/0009-traces-are-recorded-on-the-source-only-unlike-back.md)): what it assesses | create, Rename of a Component, its Repair |
| `previous` | the ID of the Assessment it follows | create from the last one |

- **Absent means default:** no `status` is a `draft`, no `scope` is the whole repository, no `previous` is a first Assessment. `date` is required: an Assessment is dated, and its date orders it among the others — for "the last one", for trends, for a comparison.
- A **final** Assessment is done: its ratings, its Findings and its Snapshot are a record of its day. The suite writes into it only what a Rename and a Repair write; everything else is refused with a sentence (section 6). A person may still change it in an editor.
- **Keys of others** — any key not in the table — are kept byte for byte and never moved, as in an ADR.
- The suite writes keys in the order of the table, lists in flow style, and a value plain where it reads back as the same text, in double quotes otherwise. Lists are read as in an ADR's Metadata: flow or block style, a single value read as a list of one, an item added at the end and taken out where it stands, the key taken out with the last item.

The **title** is the text of the first level-one heading (`# …`) of the body that is not inside a code block, as an ADR's is ([file-format.md](file-format.md), section 4). An Assessment without one is shown under its ID.

### Entries

An **entry** is a heading followed by a fenced YAML block that says what it is:

- The heading is an ATX heading of level 2 to 6 (`##` to `######`), outside a code block. Its text, without closing `#`s and the blanks around it, is the entry's **title**.
- The block follows the heading with nothing but blank lines between them. Its opening fence is three or more backticks or tildes, as in CommonMark, and the first word after it is `yaml` or `yml`.
- Its YAML is a mapping with the key **`scenario`** — a Quality Scenario — or **`finding`** — a Finding —, whose value is the entry's **ID**.
- Everything after the closing fence up to the next heading of the same or a higher level (as many `#` or fewer), without the blank lines around it, is the entry's **text**: the reasons for a rating, the judgement of a Finding. A deeper heading belongs to the text.

Every other code block — a YAML block without either key among them — is the author's, and so is every heading without such a block. So is a code block inside a list item or a block quote, opened after a list marker or a `>`: its lines carry the container's indentation or its `>`, and it ends where its closing fence or its container does. Nothing inside an **HTML comment** (`<!-- … -->`) is read — no heading, no block: a comment sets an entry aside. A comment that is never closed hides the rest of the document, as it does on GitHub; where an entry's ID key stands in what it hides, that is a Problem (section 7). The suite reads ATX headings, fenced code blocks and HTML comments, and nothing else of Markdown: a Setext heading (underlined with `=` or `-`) is no heading of an entry, and a block indented by four blanks or more is no fence. A new entry never takes an ID that stands on a line of its own anywhere in the document — `scenario: S3` in a comment, say —, so that one set aside keeps its ID. The sections that hold the entries — `## Quality Scenarios`, `## Findings` in the example — are the author's too: the suite finds an entry by its block, never by the section it stands in, so they may be called anything, in any language.

- An **entry ID** is made of letters, digits, `.`, `_` and `-`, and begins with a letter or a digit: `S1`, `F3`, `checkout-latency`. It is unique among the entries of its kind in the Assessment; compared exactly, case included. The suite numbers its own: `S` and the next number for a Scenario, `F` for a Finding.
- A Scenario keeps its ID when the next Assessment carries it over (section 6), so that two Assessments rate the same Scenario under the same ID, and a comparison (part 12) can tell whether it is rated better or worse.
- A block that has both keys is a Problem; so is one with either key that does not follow a heading, and one that has a line beginning with `scenario:` or `finding:` and is not YAML, or is YAML with a key written twice (section 7). An entry with a Problem of its form is not read.
- The keys of an entry's block are read like the frontmatter: keys of others are kept and ignored, values are read as their text (`H` and `0.5` alike), and a text may be written in any form YAML has for one — plain, quoted, or as a block scalar (`>` or `|`) over several lines.

### A Quality Scenario

| Key | Value |
| --- | --- |
| `scenario` | the entry ID, required |
| `attribute` | required: the quality attribute it is about — a characteristic of ISO/IEC 25010, or a characteristic and one of its sub-characteristics, joined by `/` (below) |
| `source` | a text: who or what causes the stimulus |
| `stimulus` | a text, required: what arrives at the system |
| `artifact` | a text: the part of the system that is stimulated |
| `environment` | a text: under which conditions |
| `response` | a text, required: what the system does |
| `measure` | a text, required: how the response is measured — the response measure |
| `importance` | `H`, `M` or `L`: how much the Scenario matters to the system's success |
| `difficulty` | `H`, `M` or `L`: how hard it is for the architecture to achieve |
| `rating` | `met`, `partly-met` or `not-met`: how well the architecture, as assessed, meets the Scenario's measure. Absent while it is not rated |

The six parts — source, stimulus, artifact, environment, response, response measure — are the form of a quality attribute scenario of ATAM; stimulus, response and measure are what makes one checkable, and are required. Importance and difficulty place the Scenario in the utility tree (part 11). The ratings are ordered: `met` is better than `partly-met`, which is better than `not-met`.

The quality attributes are the eight characteristics of ISO/IEC 25010:2011 and their sub-characteristics, written in lowercase with dashes:

| Characteristic | Sub-characteristics |
| --- | --- |
| `functional-suitability` | `functional-completeness`, `functional-correctness`, `functional-appropriateness` |
| `performance-efficiency` | `time-behaviour`, `resource-utilization`, `capacity` |
| `compatibility` | `co-existence`, `interoperability` |
| `usability` | `appropriateness-recognizability`, `learnability`, `operability`, `user-error-protection`, `user-interface-aesthetics`, `accessibility` |
| `reliability` | `maturity`, `availability`, `fault-tolerance`, `recoverability` |
| `security` | `confidentiality`, `integrity`, `non-repudiation`, `accountability`, `authenticity` |
| `maintainability` | `modularity`, `reusability`, `analysability`, `modifiability`, `testability` |
| `portability` | `adaptability`, `installability`, `replaceability` |

`attribute: maintainability` and `attribute: maintainability/modifiability` are both a Scenario of maintainability; a sub-characteristic of another characteristic — `maintainability/capacity` — is a Problem.

### A Finding

| Key | Value |
| --- | --- |
| `finding` | the entry ID, required |
| `scenarios` | list of the IDs of Scenarios of this Assessment that it concerns |
| `evidence` | list of Traces: what the judgement rests on (below) |

The judgement itself is the entry's text. A Finding may name no Scenario and no evidence: a judgement can stand on the author's word.

### Evidence

Each item of `evidence` is a mapping that names one thing by one of six keys — its **kind** — with the keys that kind needs below it. Items are written in block style, one per item, as an Exception is in `.arch/rules.yml`.

| Kind | Written as | Names |
| --- | --- | --- |
| `violation` | `violation:` the Rule's ID, and the rest of the fingerprint: `from` and `to`; `cycle`; `component`; `file` and `name`; or `component` and `library` | a Violation, by its fingerprint ([conformance-format.md](conformance-format.md), section 3) |
| `metric` | `metric:` the metric's name, and its subject: `component`, or `file` and `name` | a metric value of a Component, or of a function or class in a Source File (part 13) |
| `annotation` | `annotation:` its ID | an Annotation ([review-format.md](review-format.md), section 1) |
| `adr` | `adr:` the ADR, as `cites` names one: `docs/adr/0003-x`, or the bare ID where one Decision Log has it ([review-format.md](review-format.md), section 2) | an ADR |
| `risk` | `risk:` its ID | a Risk (section 5) |
| `debt` | `debt:` its ID | a Technical Debt Item (section 5) |

```yaml
evidence:
  - violation: web-through-cart # a Dependency: from and to
    from: web
    to: catalog
  - violation: no-cycles-between-modules # a Cycle: its members, in any order
    cycle: [cart, web]
  - violation: cart-stays-stable # a threshold: its Component
    component: cart
  - violation: functions-stay-simple # a threshold per function (part 13)
    file: cart/src/main/java/com/shop/cart/Cart.java
    name: Cart.discount(long)
  - violation: no-database-in-the-web # a Rule about Libraries: its Component and the Library (part 15)
    component: web
    library: org.hibernate
  - metric: instability
    component: cart
  - metric: complexity # per function (part 13)
    file: cart/src/main/java/com/shop/cart/Cart.java
    name: Cart.discount(long)
  - annotation: 20261102-the-page-searches-the-catalog-itself
  - adr: 0001-the-web-shows-the-catalog-through-the-cart
  - risk: 20261103-a-change-to-the-search-breaks-the-page
  - debt: 20261103-two-classes-util-in-one-package
```

- A Violation is named by its fingerprint as **keys**, as an Exception names one ([ADR-0017](adr/0017-rules-and-exceptions-share-one-file-keyed-by-fingerprint.md)): the keys are matched, and messages print the fingerprint on one line — `web-through-cart: web -> catalog`. A fingerprint names Component IDs and paths as written, never a pattern. `file` and `name` stand for a function or for a class, whichever the Rule's metric is about, named as Structure names it: qualified by what contains it, a Java method with the types of its parameters — `Cart.discount(long)`, `Cart.total()` ([conformance-format.md](conformance-format.md), section 3).
- A metric is named as a Rule names it ([conformance-format.md](conformance-format.md), section 2): `files`, `lines`, `efferent-coupling`, `afferent-coupling`, `instability`, `fan-out`, `fan-in`, `relational-cohesion`, `internal-share`; from part 13 on `abstractness` and `distance` of a Component, `complexity` of a function, `lcom4` of a class, and `propagation-cost` of the level below a Component (`component: /`: of the top level, as a Rule names it). Its value is not written in the Finding: it is read from the Snapshot (section 4).
- An item with none of the six keys, or with two of them, or without the keys its kind needs, is a Problem of its form (section 7); so is an item that is no mapping.

## 3. What a Trace is checked against (part 10)

Every Trace is recorded on its source only — in the Assessment, the Risk, the Technical Debt Item — and what names a thing is computed ([ADR-0009](adr/0009-traces-are-recorded-on-the-source-only-unlike-back.md)): which Assessments name a Risk, which Findings cite a Component, which cite an ADR. A Trace to something that does not exist is a Problem of the file that carries it.

What the Traces are checked against comes from the modules it points to, and their caller hands it in — the app, the command line; `assessment` reads none of the other modules ([ADR-0006](adr/0006-one-core-package-per-module-on-a-shared-kernel.md)): the Components the declaration has, the fingerprints of the Violations the code has now, the metric values now, the IDs of the Annotations, the ADRs of the Decision Logs. What is not handed in is not checked: on a Draft, whose IDs follow directories, no Component is checked, and no Violation while the Rules cannot be evaluated.

**What people made** is checked always — the Components of `scope` and `components`, the Assessment of `previous`, the Scenarios of `scenarios`, and evidence of an Annotation, an ADR, a Risk or a Technical Debt Item: that it is there.

**What the suite derives** is checked as the Assessment's state allows:

- **A Violation** is checked while the Assessment is a **draft**: a Violation the code no longer has is a Problem — a Finding that cites a Violation that is gone says what its author has to look at again before the Assessment is final. A **final** Assessment's Violations are a record of its day and are not checked against today's code: the Violation that was fixed since is the point of an Assessment, not a mistake in it. Two Cycles are the same Violation only with the same members.
- **A metric value** is read from the Assessment's **Snapshot** when it has one, whether the code moved on or not: a metric the Snapshot does not hold for that subject is a Problem. A **draft** without a Snapshot reads it from the metric values now, and one the code does not have — a Component without Source Files has no instability — is a Problem. A **final** Assessment that cites a metric and has no Snapshot is a Problem: its evidence would read differently with every commit.

## 4. The Snapshot (part 10)

The **Snapshot** of an Assessment is the file beside it, named by its ID with `.snapshot.yml`: `20261103-the-shop-before-the-checkout-rewrite.snapshot.yml`. It holds the metric values of the repository's Components as Structure computed them when it was taken, and the commit it was taken at.

```yaml
# The Snapshot of 20261103-the-shop-before-the-checkout-rewrite, taken by the suite: the metric values when it was taken.
commit: 3f2a9c0e8b1d4f6a7c5e2b9d0f1a3c4e5b6d7f8a
date: 2026-11-03
components:
  /:
    propagation-cost: 0.5
  cart:
    files: 3
    lines: 43
    efferent-coupling: 2
    afferent-coupling: 2
    instability: 0.5
    fan-out: 1
    fan-in: 1
    relational-cohesion: 1
    internal-share: 0.3333333333333333
    abstractness: 0
    distance: 0.5
    propagation-cost: 0
  catalog:
    files: 3
    lines: 26
    efferent-coupling: 0
    afferent-coupling: 3
    instability: 0
    fan-out: 0
    fan-in: 2
    relational-cohesion: 1.3333333333333333
    internal-share: 0.5
    abstractness: 0.3333333333333333
    distance: 0.666666666667
    propagation-cost: 0.5
  # … and web
source-files:
  cart/src/main/java/com/shop/cart/Cart.java:
    Cart.add(Product):
      complexity: 1
    Cart.total():
      complexity: 1
    Cart.discount(long):
      complexity: 5
    Cart:
      lcom4: 1
  # … and the other Source Files that are no tests
```

| Key | Value |
| --- | --- |
| `commit` | the commit HEAD pointed at when it was taken, by its full name of 40 or 64 hexadecimal digits. Absent where there was none, or no git |
| `date` | `YYYY-MM-DD`: the day it was taken |
| `components` | a mapping from Component ID to a mapping from metric name to number: the metrics of each declared Component, and the propagation cost of the level below it. `/` stands for the top level, which lies below no Component, as in a Rule (part 13) |
| `source-files` | a mapping from the path of a Source File to a mapping from the qualified name of a function or class in it to a mapping from metric name to number: what is measured inside a file (part 13) |

- Metric names are those of section 2, "Evidence". The Snapshot freezes whatever metric values Structure computes: a name a later version brings is read and kept, and a metric of part 13 joins without a change of the format.
- The values are Structure's, by its definitions ([structure-format.md](structure-format.md), section 5), test files left out, written as the shortest decimal that reads back as the same number. A metric a Component does not have — instability where there is nothing to divide — is left out, and so is a Component without a Source File.
- The suite writes the Components in the order of their IDs, each metric in the order of the list in section 2 and names it does not know after them, the Source Files in the order of their paths, and what is inside a file in the order Structure measures it. The comment at the top says what the file is.
- The Snapshot is derived data, committed on purpose: one of the four places in which the vision lets derived data into the repository. It is written by the suite as a whole and not edited by hand — Take a Snapshot writes it anew, and Rename of a Component rewrites the IDs in `components` where they stand.
- It is **read the same however the code changes**: a Finding's metric evidence reads its value from here, and so do trends across Assessments (part 12).
- A Snapshot is taken only on a declaration: the Draft's IDs follow directories and are no names to freeze. Every declared Component is frozen, not only those in `scope`, so that a Finding may cite what lies outside it — the Component its scope depends on.

## 5. Risks and Technical Debt Items (part 10)

A **Risk** and a **Technical Debt Item** are each a Markdown file of their own, in their register's directory (section 1):

```markdown
---
state: open
date: 2026-11-03
owner: Lena Becker
components: [web, catalog]
---

# A change to the search breaks the page

`Page` uses `Search` itself. When the catalog changes how it searches, the page breaks,
and nothing in the cart would tell.
```

| Key | Value | Written by |
| --- | --- | --- |
| `state` | a Risk: `open`, `mitigated`, `accepted` or `closed`; a Technical Debt Item: `open`, `scheduled` or `paid-off` | create, Change the state |
| `date` | `YYYY-MM-DD`: the day it was recorded | create |
| `changed` | `YYYY-MM-DD`: the day its state last changed; absent while it never changed | Change the state |
| `owner` | a text: who looks after it | create |
| `components` | list of Component IDs — a Trace: what it concerns | create, Rename of a Component, its Repair |

- **Absent means default:** no `state` is `open`. Nothing is required: a file without frontmatter is an open entry of nobody in particular, about nothing in particular. The suite writes `state` and `date` always.
- A Risk is `open` until something is done: `mitigated` when its likelihood or impact has been lowered, `accepted` when it is borne knowingly, `closed` when it can no longer happen. A Technical Debt Item is `open` until it is `scheduled` — its paying off is planned — and `paid-off` when it is gone.
- The **title** is the first level-one heading of the body, as in an Assessment; the **description** is the rest of the body, the author's own.
- Keys of others are kept; keys are written in the order of the table, lists in flow style, as in an Assessment.
- **The Assessments that name it** are not stored: they are every Assessment with a Finding whose evidence names it, computed whenever they are asked for. A Risk outlives the Assessment in which it was first named, and the next Assessment names it again.

## 6. What each operation writes (part 10)

Nothing is written without a preview: every operation plans a change set ([ADR-0004](adr/0004-operations-return-change-sets.md)), and the window of part 11 builds on them.

| Operation | Writes |
| --- | --- |
| New Assessment | a new file: `date`, `status: draft`, `authors`, `scope` and `previous` where given, and the title as `# …` |
| New Assessment from the last one | the same, with `previous` the last Assessment — the latest by `date`, then by ID — and its `scope`; and its Quality Scenarios, under `## Quality Scenarios`, each as its heading and its block without `rating`, with the same IDs. Their texts, the ratings and the Findings stay behind |
| Add a Scenario | an entry: its heading, at the level of the Scenarios before it, and its block — after the last Scenario's text; the first one before the Findings — before the outermost section below the title that holds the first of them —, or at the end of the document, under `## Quality Scenarios` |
| Rate a Scenario | `rating` in its block: the value where it stands, or the key inserted in the order of the table; taken out to rate it no longer |
| Add a Finding | an entry: its heading, its block with `scenarios` and `evidence` where given, and its text — after the last Finding's text; the first one at the end of the document, under `## Findings` |
| Add evidence | an item at the end of the Finding's `evidence`, in block style; the key inserted when it is not there |
| Take a Snapshot | the Snapshot beside the Assessment, as a whole: a new file in the Assessment's line ending, or the whole of the one there, in its own line ending and with its byte order mark |
| Finish | `status: final` |
| New Risk, New Technical Debt Item | a new file: `state: open`, `date`, `owner` and `components` where given, the title, and the description |
| Change the state | `state` and `changed` of a Risk or a Technical Debt Item |
| Repair | the item of a Trace to what does not exist, taken out where it stands (section 7) |
| Rename of a Component | every item of `scope` and `components`, every `component`, `from`, `to` and member of `cycle` of a piece of evidence, and every key of a Snapshot's `components`, that names the old ID or one below it, rewritten where it stands |

- A heading and a block the suite writes look like the example of section 2: the heading at level 3 under a level-2 section, unless the entries before it have another level; the block in a fence of three backticks with `yaml`, its keys in the order of their table, a blank line around each. A text is written as it is given.
- Writes into the frontmatter and into a block splice what they change, as an Annotation's frontmatter does ([review-format.md](review-format.md), section 2). A file without frontmatter gets one at its top, a Risk changing its state say. Where something is written in a way a splice cannot serve — a mapping in braces that a key would have to be added to, a comment between two items, an alias —, the operation is refused, and a person changes it in an editor.
- Everything is refused in a file whose frontmatter cannot be read, and in an entry whose block cannot be read. A new entry is refused without its required keys, with a text that would not stay its own — one that holds a heading of the entry's level or higher, which would end it, or opens a code block or an HTML comment it does not close, which would hide what follows —, with an ID that is no entry ID or is taken, a quality attribute that ISO/IEC 25010 does not have, a rating or a level that is none of the values; a Finding with a Scenario the Assessment does not have; evidence that is there already in the Finding, or that names a Risk, a Technical Debt Item — or, where the caller hands in what there is, a Violation, an Annotation, an ADR — that does not exist; and a metric that the Assessment's Snapshot does not hold, or, without a Snapshot and where the caller hands in the values now, that the code does not have. A metric is checked against the Snapshot alone where there is one, however the code moved on, and against nothing where it cannot be read: that is a Problem of its own.
- A final Assessment takes no new Scenario, rating, Finding, evidence or Snapshot: its record is complete. Finish is refused for one that is final already, and New Assessment from the last one where there is no Assessment with a date, and where the scope it would carry over names a Component that is not declared — as New Assessment is for a scope given to it.
- Take a Snapshot is refused on a Draft, and Change the state to the state it has.
- Rename is refused where a file that names the old ID cannot be read — its frontmatter, an entry's block, a Snapshot —, and where an ID is written in a way a splice cannot serve: the suite cannot tell what it would leave behind. Text is not searched: what the author writes about a Component is the author's. The app's Rename takes this part along with the others (part 11).

## 7. Problems (part 10)

Assessment adds these **Problems**. Each has a code and an English sentence; the window words the code in its own language. An Assessment, a Risk or a Technical Debt Item with a Problem of its own file is still listed, with what can be read of it.

### Of the keys in `.arch/config.yml`

| Code | Sentence | Repair |
| --- | --- | --- |
| `invalid-directory-setting` | "*key*" in `.arch/config.yml` must be a relative path inside the repository. No Assessment — Risk, Technical Debt Item — is read until it is fixed. At the line of the key. | — |

### Of a file

| Code | Sentence | Repair |
| --- | --- | --- |
| `unreadable-assessment`, `unreadable-risk`, `unreadable-debt-item` | *file* cannot be read: *why* — its frontmatter is never closed, is not valid YAML, or is not a mapping. | — |
| `invalid-frontmatter-value` | *file*: "*key*" must be a text — a date of the form YYYY-MM-DD — a list of texts — a list of Component IDs — draft or final — open, mitigated, accepted or closed — open, scheduled or paid-off — the ID of an Assessment. | — |
| `assessment-without-date` | *file* has no date: "date" must say the day of the Assessment, as YYYY-MM-DD. | — |
| `unreadable-entry` | *file*, line *n*: the block of an entry cannot be read: *why* — it is not valid YAML, a key is written twice, its fence is never closed, or it lies in an HTML comment that is never closed. | — |
| `entry-of-two-kinds` | *file*, line *n*: a block is either a Quality Scenario or a Finding, and has both "scenario" and "finding". | — |
| `entry-without-heading` | *file*, line *n*: the block of *ID* does not directly follow a heading of level 2 to 6, which gives the entry its title. | — |
| `invalid-entry-id` | *file*, line *n*: "*ID*" is no ID of an entry: letters, digits, ".", "_" and "-", beginning with a letter or a digit. | — |
| `duplicate-entry` | *file*, line *n*: *ID* is there twice among its Quality Scenarios — Findings. The first one counts. | — |
| `missing-entry-key` | *file*: *ID* has no "*key*", which a Quality Scenario needs. | — |
| `invalid-entry-value` | *file*: *ID*: "*key*" must be a text — a list of IDs of Quality Scenarios — a list of evidence — H, M or L — met, partly-met or not-met. | — |
| `unknown-quality-attribute` | *file*: *ID* is about "*value*", which is no characteristic of ISO/IEC 25010, nor one of its sub-characteristics. | — |
| `invalid-evidence` | *file*, line *n*: a piece of evidence of *ID* is no mapping — names none of violation, metric, annotation, adr, risk and debt — names two of them — needs "*key*". | — |
| `unreadable-snapshot` | *file* cannot be read: *why* — it is not valid YAML, its top level is not a mapping, its commit is no full name, its date no day, its "*key*" does not map names to numbers. | — |
| `snapshot-without-assessment` | *file* is the Snapshot of *ID*, and there is no Assessment *ID*. | — |

### Of a Trace

| Code | Sentence | Repair |
| --- | --- | --- |
| `names-no-component` | *file* names *Component* in "*key*", which is not a declared Component. | the item is taken out |
| `unknown-previous-assessment` | *file* follows *ID*, which is no Assessment of this repository. | — |
| `finding-unknown-scenario` | *file*: *Finding* concerns *Scenario*, which is no Quality Scenario of this Assessment. | the item is taken out of `scenarios` |
| `violation-gone` | *file*: *Finding* cites the Violation *fingerprint*, which the code no longer has. Look at the Finding again: it may be resolved. | the piece of evidence is taken out |
| `metric-not-in-snapshot` | *file*: *Finding* cites *metric* of *subject*, which its Snapshot does not hold. | the piece of evidence is taken out |
| `metric-not-measured` | *file*: *Finding* cites *metric* of *subject*, which the code does not have. | the piece of evidence is taken out |
| `final-without-snapshot` | *file* is final and cites metric values, but has no Snapshot that keeps them: they read differently with every commit. | — |
| `finding-unknown-annotation` | *file*: *Finding* cites *ID*, which is no Annotation of this repository. | the piece of evidence is taken out |
| `finding-unknown-adr` | *file*: *Finding* cites *ADR*, which is no ADR of this repository. | the piece of evidence is taken out |
| `finding-ambiguous-adr` | *file*: *Finding* cites *ADR*, which several Decision Logs have: *log/ID*, *log/ID*. Name it with its log. | — |
| `finding-unknown-risk` | *file*: *Finding* cites *ID*, which is no Risk of this repository. | the piece of evidence is taken out |
| `finding-unknown-debt-item` | *file*: *Finding* cites *ID*, which is no Technical Debt Item of this repository. | the piece of evidence is taken out |

- A Repair takes out the one item that points nowhere, where it stands — an item of a block list with its own lines and the comments indented below its dash; a blank line, or a comment at the dash, belongs to what follows —, and never puts one in: where something was renamed by hand, only a person knows the new name ([ADR-0009](adr/0009-traces-are-recorded-on-the-source-only-unlike-back.md)). It writes into a final Assessment too: a Trace that points nowhere is no record of anything.
- A Problem of a file's form comes first: the Traces of an entry that cannot be read are not checked.
- A Trace is checked against what the caller hands in (section 3); an ADR of another repository (`name:log/ID`) is no ADR of this one.

## 8. What is not in the repository

- The Violations and metric values of the code now, the Problems, and every Trace in the other direction — which Findings cite a Component, which Assessments name a Risk.
- The utility tree, a report, a trend, a comparison of two Assessments (parts 11 and 12): each is computed from the files above.
- A score of any kind. A rating is a person's, Scenario by Scenario; the suite adds nothing up.
