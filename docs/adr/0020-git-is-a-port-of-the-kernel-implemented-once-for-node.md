---
status: accepted
created: 2026-11-02
decided: 2026-11-02
decision-makers: [Philipp Saal]
tags: [git, architecture, security]
depends-on: [0006-one-core-package-per-module-on-a-shared-kernel]
relates-to: [0007-the-analysis-never-executes-anything-from-the-analysed, 0012-committing-an-adr-runs-git-commit-for-its-files-only]
affects: [kernel/git, cli, app/main]
---

# git is a port of the kernel, implemented once for Node

Until now only the app's main process ran git, for Decisions: the working tree, the history of an ADR, the branches, the commit ([ADR-0012](0012-committing-an-adr-runs-git-commit-for-its-files-only.md)). Review needs history in its core — the commit an Anchor was read in, what was renamed since —, and the history analysis of Structure will read `git log` for churn and temporal coupling ([plan-vision.md](../plan-vision.md), parts 8 and 14). A core runs no program and touches no disk ([ADR-0006](0006-one-core-package-per-module-on-a-shared-kernel.md)), and the hardening of the app's git — git found by its full path on Windows, nothing run that the repository's configuration names — must not be written twice.

So the kernel defines git as a port, as it defines the file system (`packages/kernel/src/git/port.ts`): HEAD's commit, whether a commit exists, a file's text at a commit, the changes between two commits with their renames, and the log of HEAD with the files each commit changed, one file followed through its renames. It is read-only, and it says "nothing" where git cannot answer. `memoryGit` scripts a history of commits and their trees for the tests, a rebase included. The node implementation is one module, `packages/cli/src/git.ts`, which the command line uses and the app imports as `@adr-tool/cli/git`, as it imports the export ([ADR-0014](0014-the-export-is-static-html-from-core-printed-to-pdf-by.md)). What the app reads of git besides the port is in the same module, on the same runner and the same parser of the log; the commit stays the app's own, on the options a commit can run with (below).

## Considered Options

- **A package of its own for git.** The cleanest name, and one more package to set up, type-check and bundle for one file, while the app already depends on the command line for the export.
- **Keep it in the app, and give the command line its own.** Each stays where it is used, and every hardening has to be made twice: the next fix to one misses the other.
- **The Node implementation in the kernel, under an entry of its own.** One place for the port and its implementation, but the kernel's type check refuses Node on purpose, so that no core can reach the disk; an exception for one entry is a hole in that guard.
- **Read `.git` without git** (isomorphic-git, or packs read by hand). Nothing would run at all. But git's behaviour is the reference ([plan.md](../plan.md), decision 2): packs, alternates, worktrees, and rename detection would be written again, and would disagree with what `git log` shows the person.

## Consequences

- A core that reads history takes a `Git` beside its `FileSystem`; whoever calls it plugs in git for the opened directory. Its tests script a history in memory, and the node implementation is tested against a repository the test makes.
- Every read of git goes through the same options (`READ_OPTIONS`, `READ_ENVIRONMENT`): no pager, no optional locks, literal pathspecs and `--` before every path, no fsmonitor, and no transport — no lazy fetch of what a partial clone lacks (`GIT_NO_LAZY_FETCH`), and `protocol.allow=never` for gits too old to know that, which would run the `core.sshCommand` of the repository's configuration. A diff and a log read without colours, external diff, textconv or signature checks, and as they are whatever the configuration says about showing them: paths from the top of the repository, the files of the first commit, text in UTF-8, each field a token of its own. `git status` reads files of the working tree, so it runs with every filter driver of the configuration emptied — and not at all where a driver's name cannot be passed to git — and leaves submodules alone. Only full object names go back into a command line, and a path that leaves the opened directory is nothing.
- Committing runs on the first options only — no pager, literal pathspecs, no fsmonitor —, and what it reads beforehand, which files git knows and where HEAD is, runs as every read does. The commit itself runs what the repository configures for a commit, as `git commit` in a terminal does: its hooks, its signing, its filters, which make the content that is committed, and the fetch of what a partial clone lacks for it ([ADR-0012](0012-committing-an-adr-runs-git-commit-for-its-files-only.md)).
- The port does not write. Committing stays the app's, the one operation that runs what the repository configures.
- The log leaves merges out, and finds renames as `-M` does. What the history analysis needs beyond it — lines added and removed, say — is added to the port and to both implementations together.
- The MCP server reads history through the same module when it needs to; it runs no git of its own.
