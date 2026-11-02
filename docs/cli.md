# The command line — `adr`

The contract of the suite's command line (`packages/cli`): what it reads, what it prints, and how it ends. It is written for CI first — a pipeline that should fail when a Decision Log breaks — and for anyone who wants the app's checks without the window. It is built on `core` and says what the app says ([plan-roadmap.md](plan-roadmap.md), part 4).

The command reads and never writes. Repairs stay in the app, where each one is previewed.

## Running it

The command is one file with nothing to install beside it: `pnpm build` writes it to `packages/cli/dist/adr.mjs`, and Node.js 22.12 or later runs it, wherever it is copied to — the `.mjs` makes it a module whatever `package.json` stands beside it.

```sh
node packages/cli/dist/adr.mjs lint            # the repository in the current directory
node packages/cli/dist/adr.mjs lint ../shop    # another one
pnpm adr lint                                 # the same, from this repository
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

A new kind of Problem gets a new code. A code is never given a different meaning, and is renamed only with a note in this document.

## In CI

```yaml
- run: pnpm install --frozen-lockfile
- run: pnpm build
- run: node packages/cli/dist/adr.mjs lint --format github
```

This repository runs the command on itself in its own CI (`.github/workflows/ci.yml`), so a broken Relation in `docs/adr` fails the build.
