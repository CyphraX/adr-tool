---
status: accepted
created: 2026-11-02
decided: 2026-11-02
decision-makers: [Philipp Saal]
tags: [git, security]
---

# Committing an ADR runs git commit for its files only

Until now the suite only read git: branch, uncommitted files, history ([plan.md](../plan.md), M2, part 3). "Commit this ADR" is the first operation that writes to it. Someone who has just accepted an ADR wants that decision in the history as one commit, without going to a terminal, and without taking along whatever else happens to be changed or staged in the working tree.

The commit is made by the system's git, as `git commit --only -- <files>`: it takes the files as they are in the working tree, leaves everything else that is staged staged and everything else that is changed changed, and moves the branch that is checked out. A file git does not know yet is announced to it first (`git add --intent-to-add`), and taken back out of the index when the commit fails. The files are the ADR's own, the file it had before a Renumber, and — offered, and chosen by default — the files of other ADRs with uncommitted changes that name it or that it names: Accept writes the Back-reference into the superseded ADR, and a commit without it would put a Problem into the history. The person sees every file with its diff and the message before anything happens, and can change the message. Nothing is pushed.

## Considered Options

- **Plumbing (`write-tree`, `commit-tree`, `update-ref`).** Writes exactly what the suite decides and runs no program of the repository. It also skips what the person has configured for commits on purpose — hooks that check the message or the files, signing — and a commit made beside the team's conventions is worse than none. git's behaviour is the reference (plan, decision 2).
- **Stage the files and commit the index.** Would take along whatever else is staged, which is exactly what the person did not ask for.
- **Skip the hooks (`--no-verify`).** The same objection as plumbing, and post-commit hooks would still run.

## Consequences

- git runs the hooks and the signing the repository and the user have configured, as it does on the command line. Opening and reading a repository still runs nothing of it; committing is the one step that does, and the dialog says so.
- A hook that refuses, a missing identity, a merge in progress or a signing that fails ends the commit with git's own words in the dialog; the index is as it was. What failed is told apart by HEAD: when it moved, the commit is made — a post-commit hook failed or took too long — and the dialog says what git said after it, without undoing anything.
- A hook runs with git's rules for a partial commit: a pre-commit hook that stages another file with `git add` gets that file committed too. The suite cannot stop that and does not try; it is the hook's doing, as on the command line.
- The file an ADR had before a Renumber goes with it only while it is gone from the disk and much the same text, or where git already sees the rename. A deleted file that happens to share the slug is someone else's change.
- On a detached HEAD the commit goes on no branch; the dialog says so before anything happens.
- A file that changed between the preview and the click is not committed, nor a Renumber whose old file came back: the dialog asks to look again, as a planned change does.
- The renderer never names a path: it gets the files of the planned commit from the main process and sends back which of the offered ones to take, and the message.
