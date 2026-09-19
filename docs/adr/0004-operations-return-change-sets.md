---
status: accepted
created: 2026-09-19
decided: 2026-09-19
decision-makers: [Philipp Saal]
tags: [core, architecture]
depends-on: [0002-never-reserialize-markdown]
---

# Operations return change sets and never write

One click can touch several files: accepting an ADR that supersedes another rewrites the new ADR, the old one's Status and its Back-reference. The user must see those lines before they are written, and nothing may be written when git, an editor or an agent changed a file in the meantime. So no operation in `core` writes. Each one returns a change set — for every affected file, the text it was planned against and the text afterwards — and a single function applies it, after comparing every file with what the plan saw. `core` takes a read-only file system everywhere else, so it cannot write by accident.

## Considered Options

- **Operations write directly.** Less code and no intermediate value, but a preview would need a second, parallel implementation of every operation, and a half-applied Accept — the new ADR written, the old one not — becomes possible.
- **The app computes and applies the edits.** Would keep `core` read-only, but the rules of the file format would then live in the app, and the later CLI would have to repeat them.

## Consequences

- The preview is a plain diff of two strings per file, and it shows exactly what will be written, because it is what will be written.
- Every new operation costs a little more to write: it plans, and leaves applying to the caller.
- The app's main process holds a planned change by id; the renderer confirms it by that id and never sends text or paths back.
- A change set that meets a changed file is refused as a whole. There is no merge; the user asks again and sees the change against the current files.
