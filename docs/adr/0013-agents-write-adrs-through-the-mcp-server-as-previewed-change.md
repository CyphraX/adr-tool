---
status: accepted
created: 2026-11-02
decided: 2026-11-02
decision-makers: [Philipp Saal]
tags: [agents, mcp]
---

# Agents write ADRs through the MCP server, as previewed change sets

Agents — coding assistants, review bots — read and write the ADRs of a repository more and more often, and they do it by editing files: they guess the next number, write the Metadata by hand, and forget the Back-reference that accepting a superseding ADR asks for. The suite knows how to do each of these right, and plans every operation as a change set ([ADR-0004](0004-operations-return-change-sets.md)); the vision promises agents the same access as people ([vision.md](../vision.md), principle 5).

`packages/mcp` is a server of the Model Context Protocol on standard input and output, one process per repository, built on `core` like the app and `adr lint`. It reads — Decision Logs, ADRs, Problems with their Repairs, a search — and it writes in two steps: a `plan_*` tool returns the change set as diffs with its warnings and writes nothing; `apply_change` writes it, unless a file changed on disk in the meantime. The server speaks the protocol itself — JSON-RPC, one message per line, `initialize`, `ping`, `tools/list` and `tools/call` — and its contract is [docs/mcp.md](../mcp.md).

## Considered Options

- **Agents edit the files.** What happens today. Every rule of the format — numbers, Metadata, Back-references, the `superseded` Status — is the agent's to remember, and `adr lint` finds what it forgot afterwards.
- **One tool per operation that writes at once.** Fewer calls. The person approves a tool call with arguments, though, not what it does to which file: an Accept, a Correction or a Renumber writes to files the agent never named.
- **The official TypeScript SDK.** It would carry the protocol's next changes along. It also brings a web server, OAuth and schema libraries that the stdio subset never uses into a file that is otherwise `core`. The four methods are small, and the tests talk to the server through the SDK's own client, so a change of the protocol that breaks it shows there.

## Consequences

- An agent gets the tool's rules for free: the next number, the Metadata, the Back-references, the Problems with their Repairs.
- Nothing an agent does is written unseen. A plan writes nothing, and only `apply_change` is marked as writing, so a client can ask before that one alone.
- The server is one file, `packages/mcp/dist/adr-mcp.mjs`, run with Node.js. It writes only below the directory it was started for, by the same rules as the app's main process, and runs no program but `git config user.name`.
- Resources, prompts and notifications of the protocol are not offered; when agents need them, they come with a change of the contract.
