---
status: proposed
created: 2026-09-20
decision-makers: [Philipp Saal]
tags: [architecture, packages]
depends-on: [0001-electron-svelte-typescript-throughout, 0004-operations-return-change-sets]
---

# One core package per module, on a shared kernel

The ADR tool grows into a suite whose modules — Decisions, Structure, Conformance and those after them — each have a glossary of their own ([CONTEXT-MAP.md](../../CONTEXT-MAP.md)). Every module gets one UI-free core package that speaks its glossary and no other: `core` for Decisions, `structure` next. What all of them need and none of them owns lives in `packages/kernel`: the file-system port, the in-memory file system and change sets. Module cores depend on the kernel and never on each other. Where two modules meet — an ADR that names the Components it affects — their caller joins them: the app's main process, later the CLI.

## Considered Options

- **One `core` that grows.** No package boundary to keep up. But one package would then speak several glossaries — Relation beside Dependency, Problem beside Violation — and nothing but discipline would keep them apart. `adr lint` would also pull in the TypeScript compiler and tree-sitter, which only Structure needs.
- **`structure` depends on `core` for the port and change sets.** The fastest start. It creates a dependency of Structure on Decisions that means nothing in the domain, that the suite would flag on its own repository, and that every later module would copy.
- **A repository or a published package per module.** The cleanest separation, at the price of versioning between packages that one person changes together. A Trace touches two modules in one commit.

## Consequences

- The kernel must stay free of every module's vocabulary. `Plan` became generic for that reason: the kernel knows a change set and its warnings, and `core` adds the created ADR and the renamed ID.
- The kernel starts minimal and grows only when a second module needs something. The git wrapper, Traces and Problems are its likely next contents ([plan-structure.md](../plan-structure.md)).
- An operation that spans modules — renaming a Component rewrites `affects` in ADRs — is put together by the caller from two plans. Until a second kind of Trace exists, that glue lives in the app.
- `core` hands on what its callers use of the kernel, so the app did not change with the split. Callers of a new module import the kernel themselves.
- The guard that keeps `core` UI-free — no DOM library and no ambient types in its type check — applies to the kernel and to every module core alike.
