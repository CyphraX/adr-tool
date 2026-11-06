# The MCP server — `adr-mcp`

The contract of the suite's server for agents (`packages/mcp`): how it is started, what its tools take and answer, and how it writes. It gives an agent the Decision Logs of one repository the way the app sees them — built on `core`, with the same rules for numbers, Metadata, Relations and Back-references — so that the agent does not edit ADR files by hand ([vision.md](vision.md), principle 5; [plan-roadmap.md](plan-roadmap.md), part 9; [ADR-0013](adr/0013-agents-write-adrs-through-the-mcp-server-as-previewed-change.md)). It gives it the repository's Annotations as well, the remarks of Review on lines of code ([Review](#review); [plan-vision.md](plan-vision.md), part 9).

**It writes in two steps.** A `plan_*` tool returns the change — each file as a unified diff, and warnings — and writes nothing. `apply_change` writes it, after the person has seen it; `discard_change` drops it. Only `apply_change` is marked as writing — and as destructive, since it overwrites and renames files — so a client that asks before a tool writes asks before that one alone.

## Running it

The server is one file: `pnpm build` writes it to `packages/mcp/dist/adr-mcp.mjs`, and Node.js 22.12 or later runs it. It speaks the [Model Context Protocol](https://modelcontextprotocol.io) on standard input and output, one JSON-RPC message per line, for the repository it is started for — the current directory when the path is left out. What it has to say beyond the protocol goes to standard error.

```sh
node packages/mcp/dist/adr-mcp.mjs ../shop     # serve the repository ../shop
```

An MCP client starts it as a process. With Claude Code, for the repository it runs in:

```sh
claude mcp add softarch -- node /path/to/adr-tool/packages/mcp/dist/adr-mcp.mjs .
```

In a client configured by JSON (Claude Desktop, Cursor and others):

```json
{
  "mcpServers": {
    "softarch": {
      "command": "node",
      "args": ["/path/to/adr-tool/packages/mcp/dist/adr-mcp.mjs", "/path/to/repository"]
    }
  }
}
```

It is not published to npm yet; that comes with distribution (roadmap, "Before the first public release").

## The protocol

The server answers `initialize`, `ping`, `tools/list` and `tools/call`; notifications are taken and need no answer. Tool calls run one after another, in the order they came — those of a batch too — so that a write planned after a read sees it and two writes never interleave; `initialize`, `ping` and `tools/list` are answered at once, also while a tool runs. A request the client cancels (`notifications/cancelled`) before it has started is not run, and not answered. It speaks the protocol versions `2025-11-25`, `2025-06-18`, `2025-03-26` and `2024-11-05`: it answers a client with the version the client asks for when it is one of these, and with the newest otherwise. Its only capability is `tools`; resources, prompts and sampling are not offered.

A tool answers with its result as JSON, twice: as `structuredContent`, and as the text of its one `content` item for clients that read only that. A tool that does not do what it was asked — an ADR that does not exist, a decision its Status does not allow, arguments that do not fit — answers with `isError: true` and one sentence in its text that says why; the agent can try again. So does a tool that fails on the way, a file that cannot be written: `The tool failed: …`. A protocol error is only for what is not a tool call at all: a line that is not JSON (`-32700`), a message that is no request (`-32600`) — an `id` that is neither a string nor a number, an empty batch, a line longer than 32 MiB —, a method the server does not know (`-32601`), a tool call without a tool it has (`-32602`). A response the client sends is not answered.

Arguments are checked against the tool's input schema before it runs: a missing or unexpected argument, or a value of the wrong type, is answered as a tool error naming it (`arguments.status must be one of proposed, accepted, …`). An argument given as `null` is one left out.

## Naming an ADR and a Decision Log

An ADR is named by its ID, `id`: its file name without `.md`, `0007-use-kafka`. A tool that works on one Decision Log takes its directory as `log`, `docs/adr`; a log at the top of the repository is `.`, and is named so in what the tools answer. `log` can be left out when the repository has one Decision Log, or when the ID is found in one log only; `<log>/<ID>` as the ID names an ADR of any log ([file-format.md, section 3](file-format.md#3-metadata)). When the repository has no Decision Log yet, `plan_create_adr` starts one, as the app does: in the directory `.adr/config.yml` or `.adr-dir` names, or else in `docs/adr` ([file-format.md, section 6](file-format.md#6-finding-decision-logs)); while that configuration cannot be used, it says what to repair instead.

Every call reads the repository afresh: what a person or git changed in between is what the next call sees.

## Reading

| Tool | Takes | Answers |
| --- | --- | --- |
| `list_decision_logs` | — | `root`; how the logs were found (`discoveredBy`); each log with `path`, `naming`, the number of its ADRs and of its Problems; the Problems of the repository as a whole — configuration that cannot be used, a configured directory that is missing. |
| `list_adrs` | `log`?, `status`? | `adrs`: oldest first, each with `log`, `id`, `path`, `number` (in a log numbered in sequence), `title`, `status` (as written when it is none of the five values, `unknown` without one), `created`, `decided`, `tags`. Without `log`, every log. |
| `read_adr` | `id`, `log`? | The ADR as in `list_adrs`, with `decisionMakers`, `relations`, `backReferences`, `affects`, `corrections`; `foreign` with the format of a file the tool reads and does not write, and `noMigration` when such a file cannot be migrated yet; `relationsInLog`, every Relation it carries or is the target of, with its state (`in-effect`, `pending`, `void`); `problems`, those it is part of, as in `list_problems`; and `body`, the Markdown after the frontmatter, exactly as it is in the file, with its `revision`, which `plan_edit_body` takes. |
| `search_adrs` | `query` | `adrs`: those whose ID, title, tags or text contain every word of the query — case, accents and `ß`/`ss` aside — the best 20 first, each as in `list_adrs` with the `line` of its text that matched. |
| `list_problems` | `log`? | `problems`: each root cause with its `log`, `code` (those of [cli.md](cli.md#the-codes)), `adr`, `message`; the Problems that only follow from it as `consequences`, with the `lead` that says so; and `repairs`, the Repairs the tool offers for it, each a value to hand to `plan_repair`. `repository`: the Problems of the repository as a whole. |
| `list_templates` | — | `templates`: the repository's own under `.adr/templates`, then the built-in ones, each with `name` and `source`; `default`, the one a new ADR is made from when none is named. |
| `list_components` | — | `components`: the Components `.arch/components.yml` declares, with `id`, `name` and `description` — what an ADR can name in `affects` ([structure-format.md](structure-format.md)). |

### Measuring the code (part 13)

| Tool | Takes | Answers |
| --- | --- | --- |
| `component_metrics` | `component`?, `tests`? | Structure's metrics ([structure-format.md, section 5](structure-format.md#5-metrics-parts-5-and-13)) of the Component, or of the whole repository when `component` is left out, as data: `metrics`, the Component's size, coupling, instability, abstractness and distance from the main sequence; `level`, the level below it — `below` is its ID, or `null` for the top level —, with its `propagationCost` and each node's `kind`, `id`, number of `files`, and the `abstractness`, `instability` and `distance` of each Component or directory; `functions`, its 20 most complex, each with `file`, `name`, `line`, `endLine` and `complexity`, and how many there are as `functionCount`; `splitClasses`, only the classes whose methods fall into more than one group by LCOM4, the 10 with the most groups, each with `methods` and `lcom4`, `splitClassCount` how many such classes there are, and `classCount` how many classes were measured at all. A metric that is undefined — nothing to divide by, nothing declared — is `null`. `origin` says whether the Components are declared or the Draft. `notes` says, for each of Java, Python and Go that is there, what its reader does not see, and that only the metrics built on Dependencies are touched by it: coupling, fan-in, fan-out and propagation cost are lower bounds, instability and distance can be off either way, complexity, LCOM4 and abstractness are not affected; and names the Source Files that could not be measured inside. Test files count when `tests` is `true`. |

`component_metrics` analyses the code each time it is called, as `adr check` does — the files git lists, the Components, every import, TypeScript, JavaScript, Svelte, Java, Python and Go — and it takes a moment on a large repository. It reads; it runs nothing of the repository and writes nothing.

## Planning a change

Each of these reads the repository, plans the operation with `core` exactly as the app plans it, and answers with the planned change. Nothing is written.

| Tool | Takes | Plans |
| --- | --- | --- |
| `plan_create_adr` | `title`, `log`?, `template`?, `supersedes`? or `amends`? | A new ADR, `proposed`, with the next number of the log (or today's date in a log named by date), its Metadata, and the body of the Template. `supersedes` or `amends` names the ADR the new one is to supersede or amend; nothing is written there until the new one is accepted. |
| `plan_decision` | `id`, `decision`, `log`? | `accept` or `reject` a proposed ADR, or `deprecate` an accepted one. Accepting writes the `decided` date, the Back-references into the ADRs it supersedes or amends, and the `superseded` Status of those it supersedes. |
| `plan_edit_body` | `id`, `body`, `revision`, `log`?, `note`?, `author`? | The body replaced by `body`, the whole new Markdown after the frontmatter; only the lines that differ are written. `revision` is the one `read_adr` returned with the body the edit starts from: when the body changed since — a person edited it — the edit is refused, and the agent reads it again instead of writing over what the person wrote. Once the ADR is no longer `proposed`, the edit is a Correction, recorded with today's date, `author` — git's `user.name` when it is left out — and `note`. |
| `plan_edit_metadata` | `id`, `log`?, `decisionMakers`?, `tags`?, `relations`?, `affects`? | The lists a person maintains, each given as it should be; a list left out stays as it is. `relations` holds `supersedes`, `amends`, `depends-on` and `relates-to`; the first two change only while the ADR is `proposed`. What is added to `affects` must be a declared Component. |
| `plan_repair` | `repair`, `log`? | One of the Repairs `list_problems` offers, passed as it was listed. |
| `plan_migration` | `log`?, `id`? | A foreign ADR — MADR, log4brains, adr-tools — converted to the tool's own format; every foreign ADR of the log when `id` is left out ([file-format.md, section 8](file-format.md#8-foreign-formats)). |

A planned change answers:

```json
{
  "changeId": "5f0c7b0e-…",
  "files": [
    {
      "path": "docs/adr/0013-use-kafka.md",
      "creates": true,
      "diff": "--- /dev/null\n+++ b/docs/adr/0013-use-kafka.md\n@@ -0,0 +1,8 @@\n+---\n+status: proposed\n…"
    }
  ],
  "warnings": [],
  "created": { "log": "docs/adr", "id": "0013-use-kafka", "path": "docs/adr/0013-use-kafka.md" },
  "next": "Nothing is written yet. …"
}
```

- `files`: every file the change writes, with `renameTo` where it moves the file (a Renumber), `creates` where it is new, and `diff`, the change as a unified diff with three lines of context; a rename starts it with `rename from` and `rename to`, as git writes it.
- `warnings`: what the person should know before it is applied — a Relation that takes effect only when another ADR is accepted, an ADR that was waiting for this number, a Correction of an accepted ADR. They are the warnings the app's preview shows.
- `created`: the new ADR, for a change that creates one; `renamed`, `from` and `to`, for one that changes an ID.

A plan the operation does not allow — accepting an ADR that is not `proposed`, superseding one that is — is refused as a tool error with `core`'s reason, and nothing is held.

## Review

An **Annotation** is a remark of a person on lines of a Source File — a note, a question or a concern —, kept beside the code and never in it ([review-format.md](review-format.md)). Its **Anchor** names the lines, quotes them, and records the commit they were read at; whenever these tools read the Annotations they find each Anchor again in the code as it is on disk, as the app does ([review-format.md, section 4](review-format.md#4-finding-the-anchor-again)), and say what became of it: `unchanged`, `moved` — found at other lines, with other text or in a renamed file — or `orphaned`. An Annotation is named by its ID, its file name without `.md`, `20261102-why-is-the-total-computed`; an ADR it cites, a **Trace**, as its `cites` names it: the ADR's ID where only one Decision Log has it, `<log>/<ID>` otherwise.

| Tool | Takes | Answers |
| --- | --- | --- |
| `list_annotations` | `state`?, `type`?, `anchor`?, `author`?, `path`?, `component`?, `adr`? | `directory`, where the Annotations are; `annotations`, newest first, each with `id`, `path`, `type`, `state`, `author`, `date`, `firstLine` of its text, `anchor` — `state`, `path`, `lines` and `commit` as the Anchor has them, `now` with `path`, `lines`, `similarity` and `renamedFrom` for a moved one, `file` (`there` or `gone`) for an orphaned one, with `renamedTo` when its Source File was renamed —, the number of its `replies` and its `cites`; `problems`, those of Review with their `code`, `path`, `annotation` and `message` ([review-format.md, section 6](review-format.md#6-problems)). Every filter that is given must hold: `anchor` is `unchanged`, `moved` or `orphaned`; `path` a Source File or a directory; `component` a Component of `list_components`, with the Components inside it, the owner taken where the lines are now; `adr` an ADR as `cites` names it. |
| `read_annotation` | `id` | The Annotation as in `list_annotations`, with its `quote`, the quoted lines; its `text`, the Markdown after them; its `replies` in the order they were written, each with `path`, `author`, `date` and `text`; `cited`, each item of `cites` with the ADR it names (`<log>/<ID>`) or `null`; `writable`, whether its file can be written into; and its `problems`. |

Each of these plans a write of Review as the app plans it, and answers with the planned change as above; `apply_change` writes it. The tool reads the lines from the disk and quotes them: an agent names the file and the lines, never the quoted lines. `author` is the name the Annotation or the Reply is written under — git's `user.name` when it is left out, and the call is refused when git names nobody.

| Tool | Takes | Plans |
| --- | --- | --- |
| `plan_annotation` | `path`, `start`, `end`?, `type`, `text`, `author`?, `cites`? | A new Annotation, `open`, on the lines `start` to `end` (the one line `start` when it is left out) of the Source File `path`: `type` is `note`, `question` or `concern`, `text` Markdown, `cites` the ADRs it traces to. Its Anchor records HEAD's commit; its ID is today's date and the first words of the text, and the answer names it as `annotation.id`. |
| `plan_reply` | `id`, `text`, `author`? | A Reply under the Annotation, a file of its own named by the moment and the author, so that two Replies on two branches meet without a conflict. |
| `plan_annotation_state` | `id`, `state` | `resolved` to Resolve the Annotation, `open` to Reopen it. Nothing is deleted. |
| `plan_update_anchor` | `id` | For a moved Annotation, the lines it is found at now, quoted as they are, and HEAD's commit, written into its Anchor. Refused for one that is unchanged or orphaned. |
| `plan_attach` | `id`, `path`, `start`, `end`? | Attach again: a new Anchor on the lines a person chose — what is done for an orphaned Annotation, which has no Repair. |
| `plan_cite`, `plan_uncite` | `id`, `adr` | The ADR added to the Annotation's `cites`, or taken out where it stands; `plan_uncite` is also the Repair of a Trace to an ADR that is not there (`unknown-adr`). Which Annotations cite an ADR is computed, never written into the ADR. |

While `.arch/config.yml` cannot be read, no Annotation is read or written, and every one of these tools is refused with the file to fix. While its key `annotations` names no directory inside the repository, `list_annotations` answers no Annotation and that Problem, and every plan is refused.

## Applying it

| Tool | Takes | Does |
| --- | --- | --- |
| `apply_change` | `changeId` | Writes the planned change: `applied`, the `files` written, and `created` or `renamed` as planned. Nothing is written — and the tool says which file — when a file it touches changed on disk since it was planned: plan it again then. The change is written all of it or nothing ([ADR-0015](adr/0015-a-change-set-is-written-beside-its-files-and-renamed-into.md)): when the disk refuses a step, the tool says why, every file is as it was, and the change stays held, so that `apply_change` can try again. |
| `discard_change` | `changeId` | Drops a planned change: `discarded`, `false` when there was none. |

A planned change is applied once. The server holds the 50 most recent ones while it runs; a change that was applied, discarded or forgotten — or planned before the server was restarted — is answered with a tool error that says to plan it again.

The server writes nothing but planned changes, and only below the directory it was started for: a path that would lead out of it — with `..`, absolute, or through a symbolic link — is no file of the repository, and a symbolic link to nothing is not written through; the same rules the app's main process keeps. It runs no program but git, and only to read: `git config user.name` for the author of a Correction, an Annotation or a Reply, and for Review's tools HEAD's commit and what became of a Source File since an Anchor's commit, to find the Anchor again ([review-format.md, section 4](review-format.md#4-finding-the-anchor-again)) — each through the suite's one module that runs git, as every read of git is run ([ADR-0020](adr/0020-git-is-a-port-of-the-kernel-implemented-once-for-node.md)) — on Windows the `git.exe` of the PATH, never one in the repository; it commits nothing. Standard output carries the protocol alone: what a library would print there goes to standard error.
