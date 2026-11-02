---
status: accepted
created: 2026-11-02
decided: 2026-11-02
decision-makers: [Philipp Saal]
tags: [core, architecture]
depends-on: [0004-operations-return-change-sets]
---

# A change set is written beside its files and renamed into place

One operation touches several files: accepting an ADR that supersedes one and amends another rewrites three. [ADR-0004](0004-operations-return-change-sets.md) has every operation return a change set that is applied as a whole, and until now that held against a file that changed since the preview, but not against the disk. The files were written one after another, in place: a full disk, a file another program holds open, or a network share that goes away in the middle left some of them new and some old, and a write that failed could leave a file half-written (roadmap, "Known gaps of v1").

`applyChangeSet` in the kernel (`packages/kernel/src/change/change-set.ts`) checks every file against the preview first, as before, and then writes in two phases, out of four steps of the writable file system: write a file and make it durable, rename, give a file a second name, remove.

1. **Preparation.** Every new text is written beside its file, under a hidden name of its own (`.0001-a.md.k2x9q10.new`), with the permissions of the file it replaces, and flushed to the disk. Every file that a new text replaces gets a second name (`.0001-a.md.k2x9q10.old`): a hard link, which needs no room on the disk, and a copy where the file system has no hard links. Nothing a reader of the repository sees has changed. When a step fails, what was made is removed, and nothing is written.
2. **Commit.** One rename per file puts each new text in place, and a rename replaces a file in one step. The files that a Renumber moves go first: another program holding a file open is the likeliest refusal, and the earlier it comes, the less there is to undo. When a rename fails, the ones before it are renamed back, in reverse order — the second names give back the old files — and what was made is removed.

## Considered Options

- **Writing in place, one file after another**, as before. Simple, and a file keeps everything about it, but a failure in the middle leaves a change set half-written.
- **A journal of the change set**, written first and replayed or rolled back at the next start. It would close the window of a crash too, but every program that opens a repository — the app, `adr lint`, the MCP server — would have to recover before it reads, for a window of a few milliseconds that git can also recover from.
- **git as the transaction**: stage the new texts, then check them out. It needs git, and it writes the index, which holds what the person staged; [ADR-0012](0012-committing-an-adr-runs-git-commit-for-its-files-only.md) keeps the index out of everything but a commit.
- **Copies of the old texts as the backup.** A copy needs room on the disk exactly when the disk is full; a hard link does not.

## Consequences

- A step the disk refuses — the disk is full, a file is held open, a name is too long — leaves every file byte for byte as it was, and nothing beside the files. The app says so in the dialog of the change; the MCP server says so and keeps the change, to be applied again.
- What remains: each rename is one step, but all of them together are not. A crash or a power cut between the first and the last rename leaves some files new and some old, with the `.new` and `.old` files beside them, named after the file they belong to; a person puts it right from those, or from git. When renaming back fails too, the app and the MCP server name each file that is not as it was, and where its text is kept.
- A file that is replaced is a new file. It keeps its permissions, but not an owner other than the one who writes it, nor extended attributes or other hard links to it, and a read-only file is replaced like any other, as git replaces it on a checkout. A file that a symbolic link inside the repository leads to is replaced where it is, and the link stays.
- An apply makes each new text durable before it is renamed, and each rename after it is done: a few milliseconds more for an operation that a person confirms by hand.
- The writable file system has two more steps, `link` and `remove`; the app's main process, the MCP server and the memory file system of the tests implement them. The tests refuse each step of a change set in turn, in memory and on disk, and compare every byte.
