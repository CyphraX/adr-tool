# The command line — `adr`

The contract of the suite's command line (`packages/cli`): what it reads, what it prints, and how it ends. It is written for CI first — a pipeline that should fail when a Decision Log breaks — and for anyone who wants the app's checks without the window. It is built on `core` and says what the app says ([plan-roadmap.md](plan-roadmap.md), part 4); `adr check` adds `structure` and `conformance` ([plan-vision.md](plan-vision.md), part 3).

`adr lint` and `adr check` read and never write. Repairs stay in the app, where each one is previewed. `adr export` writes, and only into the directory it is given ([ADR-0014](adr/0014-the-export-is-static-html-from-core-printed-to-pdf-by.md)).

## Running it

The command is one file with nothing to install beside it: `pnpm build` writes it to `packages/cli/dist/adr.mjs`, and Node.js 22.12 or later runs it, wherever it is copied to — the `.mjs` makes it a module whatever `package.json` stands beside it. It is about 13 MB: the TypeScript compiler, which `adr check` reads TypeScript and JavaScript with, is most of it, and the WebAssembly of tree-sitter and its grammars of Java, Python and Go are in it as text ([ADR-0017](adr/0017-rules-and-exceptions-share-one-file-keyed-by-fingerprint.md)), so that nothing has to stand beside it.

```sh
node packages/cli/dist/adr.mjs lint            # the repository in the current directory
node packages/cli/dist/adr.mjs lint ../shop    # another one
node packages/cli/dist/adr.mjs check           # the same, and the Rules against the code
pnpm adr lint                                 # the same, from this repository
node packages/cli/dist/adr.mjs export --out site   # the Decision Logs as pages, into ./site
```

It is not published to npm yet; that comes with distribution (roadmap, "Before the first public release").

## `adr lint [path] [--format text|json|github]`

Options may stand anywhere on the line; `--` ends them, so that `adr lint -- -odd-name` checks the directory `-odd-name`.

Finds the Decision Logs of the repository at `path` — the current directory when it is left out — exactly as the app does ([file-format.md, section 6](file-format.md#6-finding-decision-logs)), checks them by the rules of [file-format.md, "Consistency"](file-format.md#consistency--what-counts-as-a-problem), and prints every Problem with the file and the line it is about.

`path` is the root of the repository, the directory the Decision Logs are found from. Traces in `affects` are checked against `.arch/components.yml` when that file declares Components that can be read, as in the app; otherwise they are not checked — when the file is there and cannot be read, standard error says so. A path that would lead out of `path` — with `..`, or through a symbolic link — is no file of the repository; only regular files and directories are. A file that is there and cannot be read is named on standard error and left out; the check goes on. Nothing is written.

### What it prints

One line per Problem, the file relative to `path`. A line break or another control character in a value is written as its escape (`\n`), so that a Problem never takes two lines:

```
docs/adr/0003-new-database.md:6: unknown-target: depends-on names 0042-never-written, which is not in this Decision Log.
```

- **The file** is the ADR the Problem is reported on — the first of them, sorted, when it is reported on several (two ADRs that share a number, a cycle of `supersedes`). A Problem of the repository as a whole names the configuration file, or the configured directory that is missing.
- **The line** is the line of the Metadata key the Problem is about, or of the item in its list; the line of the Status for a Problem with the Status; the line the YAML parser stopped at for frontmatter that cannot be read; line 1 when the file says nothing that could be pointed at — a Back-reference that is missing altogether. The text below a frontmatter is never searched: what it says is no Metadata. In a file of a foreign format, the line is the one where that format writes the Status — the `## Status` section of adr-tools, the `* Status:` item of MADR 2, the `status` key of MADR — or the link in it that the Problem names. Two ADRs that share a number do so by their file names, and a Problem of the repository as a whole is about a file or directory as such: they have no line, and are printed as `path: code: message`.
- **The code** says which Problem it is, in words that stay: a pipeline may filter by it. The codes are listed below.
- **The message** is the sentence the app shows for the same Problem.

A Problem that is only reported because of another one — what an ADR whose frontmatter cannot be read, or whose Status is none of the five values, causes on other ADRs — is printed indented under its root cause, after a line that says so. It goes away with its root cause and is not counted on its own:

```
docs/adr/0002-new.md:2: invalid-metadata: status: "approved" is not one of proposed, accepted, rejected, deprecated, superseded
  Reported only because the Status of 0002-new is none of the five values, which voids its Relations.
  docs/adr/0001-old.md:3: unfounded-back-reference: superseded-by lists 0002-new, which has no such Relation in effect.
  docs/adr/0001-old.md:2: superseded-without-successor: The Status is superseded, but no accepted ADR supersedes this one.
```

After an empty line, the last line counts: `1 Problem in 1 Decision Log, and 2 that follow from it.`, `2 Problems in the configuration and 1 Decision Log.` when a Problem of the repository as a whole is among them, or `No Problems in 2 Decision Logs.` Problems of the repository as a whole come first, then the Problems of each Decision Log in the order the logs are found, each log's in the order `core` finds them.

`--format json` prints one JSON document instead, and nothing else:

```json
{
  "logs": ["docs/adr"],
  "problems": [
    {
      "code": "unknown-target",
      "message": "depends-on names 0042-never-written, which is not in this Decision Log.",
      "path": "docs/adr/0003-new-database.md",
      "line": 6,
      "log": "docs/adr",
      "problem": { "kind": "unknown-target", "adr": "0003-new-database", "key": "depends-on", "target": "0042-never-written" },
      "consequences": []
    }
  ]
}
```

`line` and `log` are left out where there is none; `problem` is the Problem as `core` reports it, its `kind` the same as `code`; `consequences` holds the Problems that follow from this one, each in the same form without `consequences` of its own.

`--format github` prints one [workflow command](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands#setting-an-error-message) per Problem, so that a pull request shows each Problem on the line it is about:

```
::error file=docs/adr/0003-new-database.md,line=6,title=unknown-target::depends-on names 0042-never-written, which is not in this Decision Log.
```

A Problem that follows from another one is printed as a notice (`::notice`), its message followed by the sentence that names its root cause. The count comes last, as a line of its own. GitHub names files from the directory the job runs in, the checkout, and so does this format: run from there, `adr lint services/billing --format github` writes `file=services/billing/docs/adr/…`. GitHub shows only a limited number of annotations per step; the log of the step holds all of them.

### How it ends

| Exit code | When |
| --------- | ---- |
| 0 | Every Decision Log was checked, and there is no Problem |
| 1 | There is at least one Problem |
| 2 | Nothing could be checked: `path` is no directory, no Decision Log was found there, the command line is not understood, or reading failed in a way the command did not expect. What went wrong is printed to standard error |

A repository without a Decision Log ends with 2 and not with 0 on purpose: a pipeline that runs the command in the wrong directory should not pass.

### The codes

The code of a Problem is its kind in `core` (`packages/core/src/problems/problem.ts`).

| Code | The Problem |
| ---- | ----------- |
| `unterminated-frontmatter` | The frontmatter opens with `---` and is never closed |
| `invalid-frontmatter` | The frontmatter is not valid YAML, not a mapping, or has a key twice |
| `invalid-metadata` | A Metadata value has the wrong type or form: a Status outside the five values, a malformed date, `decided` on a proposed ADR, … The message names the key |
| `status-not-lowercase` | The Status is one of the five values, not written in lowercase |
| `unknown-target` | A Relation or Back-reference names an ID that is not in the Decision Log |
| `self-reference` | A Relation or Back-reference names the ADR's own ID |
| `unknown-component` | `affects` names a Component that `.arch/components.yml` does not declare |
| `missing-back-reference` | An accepted ADR supersedes or amends this one, which does not name it in `superseded-by` or `amended-by` |
| `unfounded-back-reference` | `superseded-by` or `amended-by` names an ADR that has no such Relation in effect |
| `not-marked-superseded` | An accepted ADR supersedes this one, whose Status is not `superseded` |
| `superseded-without-successor` | The Status is `superseded`, and no accepted ADR supersedes this one |
| `supersedes-cycle` | ADRs supersede each other in a circle |
| `duplicate-number` | Two ADRs of a `sequential` log share a number |
| `invalid-configuration` | `.adr/config.yml` or `.adr-dir` cannot be used as written |
| `missing-log-directory` | A configured Decision Log directory does not exist |
| `other-repository` | `supersedes`, `amends`, `superseded-by` or `amended-by` names an ADR of another repository (`<name>:<log>/<ID>`); only `depends-on` and `relates-to` may ([file-format.md, section 3](file-format.md#3-metadata)) |

A new kind of Problem gets a new code. A code is never given a different meaning, and is renamed only with a note in this document.

## `adr check [path] [--format text|json|github]`

Does what `adr lint` does, then checks the declaration of Components in `.arch/components.yml` ([structure-format.md](structure-format.md)), the Rules in `.arch/rules.yml` against the code ([conformance-format.md](conformance-format.md)), and the Diagrams ([diagrams-format.md](diagrams-format.md)): their Problems, whether the picture beside each is current, and their Drift against the code. It fails on every Problem — of a Decision Log, of `.arch/config.yml`, of the declaration, of the file of Rules, of a Diagram or its picture — and on every Violation that no Exception accepts; Drift is noted, and fails nothing. Its options are those of `adr lint`, and they may stand anywhere on the line.

```sh
node packages/cli/dist/adr.mjs check                  # the repository in the current directory
node packages/cli/dist/adr.mjs check --format github  # in a pipeline
```

- **The Decision Logs** are found and checked as `adr lint` checks them, with the same lines and codes. A repository without one is checked all the same, when it has `.arch/components.yml` or `.arch/rules.yml`.
- **The files of the repository** are what the app lists ([structure-format.md, section 2](structure-format.md#2-source-files-part-2)): in a git repository, what git tracks and what it neither tracks nor ignores; elsewhere, a walk of the directory that honours `.gitignore`. git is run without a pager, without locks, without the file system monitor and without fetching what a partial clone lacks; nothing the repository brings along is run ([ADR-0007](adr/0007-the-analysis-never-executes-anything-from-the-analysed.md)).
- **The code** is read only when a Rule or the Drift of a Diagram needs it: TypeScript and JavaScript with the TypeScript compiler, Java, Python and Go with the tree-sitter grammars that the command carries. A Source File that cannot be parsed is named on standard error; it has no Dependencies of its own, and the check goes on — so does one the parser fails on as a whole, nested too deeply for its stack, say, which is named with why. A Source File that is parsed and cannot be measured inside — should its measuring fail — is named on standard error as well: it keeps its Dependencies, and its functions and classes count towards no Rule on a metric of the code inside it. An Exception that names a function by the suffix `#2`, `#3`, … that tells functions of one name apart is noted there too: the suffix is positional, and moves to another function when one of that name is added or removed before it ([conformance-format.md](conformance-format.md), section 3).
- **The Rules** are evaluated only against a declaration that can be read. On a Draft — no `.arch/components.yml`, or one that cannot be read — the file of Rules has the Problem `rules-without-declaration`, and no Rule is checked ([conformance-format.md, section 5](conformance-format.md#5-problems-part-3)).
- **The settings** in `.arch/config.yml` ([configuration.md](configuration.md#2-when-it-cannot-be-read)): a file that is not YAML, or whose top level is not a map, is one Problem, `unreadable-config`, said once for every module. While it is, no Diagram is looked for.
- **The Diagrams** are the files in the directory the key `diagrams` names, `docs/architecture/diagrams` by default ([diagrams-format.md, section 1](diagrams-format.md#1-where-diagrams-are-part-6)). Each has the Problems of its file and, against a declaration that can be read, those against the declaration ([section 5](diagrams-format.md#5-problems-part-6)). Its picture, the SVG beside it, is drawn as the export draws it and compared with the file there, byte for byte: where they differ, the Diagram has the Problem `stale-picture` — export it again. A Diagram that is not exported has no picture to be stale.
- **Drift** ([section 4](diagrams-format.md#4-suggested-connections-and-drift-part-6)) is found only where the declaration can be read and a Diagram shows a Component; the code is read for it as for the Rules. Each Drift is a note: a connection the code does not have at the line of its connection, a Dependency the Diagram leaves out at the line of the element that uses. On a Draft, the Diagrams are not compared with the code.

Nothing is written. `adr lint` stays as it was: it reads no Rules, and what it prints and how it ends do not change.

### What it prints

First what `adr lint` prints, without its count; then the Problem of `.arch/config.yml`, if it has one; then the Problems of `.arch/components.yml`, named by the file (`path: code: message`) — and by the line the YAML parser stopped at, for a file that is not YAML; then the Problems of `.arch/rules.yml` at their line; then each Violation that no Exception accepts, once for each line of each import behind it; then the Problems of the Diagrams — of the key `diagrams` first, then of each Diagram in the order of its file name — and last their Drift:

```
src/billing/invoice.ts:3: billing-not-web: billing must not depend on web: src/billing/invoice.ts:3 imports src/web/format.ts. Billing is the domain; the web is how it is shown, and may change without it.
```

- **The file and the line** are those of the import — where the person who wrote it reads the message. A Violation of a Rule about Libraries stands at each import of the Library by its Component's files: `packages/core/src/window.ts:1: only-the-window-uses-electron: core uses electron, which only app may use: packages/core/src/window.ts:1 imports electron. …`. A Violation with no import behind it, a `threshold`, is printed at the line of its Rule in `.arch/rules.yml` — a threshold on the complexity of a function or the LCOM4 of a class at the line of its name, where it is changed:

```
cart/src/main/java/com/shop/cart/Cart.java:19: functions-stay-simple: The metric complexity of the function Cart.discount(long) at cart/src/main/java/com/shop/cart/Cart.java:19 is 5, above the maximum of 4. A function with more ways through it than that cannot be tested path by path.
```
- **The code** is the ID of the Rule, which the architect chose and which stays as long as the Rule does. A Problem has its code, as in `adr lint`.
- **The message** is the sentence of the Violation ([conformance-format.md, section 3](conformance-format.md#3-violations-and-their-fingerprint-part-3)), the import that causes it, and the reason the Rule gives, in the architect's words.

```
docs/architecture/diagrams/packages.yml:1: stale-picture: docs/architecture/diagrams/packages.svg is not the picture of the Diagram as it is now: the Diagram or its Components changed after it was exported. Export it again.
docs/architecture/diagrams/packages.yml:22: dependency-not-in-diagram: cli depends on diagrams in the code, through 2 Source File Dependencies, and the Diagram does not connect them.
```

A Violation that an Exception accepts is not printed; it is counted. A note about `.arch/rules.yml` — an Exception of a Cycle that can be narrowed — is printed among the Problems of the file, at its line, and fails nothing; so is the Drift of a Diagram, at its line in the Diagram's file. After an empty line, the last lines count: one for the Decision Logs, as `adr lint` counts them, or `No Decision Log.`; `1 Problem in .arch/config.yml.` when the settings cannot be read; one for the declaration when it has Problems, `1 Problem in .arch/components.yml.`; one for the Rules; and one for the Diagrams, where there are any:

| Last line | When |
| --------- | ---- |
| `5 Rules hold.` | No Violation |
| `2 Violations of 5 Rules.` | Violations, none accepted |
| `1 Violation of 5 Rules, and 1 accepted as an Exception.` | Some accepted, some not |
| `5 Rules hold, but for 2 Violations accepted as Exceptions.` | Every Violation accepted |
| `5 Rules, not checked` | On a Draft: no Rule is checked |
| `No Rules in .arch/rules.yml.` | The file is there, and has no Rule that can be read |
| `No Rules: .arch/rules.yml is not there.` | No file of Rules |

Problems of the file of Rules are added to that line: `5 Rules hold; 1 Problem in .arch/rules.yml.` A Rule with a Problem of its own form is not counted among the Rules.

| Last line of the Diagrams | When |
| ------------------------- | ---- |
| `2 Diagrams: no Problem, no Drift.` | The Diagrams agree with the declaration, their pictures and the code |
| `2 Diagrams: 1 Problem, 3 Drifts.` | Some are not; only the Problem fails the check |
| `1 Diagram: no Problem, not compared with the code.` | On a Draft, or where no Diagram shows a Component |
| `No Diagram is looked for: 1 Problem in .arch/config.yml.` | The key `diagrams` cannot be used |
| — | There is no Diagram, and nothing is wrong with where they are |

`--format json` prints one JSON document instead, and nothing else. It holds every Violation, the accepted ones too, each with its fingerprint ([conformance-format.md, section 3](conformance-format.md#the-fingerprint)) — what an Exception names to accept it:

```json
{
  "logs": ["docs/adr"],
  "problems": [],
  "notes": [],
  "rules": [
    { "id": "billing-not-web", "kind": "must-not-depend", "why": "Billing is the domain; …", "path": ".arch/rules.yml", "line": 3 }
  ],
  "violations": [
    {
      "code": "must-not-depend",
      "rule": "billing-not-web",
      "message": "billing must not depend on web.",
      "why": "Billing is the domain; the web is how it is shown, and may change without it.",
      "fingerprint": { "kind": "dependency", "rule": "billing-not-web", "from": "billing", "to": "web" },
      "fingerprintText": "billing-not-web: billing -> web",
      "path": "src/billing/invoice.ts",
      "line": 3,
      "dependencies": [{ "from": "src/billing/invoice.ts", "to": "src/web/format.ts", "typeOnly": false, "lines": [3] }],
      "exception": { "reason": "…", "justified-by": "docs/adr/0001-invoices-format-dates-like-the-web", "path": ".arch/rules.yml", "line": 15 }
    }
  ]
}
```

- **`notes`** holds the notes of `.arch/rules.yml`, each with `module`, `code`, `message`, `path`, `line` and `note` as Conformance reports it, then the Drift of the Diagrams, each with `module` `diagrams`, `code`, `message`, `path` and `line` as printed, and `drift` as Diagrams reports it; they fail nothing.
- **`problems`** holds the Problems of every module, each with `module`: `decisions` (as `adr lint` writes them), `kernel` (that `.arch/config.yml` cannot be read), `structure` (of `.arch/components.yml`), `conformance` (of `.arch/rules.yml`) or `diagrams` (of the key `diagrams`, of a Diagram, and `stale-picture`), with `code`, `message`, `path`, `line` where there is one, and `problem` as the module reports it.
- **`diagrams`** lists the Diagrams found, each with `id`, `path` and `title` where it has one.
- **`violations`**: `code` is the kind of the Rule, `rule` its ID; `path` and `line` are those of the first import, of the function or class of a threshold, or of the Rule; `value` is the value of a threshold's metric; `dependencies` are the Dependencies between Source Files behind the Violation, with the lines of their imports; `uses`, for a Rule about Libraries alone, the uses of the Library behind it — each with `file`, `library`, `lines`, `typeOnly`, and `typeOnlyLines` where some of its lines are type-only —, whose first import gives `path` and `line`; `exception` is there only when an Exception accepts the Violation, `justified-by` only when it names an ADR.

`--format github` prints one `::error` [workflow command](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands#setting-an-error-message) for each line of the text format, so that a pull request shows each Violation on the line of its import, titled with the ID of the Rule, and each Problem titled with its code — a note as a `::notice`; the Problems of the Decision Logs are written as `adr lint` writes them. The counts come last, as lines of their own. The files are named from the directory the command runs in, as with `adr lint`:

```
::error file=src/billing/invoice.ts,line=3,title=billing-not-web::billing must not depend on web: src/billing/invoice.ts:3 imports src/web/format.ts. Billing is the domain; the web is how it is shown, and may change without it.
```

### How it ends

| Exit code | When |
| --------- | ---- |
| 0 | There is no Problem, and every Violation has an Exception |
| 1 | There is at least one Problem — in a Decision Log, in `.arch/config.yml`, in `.arch/components.yml`, in `.arch/rules.yml` (an Exception that matches nothing or names an ADR that is not there among them) or of a Diagram (a picture that is not current among them) — or a Violation without an Exception |
| 2 | Nothing could be checked: `path` is no directory; no Decision Log is found there, neither `.arch/components.yml` nor `.arch/rules.yml` is there, no Diagram is, and `.arch/config.yml` can be read; the command line is not understood; or reading failed in a way the command did not expect. What went wrong is printed to standard error |

### The codes

The Problems of the Decision Logs have the codes of `adr lint`, above. The others:

| Code | The Problem |
| ---- | ----------- |
| `unreadable-declaration`, `invalid-segment`, `duplicate-component`, `dead-pattern`, `pattern-outside-repository`, `overlapping-components`, `empty-component` | The Problems of `.arch/components.yml` ([structure-format.md, section 6](structure-format.md#6-problems-part-2)), as Structure names them (`packages/structure/src/problems.ts`) |
| `unreadable-rules`, `rules-without-declaration`, `unknown-rule-kind`, `invalid-rule`, `duplicate-rule`, `unknown-component`, `no-component-matches`, `invalid-exception`, `exception-unknown-rule`, `unmatched-exception`, `duplicate-exception`, `unknown-justification`, `invalid-justification`, `invalid-applied-pattern` | The Problems of `.arch/rules.yml` ([conformance-format.md, section 5](conformance-format.md#5-problems-part-3)) |
| `exception-can-shrink` | A note of `.arch/rules.yml`, which fails nothing (the same section) |
| `unreadable-config` | `.arch/config.yml` cannot be read ([configuration.md, section 2](configuration.md#2-when-it-cannot-be-read)) |
| `invalid-diagrams-directory`, `unreadable-diagram`, `no-level`, `unknown-level`, `no-scope`, `scope-without-component-level`, `invalid-element-id`, `duplicate-element`, `self-connection`, `unknown-element`, `duplicate-connection`, `component-gone`, `unknown-scope`, `component-does-not-fit`, `repository-does-not-fit`, `stale-picture` | The Problems of the Diagrams ([diagrams-format.md, section 5](diagrams-format.md#5-problems-part-6)), as Diagrams names them (`packages/diagrams/src/problems.ts`) |
| `connection-not-in-code`, `connection-perhaps-not-in-code`, `dependency-not-in-diagram`, `scope-dependency-not-in-diagram` | Drift of a Diagram, a note, which fails nothing ([diagrams-format.md, section 4](diagrams-format.md#4-suggested-connections-and-drift-part-6)) |

A Violation is named by the ID of its Rule, and in JSON its `code` is the kind of the Rule: `must-not-depend`, `may-only-depend`, `layers`, `no-cycles`, `threshold`, `library`. The same rule for new codes holds as for `adr lint`.

## `adr export [path] --out <directory> [--log <directory>]...`

Writes the Decision Logs of the repository at `path` — the current directory when it is left out — as HTML pages that open from disk, into `--out`. `--log` names a Decision Log by its directory, as `adr lint` finds it (`docs/adr`, or `.` for the root); it may be given more than once, and every Decision Log is exported when it is not given. The repository is found and read as `adr lint` reads it; nothing of it is changed.

```sh
node packages/cli/dist/adr.mjs export --out ../decisions-site
node packages/cli/dist/adr.mjs export services/billing --out site --log docs/adr
```

### What it writes

| File | What it is |
| ---- | ---------- |
| `index.html` | Every exported ADR, by Decision Log and by Status — accepted, proposed, superseded, deprecated, rejected, and an unknown Status last — with its number, title and the date it was decided or created |
| `<log>/<ADR>.html` | One page per ADR, at the path of its file with `.html` for `.md`: its Status, Metadata, Relations and Back-references as links, its Corrections, and its text. A link to the ADR before and after it in its Decision Log |
| `print.html` | Every ADR on one page, each starting a printed page; its links lead within the page. It prints to PDF in any browser |
| `style.css` | The style sheet of every page, light and dark as the system is, and for print |
| the images | Each image an ADR shows that is a file of the repository, copied byte for byte to the same path: a file with the extension of an image (`.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`, `.avif`, `.apng`, `.bmp`, `.ico`), none of whose directories or name begins with `.` |
| `softarch-export.json` | The marker: which tool wrote the export, when, of which Decision Logs, and the files it wrote |

The pages run no script and fetch nothing: the text of an ADR is rendered as in the app, without HTML that could run, and each page allows only its own style sheet and images. A link in an ADR to another exported ADR leads to its page, a heading included; a web link stays a web link; a link to any other file of the repository becomes its text, with the path as its title. An image from the web becomes a link to it, and a file of the repository that is no image, or a hidden one, its alt text. An image that is no file of the repository — missing, outside it, or reached through a symbolic link that leads out — a symbolic link with the name of an image that leads to a hidden file or to one that is no image, and an image larger than 20 MiB are left out, and standard error says so.

`--out` is written into only when it is not there yet, is empty, or holds an earlier export, known by its marker. An export over an earlier one writes every file again and removes the files the earlier export wrote and this one does not — the page of an ADR that is gone; a file that someone put there stays. Any other directory is refused, and nothing is written.

Nothing is written or removed through a symbolic link that stands in `--out`, and nothing over a directory where the export puts a file: such a thing may come from a checkout or a share, and must not lead the export elsewhere. The export stops there and says so. A file is written as a new file, so that a hard link to it elsewhere keeps what it had. The marker is written first, naming what the export will write beside what the earlier one wrote; then the files of the earlier export that this one no longer has are removed — before anything is written, so that where a file system does not tell `A.html` from `a.html` the new file is not the one removed — and then the pages and the images are written, and the marker again with what was written. An export that stopped halfway is one the next export writes over.

The last line says what was written: `Exported 13 ADRs of 1 Decision Log to /home/me/site. Open /home/me/site/index.html.`

A PDF comes from the app (**Export → PDF…**), which prints `print.html` with its own browser engine; the command line brings none along.

### How it ends

| Exit code | When |
| --------- | ---- |
| 0 | The export was written |
| 2 | The export was not written: `path` is no directory, no Decision Log was found there, `--log` names none of them, `--out` is missing or holds something other than an export, or the command line is not understood — then nothing was written; or a symbolic link or something else in `--out` stood in the way, or writing failed — then what was written so far stays, and the next export writes over it. What went wrong is printed to standard error |

## In CI

```yaml
- run: pnpm install --frozen-lockfile
- run: pnpm build
- run: node packages/cli/dist/adr.mjs check --format github
```

`adr check` checks the Decision Logs as `adr lint` does, so one step is enough. A step of `adr lint` before it would end the job on a Problem of a Decision Log before the Violations are shown; `adr lint` alone suits a repository without Rules, or a pipeline that wants no analysis of the code.

This repository runs `adr check` on itself in its own CI (`.github/workflows/ci.yml`), so a broken Relation in `docs/adr`, or an import that breaks a Rule of `.arch/rules.yml`, fails the build.
