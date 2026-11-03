# The MCP server — `adr-mcp`

The contract of the suite's server for agents (`packages/mcp`): how it is started, what its tools take and answer, and how it writes. It gives an agent the Decision Logs of one repository the way the app sees them — built on `core`, with the same rules for numbers, Metadata, Relations and Back-references — so that the agent does not edit ADR files by hand ([vision.md](vision.md), principle 5; [plan-roadmap.md](plan-roadmap.md), part 9; [ADR-0013](adr/0013-agents-write-adrs-through-the-mcp-server-as-previewed-change.md)). It gives it the Structure and the Rules of the repository as well: the Dependencies between the Components, and which Rules an import would break before the agent writes it ([plan-vision.md](plan-vision.md), part 4).

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

Every call reads the repository afresh: what a person or git changed in between is what the next call sees. The tools of Structure and Conformance analyse the code as `adr check` does ([cli.md](cli.md#adr-check)) — the files git lists, or a walk that honours `.gitignore`; TypeScript, JavaScript, Svelte and Java; nothing of the repository run — and check the Rules through the same composition, so that the server, the app and the command say the same of the same files. What a Source File says is remembered by its content while the server runs: a second call reads only the files that changed.

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
| `read_structure` | `component`?, `tests`? | One level of the hierarchy as Structure shows it ([structure-format.md, sections 4 and 5](structure-format.md#4-dependencies-between-components-part-3)): the top, or the children of `component` — below a Component without children, its Source Files and directories. `components`, `declared` or `draft`; `nodes`, each with `id`, `kind` and its metrics (`files`, `lines`, `efferentCoupling`, `afferentCoupling`, `instability`, `fanOut`, `fanIn`, `cohesion`, `internalShare`; a node that stands for files alone has its size only); `dependencies`, each with `from`, `to`, `weight` — the pairs of Source Files behind it —, `typeOnly` where every one is, and the first ten `imports` (`file`, `line`, `imports`); `cycles`, each with `members`, a `roundTrip` and, among Components, the `weakest` Dependency on it; `notAnalysed`, the Source Files that cannot be parsed. Test files count only with `tests`. |
| `list_rules` | — | The Rules of `.arch/rules.yml` ([conformance-format.md](conformance-format.md)): `present`; `checked`, whether they were evaluated — not on a Draft, not while the file cannot be read, with a `note` that says why —; `rules`, each with `id`, `why`, `kind`, the keys of its kind as `plan_rule` takes them, `line`, and the number of its `violations` and of those an Exception has `accepted`; `exceptions`, each with `line`, `rule`, the keys of its fingerprint, `reason` and `justifiedBy`; `problems` and `notes` of the file, each with `code`, `line`, `message` and, where the suite knows one, the `repair`: the arguments of `plan_exception` that plan it. |
| `list_violations` | `rule`?, `component`?, or `from`, `to` and `typeOnly`? | The Violations of the code as it is — only those of `rule`, or those about `component` or a Component inside it —, the best 50 first: each with `rule`, `kind`, its `sentence`, the `fingerprint` an Exception names it by, `cycle`, `component` and `value` where it has them, its first ten `imports`, and `acceptedBy` — `line`, `reason`, `justifiedBy` — when an Exception accepts it; `breaks`, those that none does. With `from` and `to`, an import that is not written yet: `from` the file it is planned in, which need not exist, `to` the file it would import or the specifier as it would be written (`../core/src/index`, `@acme/core`), resolved as the analysis resolves it. It answers the `import` with both files, their Components and whether it is there already, and the Violations it would be part of — those of a threshold it would cross included —, so that the agent sees the Rule before it writes the code. A Library or a module of Node.js is no Rule's business, and says so in a `note`. |

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
| `plan_rule` | `action`?, `id`, `newId`?, `why`?, `kind`?, the keys of the kind, `tests`?, `ignoreTypeOnly`? | `add` (when `action` is left out) a Rule to `.arch/rules.yml`, the file started where there is none; `change` the Rule `id` — what the call does not name stays as it was, `newId` renames it in its Exceptions too —; or `remove` it with its Exceptions. The keys are those of [conformance-format.md, section 2](conformance-format.md#2-the-kinds-of-rules-part-3): `from` and `to`; `layers`, a list of lists, and `mode`; `among` or `inside`; `metric`, `max`, `min` and `of` — Component IDs and patterns as lists. A Component the declaration does not have is a warning. |
| `plan_exception` | `action`?, `rule`, `from` and `to`, `cycle` or `component`, `reason`, `justifiedBy`?, `line`?, `members`? | `add` (when `action` is left out) an Exception that accepts a Violation, named by its `fingerprint` as `list_violations` gives it, with the `reason` and the ADR that justifies it, `docs/adr/0007-use-kafka`, which must be one of the repository's; `remove` one, or `narrow` one of a Cycle to `members` — the Repairs `list_rules` offers. `line` names the Exception where the same one is written twice. |

The two write `.arch/rules.yml` as the app does: a new Rule or Exception is appended in block style, a change replaces the values it changes where they stand, and what is taken out goes with its lines; comments, order and spacing stay ([ADR-0002](adr/0002-never-reserialize-markdown.md), [conformance-format.md, section 1](conformance-format.md#1-the-file-part-3)). What the suite cannot write without rewriting more of the file — a list in brackets it would turn into a block, a comment that would be lost — is refused with a sentence that says where.

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

## Applying it

| Tool | Takes | Does |
| --- | --- | --- |
| `apply_change` | `changeId` | Writes the planned change: `applied`, the `files` written, and `created` or `renamed` as planned. Nothing is written — and the tool says which file — when a file it touches changed on disk since it was planned: plan it again then. The change is written all of it or nothing ([ADR-0015](adr/0015-a-change-set-is-written-beside-its-files-and-renamed-into.md)): when the disk refuses a step, the tool says why, every file is as it was, and the change stays held, so that `apply_change` can try again. |
| `discard_change` | `changeId` | Drops a planned change: `discarded`, `false` when there was none. |

A planned change is applied once. The server holds the 50 most recent ones while it runs; a change that was applied, discarded or forgotten — or planned before the server was restarted — is answered with a tool error that says to plan it again.

The server writes nothing but planned changes, and only below the directory it was started for: a path that would lead out of it — with `..`, absolute, or through a symbolic link — is no file of the repository, and a symbolic link to nothing is not written through; the same rules the app's main process keeps. It runs no program but `git config user.name`, read for the author of a Correction through the suite's one module that runs git, as every read of git is run ([ADR-0020](adr/0020-git-is-a-port-of-the-kernel-implemented-once-for-node.md)) — on Windows the `git.exe` of the PATH, never one in the repository; it commits nothing. Standard output carries the protocol alone: what a library would print there goes to standard error.
