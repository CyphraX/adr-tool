# Conformance format

The contract of the Conformance module: what the Rules of a repository look like on disk, what each kind of Rule means, how a Violation is found and named, and how an Exception accepts one. The `conformance` package and `adr check` implement exactly this document, and an agent or a person who follows it can write Rules without the app.

Vocabulary follows the [Conformance glossary](contexts/conformance/CONTEXT.md), the [Structure glossary](contexts/structure/CONTEXT.md) and the shared language in [CONTEXT-MAP.md](../CONTEXT-MAP.md). Where the module sits in the suite is in [vision.md](vision.md); how it gets built is in [plan-vision.md](plan-vision.md), parts 3 to 5. Every section names the part it arrives with, so that this document never promises more than the code does. The shape of the file, where Exceptions live and the fingerprint are recorded in [ADR-0017](adr/0017-rules-and-exceptions-share-one-file-keyed-by-fingerprint.md).

Three rules stand above everything else, as for the declaration of Components ([structure-format.md](structure-format.md)):

- **The suite never changes a byte it was not asked to change** ([ADR-0002](adr/0002-never-reserialize-markdown.md)). `.arch/rules.yml` is edited by people, by agents and — from part 4 on — by the suite alike; whatever the suite writes there, nothing else in the file moves.
- **Rules are declarative** ([ADR-0007](adr/0007-the-analysis-never-executes-anything-from-the-analysed.md)). A Rule says what holds; no Rule is a script, and nothing in the file is run.
- **Violations are derived and never stored.** What enters the file is what a person decides: a Rule, an Exception, an applied Pattern — whose Rules are derived from it.

## 1. The file (part 3)

The Rules of a repository are in one file, `.arch/rules.yml`, in the repository root, beside `.arch/components.yml`.

```yaml
# .arch/rules.yml
rules:
  - id: billing-not-web
    why: Billing is the domain; the web is how it is shown, and may change without it.
    kind: must-not-depend
    from: billing
    to: [web]

  - id: layered
    why: Each layer uses the ones below it and is used by the ones above.
    kind: layers
    layers: [web, [billing, shipping], persistence]

exceptions:
  - rule: billing-not-web
    from: billing
    to: web
    reason: The invoice reuses the date format of the web until it has one of its own.
    justified-by: docs/adr/0012-invoices-format-dates-like-the-web
```

Three keys at the top, each optional:

| Key          | Value            | What it holds                                                          |
| ------------ | ---------------- | ---------------------------------------------------------------------- |
| `rules`      | list of Rules    | What the code may look like (section 2).                               |
| `exceptions` | list of Exceptions | Violations the architect has accepted (section 4).                   |
| `patterns`   | list of applied Patterns | Which Pattern was applied, and which Components fill its roles (section 6, part 5). |

A file without any of them, or an empty file, has no Rules. A repository without the file has no Rules: `adr check` checks its Decision Logs and its declaration, and says that there are no Rules.

### How it is written

- **One item per Rule, in block style**, as above: a Rule is a list item that begins with `- id:`, and its keys stand below it. That is what a form adds, changes and removes from part 4 on: a new Rule is appended to the end of `rules`, a changed Rule changes the lines of its keys, a removed Rule takes its lines and nothing else. The same holds for Exceptions and applied Patterns. A blank line between items is kept where it is.
- **Read tolerantly.** A list may also be written in flow style (`[a, b]`), a single value where a list is expected is read as a list of one, values may be quoted or not, and comments stand anywhere. Keys the suite does not know are preserved and ignored, at the top and inside every item, as foreign keys are in an ADR's frontmatter: a later version of the suite adds keys, and an earlier one leaves them alone.
- **The suite writes only by splicing** (from part 4 on): it finds where an item stands and edits the text there. Where the file is written in a way a splice cannot serve — an item in braces, an anchor or alias, a document end marker — the form refuses with a sentence and leaves the change to an editor. Whatever the suite hands out has been checked to read back as what was meant.
- A pattern that begins with `*` is a YAML alias when it stands unquoted, and is quoted: `from: '*'`, `to: ['**']`. `ui/**` needs no quotes.

### Every Rule

| Key    | Value                          | Meaning |
| ------ | ------------------------------ | ------- |
| `id`   | Rule ID, required              | The stable name of the Rule: lowercase letters, digits and dashes, starting and ending with a letter or a digit, as a segment of a Component ID is. Unique in the file. Exceptions and messages name the Rule by it. |
| `why`  | one sentence, required         | Why the Rule holds, in the architect's words. Every message about a Violation of the Rule carries it. |
| `kind` | one of the kinds of section 2, required | What the Rule says. |
| `tests` | `excluded` (default) or `included` | Whether test files count (structure-format.md, section 2, "Tests"). As in Structure's views, Cycles and metrics, they are left out unless the Rule takes them in. |
| `type-only` | `counted` (default) or `ignored` | Whether type-only Dependencies count (structure-format.md, section 3). They count, as in Structure's metrics: a type couples code at compile time too. A Rule that is only about run time ignores them. Not for `threshold`, whose metric says what it counts. |

`tests` and `type-only` are read for every kind that counts Dependencies: `must-not-depend`, `may-only-depend`, `layers` and `no-cycles`. `tests` is read for `threshold` too.

### Naming Components

Rules name Components by their Component ID ([structure-format.md](structure-format.md), section 1), never by a directory, a display name or a path. Wherever a Rule takes Components, it takes a list of **Component patterns** — a single one is read as a list of one:

- A pattern is matched against the IDs of the declared Components, segment by segment, separated by `/`. A pattern without a wildcard is a Component ID, and names that Component.
- `*` matches any run of characters within one segment: `*` alone matches every top-level Component, `features/*` every child of `features`, `api-*` every top-level Component whose ID begins with `api-`.
- `**` as a whole segment matches any number of segments, none included: `ui/**` matches `ui` and every Component below it, `**` every Component, `**/api` every Component whose last segment is `api`.
- Directory nodes (structure-format.md, section 4) are no Components: nothing declares them, and no pattern matches them. Who wants a directory named by a Rule declares it as a Component.
- **Rules are evaluated on the declaration.** While `.arch/components.yml` declares no Components, or cannot be read, the suite works on the Draft, whose IDs follow directories and are no names to write down, as for Traces ([ADR-0009](adr/0009-traces-are-recorded-on-the-source-only-unlike-back.md)). Then no Rule is evaluated, and that is a Problem (section 5).

A Rule names Components as a Trace does, and is checked like one: a Component ID that the declaration does not have is a Problem, and so is a pattern with a wildcard that matches no declared Component (section 5). A Rule with such a name is still evaluated with the names that do exist.

## 2. The kinds of Rules (part 3)

Every Rule is evaluated on Structure's model: the Components the declaration has, the Source Files each one owns and contains, the Dependencies between Source Files ([structure-format.md](structure-format.md), sections 1 to 5). Where a Rule counts Dependencies, it counts the Dependencies between Source Files: each pair of files once, with the lines of its imports.

### Where a Dependency stands

A Source File is contained by a chain of Components, from the top-level one down to the Component that owns it; an Unassigned Source File by none. For a Dependency from file `f` to file `g`, the Components that contain both are where it is internal; below them, the two chains part. A Rule sees the Dependency **at the outermost Component it names below that point**, on each side:

- its **source** is the first Component of `f`'s chain, from the top, that contains `f` but not `g` and that the Rule's patterns match;
- its **target**, likewise, the first Component of `g`'s chain that contains `g` but not `f` and that the patterns match.

So `billing` stands for everything it contains, its children included — `from: billing` is broken by a file in `billing/invoices` as well; a Rule on `features/*` sees each feature as one; and a Dependency within one Component is never one between two. Choosing the outermost Component keeps a Violation where it is when a child Component is declared later beneath one side.

### `must-not-depend`

```yaml
- id: no-persistence-in-ui
  why: The UI talks to the domain, which decides what is stored.
  kind: must-not-depend
  from: ui/**
  to: [persistence]
```

| Key    | Value              |
| ------ | ------------------ |
| `from` | Component patterns, required |
| `to`   | Component patterns, required |

A Dependency breaks the Rule when it has a source among `from` and a target among `to` — two different Components, neither of which contains the other. The Violation is the pair of the two: **`from` must not depend on `to`**. `from` and `to` may overlap: `from: features/*` and `to: features/*` forbid the features to depend on each other, and `from: [core, structure]` with `to: [core, structure]` forbids the two to depend on each other in either direction.

An Unassigned Source File is in no Component, and no pattern names it: a Dependency on it never breaks this Rule.

### `may-only-depend`

```yaml
- id: kernel-depends-on-nothing
  why: Every module stands on the kernel, so it can lean on none of them.
  kind: may-only-depend
  from: kernel
  to: []
```

| Key    | Value              |
| ------ | ------------------ |
| `from` | Component patterns, required |
| `to`   | Component patterns, required; an empty list allows nothing |

What is not allowed is forbidden. A Dependency breaks the Rule when it has a source among `from`, and none of the Components that contain its target file is among `to`. Its target in the Violation is the Component where the chains part — the one below the Components that contain both files, on the side of `g`; the parent itself when `g` lies in its own files; and `(unassigned)` when `g` is Unassigned. **An Unassigned file breaks this Rule**: what no Component claims cannot have been allowed. Who means it to be allowed declares it as a Component and names that.

A Component contains its children, and a Dependency inside it is never one between two: `from: kernel` may use everything inside `kernel` without saying so.

### `layers`

```yaml
- id: layered
  why: The window uses the command line and the server, which use the module cores, which use the kernel.
  kind: layers
  mode: relaxed
  layers: [app, [cli, mcp], [core, structure], kernel]
```

| Key      | Value |
| -------- | ----- |
| `layers` | required: the layers, the top one first, at least two; each layer is a Component pattern, or a list of them |
| `mode`   | `relaxed` (default): a layer may depend on every layer below it; `strict`: only on the one right below |

A Dependency is ruled by the layering when its source and its target are both in a layer: the source the outermost Component below the parting point that a layer's patterns match, the target likewise. A Component that two layers match belongs to the first. Within one layer, Components may depend on each other; a Rule of its own forbids that where it is meant. A Dependency breaks the Rule when its target lies in a layer **above** its source's, and in `strict` mode also when it lies **more than one layer below**. A Dependency on a Component outside every layer, or on an Unassigned file, is not the layering's business.

### `no-cycles`

```yaml
- id: no-cycles-between-packages
  why: A package that is part of a Cycle can be neither understood nor released on its own.
  kind: no-cycles
  among: '*'

- id: no-cycles-in-the-kernel
  why: The kernel stays small enough to read from one end to the other.
  kind: no-cycles
  inside: kernel
```

| Key      | Value |
| -------- | ----- |
| `among`  | Component patterns: no Cycle among the Components they match |
| `inside` | Component patterns: no Cycle among the Source Files of each Component they match |

A Rule has `among` or `inside`, not both.

- **`among`** takes the matched Components as the nodes of a graph — `'*'` the top level, `core/*` the children of `core` — with a Dependency from one node to another wherever a Dependency between their files stands there, as above. Every Cycle among them, as Structure finds Cycles (structure-format.md, section 4, "Cycles"), is a Violation. The Source File Dependencies behind it are those of its weakest Dependency, which Structure names as the candidate for cutting.
- **`inside`** looks at the Source Files each matched Component contains, its children's included: every Cycle among them is a Violation. A Cycle inside a Component that another matched Component contains as well is reported once, for the innermost one. The Source File Dependencies behind it are those of its round trip.
- A Cycle of type-only Dependencies alone does not exist at run time, as Structure marks it; with `type-only: ignored` it is not found at all.

### `threshold`

```yaml
- id: kernel-stays-stable
  why: Every module depends on the kernel; it must not depend on anything that moves.
  kind: threshold
  metric: instability
  max: 0.2
  of: kernel
```

| Key      | Value |
| -------- | ----- |
| `metric` | required: a metric of the table below |
| `max`    | a number: the metric must not be above it |
| `min`    | a number: the metric must not be below it |
| `of`     | Component patterns, required: the Components whose metric is checked |

A Rule has `max`, `min` or both. Each Component that `of` matches and that has the metric — a Component that contains no Source File has none, and instability and internal share are undefined where there is nothing to divide — breaks the Rule when its value lies outside. The values are Structure's, by its definitions (structure-format.md, section 5), test files left out unless `tests: included`. A Violation of a threshold has no Source File Dependencies behind it; it is reported at the Rule.

| Metric | Structure's name | Arrives with |
| ------ | ---------------- | ------------ |
| `files` | Size: Source Files contained | part 3 |
| `lines` | Size: lines of those files | part 3 |
| `efferent-coupling` | Efferent coupling, Ce | part 3 |
| `afferent-coupling` | Afferent coupling, Ca | part 3 |
| `instability` | Instability, I | part 3 |
| `fan-out` | Fan-out | part 3 |
| `fan-in` | Fan-in | part 3 |
| `relational-cohesion` | Relational cohesion, H | part 3 |
| `internal-share` | Internal share | part 3 |
| `abstractness`, `distance` | Abstractness, distance from the main sequence, per Component | part 13 |
| `complexity` | Cyclomatic complexity, per function — a Violation per function, at its line | part 13 |
| `lcom4` | LCOM4, per class — a Violation per class, at its line | part 13 |
| `propagation-cost` | Propagation cost, of the level below each matched Component (`'*'`: the top level) | part 13 |

A metric is named in lowercase words joined by dashes. A metric has a subject — a Component, a function, a class, a level —, and its Violations are named by it (section 3). A metric the suite does not know is a Problem of the Rule: a name that a later version knows is read by that version.

## 3. Violations and their fingerprint (part 3)

A **Violation** is one place where the code breaks a Rule. It is derived whenever the code is analysed and never stored. Each one has:

- its **Rule**, and the sentence of its `why`;
- what it is about: its **source** and **target** Components, the **members** of its Cycle, or its **Component** and the value of its metric;
- the **Source File Dependencies behind it** — each a pair of Source Files, the one that uses and the one it uses, with the lines of the imports that cause it — except for a threshold;
- its **fingerprint**.

### The fingerprint

The **fingerprint** names a Violation without line numbers, so that it stays the same when lines move, when a file gets another import of the same kind, and when the Violation is found again tomorrow. It is what an Exception names (section 4), and what a Baseline (part 5) and a Finding (part 10) will name. It is made of the Rule's ID and of what the Violation is about, by the kind of the Rule:

| Kind | Fingerprint | Written as |
| ---- | ----------- | ---------- |
| `must-not-depend`, `may-only-depend`, `layers` | the Rule, the source Component, the target Component | `rule`, `from`, `to` |
| `no-cycles` | the Rule, and the members of the Cycle: Component IDs for `among`, the paths of Source Files for `inside`, in any order | `rule`, `cycle` |
| `threshold` | the Rule, and the Component | `rule`, `component` |
| `threshold` on a metric per function or per class (part 13) | the Rule, the Source File, and the name of the function or class | `rule`, `file`, `name` |

Two Violations never share a fingerprint: a Rule has one Violation per pair, per Cycle, per Component. Where lines move, nothing in a fingerprint changes; where a Component is renamed, Rename rewrites the IDs in the fingerprints of the Exceptions together with the Rules (section 7). A fingerprint that names Source Files — the Cycles found `inside` a Component — changes when one of them is moved: its Exception then matches nothing any more, and says so.

In messages and in the JSON of `adr check` the fingerprint is also written on one line: `billing-not-web: billing -> web`, `no-cycles-in-the-kernel: packages/kernel/src/a.ts, packages/kernel/src/b.ts` (sorted), `kernel-stays-stable: kernel`. That line is for reading; the keys are what is matched.

### What a Violation says

Each Violation has a code — the kind of its Rule — and an English sentence, as every Problem does (part 12 of [plan-roadmap.md](plan-roadmap.md)): a window in another language words the code itself. Together with one of its Source File Dependencies it says where:

```
billing must not depend on web: packages/billing/src/invoice.ts:3 imports packages/web/src/format.ts.
```

| Code | The sentence |
| ---- | ------------ |
| `must-not-depend` | `<from>` must not depend on `<to>` |
| `may-only-depend` | `<from>` may only depend on `<allowed>` (or: may depend on no other Component), and depends on `<to>` |
| `layers` | `<from>` must not depend on `<to>`, which lies in a layer above it (in `strict` mode also: which lies more than one layer below it) |
| `no-cycles` | `<members>` depend on each other in a Cycle: `<round trip>` |
| `threshold` | The metric `<metric>` of `<component>` is `<value>`, above the maximum of `<max>` (or: below the minimum of `<min>`) |

## 4. Exceptions (part 3)

An **Exception** is a Violation the architect has accepted. It is written in `.arch/rules.yml`, under `exceptions`, next to the Rule it excepts from ([ADR-0017](adr/0017-rules-and-exceptions-share-one-file-keyed-by-fingerprint.md)), one item per Exception, in block style.

```yaml
exceptions:
  - rule: billing-not-web
    from: billing
    to: web
    reason: The invoice reuses the date format of the web until it has one of its own.
    justified-by: docs/adr/0012-invoices-format-dates-like-the-web
```

| Key            | Value |
| -------------- | ----- |
| `rule`         | required: the ID of the Rule |
| the fingerprint | required: `from` and `to`, `cycle`, or `component`, by the kind of the Rule (section 3) — Component IDs and paths as written, no patterns |
| `reason`       | required: why the Violation is accepted, in a sentence |
| `justified-by` | optional: the ADR that justifies it — a Trace from the Exception to Decisions |

- An Exception **matches** the Violation whose fingerprint it names. A Violation that an Exception matches is accepted: it is listed, with its Exception, and it does not fail `adr check`.
- **`justified-by`** names an ADR as the repository names it from outside a Decision Log ([file-format.md](file-format.md), section 3): the directory of its log and its ID, joined by `/` — `docs/adr/0012-invoices-format-dates-like-the-web`, `./0001-x` for a log at the root of the repository. Where the repository has one Decision Log, its bare ID names an ADR of it too. An ADR of another repository is named `<name>:<log>/<ID>`; whether it exists is known only where that repository is open too, and it is taken as written. The Trace is recorded on the Exception alone; which Exceptions an ADR justifies is computed ([ADR-0009](adr/0009-traces-are-recorded-on-the-source-only-unlike-back.md)).
- An Exception that matches no Violation is a Problem: the Violation is gone — the code was fixed, or the Rule changed — and the Exception goes with it. So is an Exception whose ADR does not exist (section 5).

## 5. Problems (part 3)

Conformance adds these **Problems** about `.arch/rules.yml`. Each has a code and an English sentence, and is reported at the line of the file it is about. A Rule with a Problem of its own form is not evaluated; its Exceptions are not matched and not reported as matching nothing.

| Code | The Problem |
| ---- | ----------- |
| `unreadable-rules` | The file cannot be read: it is not YAML, its top level is not a map, or `rules`, `exceptions` or `patterns` is not a list. Nothing in it is evaluated |
| `rules-without-declaration` | The file has Rules, and `.arch/components.yml` declares no Components that can be read. No Rule is evaluated: the Draft's IDs are no names to write down |
| `unknown-rule-kind` | A Rule has no `kind`, or one the suite does not know |
| `invalid-rule` | A key of a Rule is missing or has a value of the wrong form: no `id`, no `why`, an ID that is no valid Rule ID, `from` without `to`, fewer than two layers, a metric the suite does not know, `max` that is no number, … The sentence names the key |
| `duplicate-rule` | Two Rules have the same ID. The first is evaluated, the second is not |
| `unknown-component` | A Rule, or an applied Pattern, names a Component ID that `.arch/components.yml` does not declare |
| `no-component-matches` | A Component pattern with a wildcard matches no declared Component |
| `invalid-exception` | A key of an Exception is missing or has a value of the wrong form: no `rule`, no `reason`, a fingerprint that does not fit the kind of its Rule |
| `exception-unknown-rule` | An Exception names a Rule that the file does not have |
| `unmatched-exception` | An Exception matches no Violation: the Violation is gone, and so should the Exception be |
| `duplicate-exception` | Two Exceptions name the same fingerprint. The first one matches |
| `unknown-justification` | `justified-by` names an ADR that the repository does not have |
| `invalid-applied-pattern` | An applied Pattern has no `id` or no `pattern`, or `roles` is not a map of Component patterns (part 5) |

There is no Repair for any of them yet; the Repairs arrive with the window in part 4 — the one for an Exception that matches nothing takes its lines out. Problems of Conformance appear in the Problems of the repository beside those of the Decision Logs and of the declaration, grouped by module.

## 6. Applied Patterns (part 5)

A **Pattern** is a named set of Rules written in roles — layered, hexagonal, clean architecture, modular monolith. Applying one to a repository records the **applied Pattern** in `.arch/rules.yml`: which Pattern it is, and which Components fill which of its roles. That is all that is written. The Rules the Pattern stands for are derived from it whenever the file is read, listed with the written Rules and evaluated, excepted from and reported as any other, each saying which applied Pattern and which role it comes from. Assigning a Component to another role changes the Rules with it; a Rule that should say something else is written as a Rule of its own.

```yaml
patterns:
  - id: shop-hexagon
    pattern: hexagonal
    roles:
      domain: [billing, shipping]
      ports: [billing/ports, shipping/ports]
      adapters: [web, persistence]
```

| Key       | Value |
| --------- | ----- |
| `id`      | required: a name for the application, written as a Rule ID is |
| `pattern` | required: which Pattern was applied |
| `roles`   | a map from each role to the Component patterns that fill it |

- A derived Rule has an ID of the applied Pattern's `id`, a `/`, and the Pattern's own name for the Rule: `shop-hexagon/domain-inward`. A written Rule's ID has no `/`, so the two never meet; an Exception names a derived Rule by that ID, as any other.
- Part 3 reads applied Patterns as far as this section goes: their form, and the Component IDs of their roles, are checked as a Rule's are (section 5). Part 5 defines the Patterns, their roles and the Rules each one stands for; until then an applied Pattern derives no Rule, and an Exception that names one of its Rules names a Rule that is not there.

## 7. What changes the file

From part 4 on the window writes Rules and Exceptions, each as a previewed change of its own lines (section 1). Before that, one operation of the suite already does:

- **Rename of a Component** ([structure-format.md](structure-format.md), section 1) rewrites, in the same change set, every Component ID in `.arch/rules.yml` that names the old ID or one below it: in `from`, `to`, `layers`, `among`, `inside` and `of` of the Rules, in the fingerprints of the Exceptions, in the roles of the applied Patterns. A pattern is rewritten where its leading segments, before the first wildcard, are the old ID or begin with it: `core/**` becomes `domain/**` when `core` is renamed to `domain`; a pattern that may match the Component without naming it — `*`, `cor*` — stays as it is, and matches what it matches. The item is rewritten where it stands, its quoting kept. Rename is refused while the file cannot be read, and where an ID is written in a way a splice cannot serve.

## 8. What is not in the repository

Violations, and which of them an Exception accepts, are derived and never stored: they are computed from the Rules and Structure's model whenever the code is analysed — by the app in the background, by `adr check` afresh on every run ([cli.md](cli.md)). The Baseline of part 5 will be the one place where Violations as a set are recorded, in a file of its own, `.arch/baseline.yml`.
