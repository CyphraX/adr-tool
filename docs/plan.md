# Implementation plan — v1

How we get from an empty repository to the v1 described in [roadmap.md](roadmap.md).
Vocabulary follows [CONTEXT.md](../CONTEXT.md); the decisions this plan rests on are in [adr/](adr/).

The milestones are ordered from the tightest constraint outward. The tightest constraint is [ADR-0002](adr/0002-never-reserialize-markdown.md): the tool never changes a byte it was not asked to change. That promise decides what `core` is, so `core` comes first and its write path is proven before any UI depends on it.

## Working mode

- One branch and one pull request per milestone; a large milestone comes in parts, each its own pull request that leaves `main` working. `main` stays green.
- CI runs lint, type check and tests on Windows, macOS and Linux from M0 on. Path handling, line endings and file watching differ per platform, and we want to find that out early.
- `core` is built test-first. The first test is the round trip from ADR-0002: open a file, save it unchanged, get identical bytes.
- Hard-to-reverse decisions get an ADR in `docs/adr/`. New domain terms go into CONTEXT.md the moment they are settled.
- No `LICENSE` file until licence and business model are decided (see roadmap).

## Project skeleton

```
adr-tool/
├── .editorconfig
├── .gitattributes              # text files are LF everywhere, but fixtures are "-text": git must not normalize them
├── .prettierignore             # all Markdown and the fixtures: nothing may reformat ADRs, not even our own tooling
├── .github/workflows/ci.yml    # lint + typecheck + test on windows, macos, ubuntu
├── CONTEXT.md
├── package.json                # private workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json          # strict
├── docs/
│   ├── adr/
│   ├── file-format.md          # the on-disk contract; written before core
│   ├── plan.md
│   ├── research/
│   └── roadmap.md
└── packages/
    ├── core/                   # pure TypeScript: no Electron, no DOM
    │   ├── src/
    │   │   ├── text/           # a view over the source text: frontmatter/body split, offsets, EOL, splice edits
    │   │   ├── metadata/       # read the tool's keys; write them without touching anything else
    │   │   ├── log/            # Decision Log discovery, ID schemes, Renumber
    │   │   ├── relations/      # Relation graph, Back-reference derivation
    │   │   ├── lifecycle/      # Accept, Reject, Deprecate, Amend, Supersede, Correction
    │   │   ├── problems/       # checks and their repairs
    │   │   ├── templates/      # .adr/config.yml, built-in Templates
    │   │   ├── foreign/        # tolerant readers and Migration (M5)
    │   │   └── index.ts
    │   └── test/fixtures/      # own-format, adr-tools, madr-3, madr-4
    └── app/                    # Electron + Svelte 5, electron-vite layout
        └── src/
            ├── main/           # windows, file system, file watching, git; the only process with disk access
            ├── preload/        # typed bridge between main and renderer
            └── renderer/       # Svelte UI
```

Two shaping rules for `core`:

- **`core` never touches the disk itself.** It works against a small file-system port (read, write, list, rename). Tests use an in-memory implementation; the app and the later CLI plug in Node's file system.
- **Every operation returns a change set** — the text edits and renames it wants, across all affected files — and the caller applies it. Accepting an ADR that supersedes another touches two files; as one change set it can be previewed, applied together, and undone together.

## Milestones

### M0 — Skeleton

pnpm workspace with `core` and `app`, strict TypeScript, Vitest, ESLint and Prettier, `.gitattributes`, `.editorconfig`, the CI matrix. `app` starts from electron-vite's official `svelte-ts` template and shows an empty window; check that the template is on Svelte 5 and upgrade it if not.

Two guards protect ADR-0002 inside this repository. `packages/core/test/fixtures/**` is marked `-text` in `.gitattributes`, otherwise git would turn the CRLF fixtures into LF on checkout and the line-ending tests would pass without testing anything. And Prettier formats code only, never Markdown and never the fixtures, because reformatting Markdown is exactly the normalization the tool forbids.

*Done when:* CI is green on all three platforms and `pnpm dev` opens the window.

### M1 — `core`, read path

1. **`docs/file-format.md` first.** It is a v1 deliverable and the specification `core` implements: keys, value forms, ID rules, Back-references, what the tool owns and what it leaves alone, line endings.
2. The text view: split frontmatter and body, keep offsets, detect the line ending, and never build a model that would have to be serialized back.
3. **Spike: the metadata writer** (see open decision 1). It belongs to M3 by function, but it is the riskiest piece of the whole plan, so it is proven here.
4. Decision Log discovery in the agreed order: `.adr/config.yml`, then adr-tools' `.adr-dir`, then `docs/adr`, `doc/adr`, `docs/decisions`.
5. IDs for both naming schemes, the Relation graph, derived Back-references, pending effects of ADRs that are still `proposed`.
6. Problems: broken Relations, inconsistent Back-references, duplicate numbers, invalid Metadata.

Fixtures: this repository's own `docs/adr` is the first one.

*Done when:* `core` loads this repository, reports three ADRs, one Relation and no problems, and the round-trip and single-key-edit tests pass on all three platforms.

*Status (2026-09-19):* built. The done-when is `packages/core/test/own-repository.test.ts`. Pending effects (step 5) are the Relations whose state is `pending`. Repairs for Problems, change sets and everything that writes stay in M3 and M4 as planned; the metadata writer from the spike is in `core` but not yet part of its public interface.

### M2 — App shell, read-only

Open a repository, one tab per repository, three columns (sidebar with Decision Logs and Status filters, ADR list, detail with rendered body and Relations panel). File watching, so changes made by git, an editor or an agent show up immediately.

ADRs from foreign repositories are untrusted input. The renderer runs sandboxed with context isolation and a strict content security policy, rendered Markdown is sanitized, nothing is loaded from the network, and links open in the system browser.

*Done when:* the app shows this repository's three ADRs, and editing one of them in another editor updates the view.

*Status (2026-09-19):* built. Both parts of the done-when were checked in the running app over its debugging port: the list shows this repository's three ADRs, and a title edited on disk — and reverted with git — reaches the list within two seconds while the selection stays. The renderer never names a path; it refers to a repository by an id the main process hands out. Known gaps: images with relative paths in an ADR do not load, because the renderer has no file access; panes cannot be resized yet.

### M3 — Write path

- `core`: new ADR from a Template; Accept, Reject, Deprecate; Amend and Supersede with their effect at acceptance; Correction with its record in the Metadata; Renumber. Built-in Templates: Minimal, Nygard, MADR.
- `app`: CodeMirror 6 editor in two modes (source; source with live preview), Metadata edited only through controls — Status through actions, Relations through a picker with search. Change sets are previewed before they are applied.
- Correction flow: editing an ADR that is no longer `proposed` records a Correction, and a conspicuous diff (changed numbers, several new sentences) triggers the "this looks like more than a Correction" prompt.

*Done when:* the full lifecycle of an ADR can be clicked through in the app, and every resulting diff in git contains exactly the intended lines.

*Status (2026-09-19):* built, in five parts. Part 1: change sets, Accept, Reject and Deprecate with a preview. Part 2: the editor — source, and source with live preview — writing the body line by line and recording Corrections. Part 3: creating ADRs from Templates, also to supersede or amend another one. Part 4: the Metadata dialog — decision-makers and tags as free text with suggestions from the log, Relations through a picker with search — writing single items into and out of the lists; an edit of these lists is not a Correction (file-format.md, section 5). Part 5: Renumber, offered where the duplicate number is reported; a change set can carry a rename.

The done-when was checked operation by operation in the running app, on a scratch git repository, each time by reading `git diff`: Accept of an ADR that supersedes and amends (three files, the intended lines), Reject, Deprecate, an edit of a body (the changed lines only), a Correction (plus its entry), New ADR, Supersede and Amend (one new file; the target changes only at acceptance), Edit Metadata (one line per list), Renumber (one rename at 100 % similarity, one line per ADR that names the old ID).

Known gaps: closing the window does not ask about unsaved text yet; a Metadata dialog with very many Relations can grow taller than the window; a change set is not atomic across a failing disk — Renumber renames first so that the likeliest failure, a file held open by another program, happens before anything is written.

A finding of part 4: the app's type check had been pointed at the solution-style `tsconfig.json`, where `svelte-check` sees the components but none of the renderer's plain TypeScript files. A missing function in `state.svelte.ts` passed the check and only failed in the running app. It now checks against `tsconfig.web.json`, which covers both.

### M4 — Finding and seeing

Relations graph (supersede chains, amendments, dependencies), full-text search with quick jump, Problems view with repair actions, git read-only: history, author, date and diff per ADR, uncommitted-changes indicator, current branch. A folder without git still opens, without history.

The wording of Problems lives in the app for now (`lib/wording.ts`). It moves into `core` when `adr lint` arrives, so that the app and the CLI say the same thing.

One broken file must not drown the view: when an ADR's frontmatter cannot be read, the consistency Problems it causes on other ADRs (an unfounded Back-reference, say) are shown under that root cause rather than as separate Problems.

*Done when:* a Correction's diff can be opened from its marker, and a deliberately broken fixture repository can be repaired entirely from the Problems view.

*Status (2026-09-19):* in progress, in five parts: the Problems view, its repairs, git read-only, search, the Relations graph.

Part 1: the Problems view. The sidebar counts the Problems of the Decision Log in view; the view lists each one with the ADRs it is reported on, and the one repair that exists so far — Renumber — sits next to the ADR it would move. Root causes are `core`'s business (`groupProblems`): an ADR whose frontmatter cannot be read is read as if it had none, so a missing or unfounded Back-reference, a `superseded` Status without a successor or one that is not set, reported between it and another ADR, is shown under the unreadable file and not counted. The other ADR's detail still shows such a Problem, and says which file it follows from. A duplicate number is never a consequence: the file name carries the number.

### M5 — Foreign formats

Tolerant readers for MADR 3/4 and adr-tools, driven by fixtures built from [the format survey](research/adr-format-survey.md): three Status locations, four spellings of "superseded by", unknown Status values shown verbatim, a missing Status read as `accepted`. Migration per file or per Decision Log, always as a previewed change set.

*Done when:* an adr-tools repository and a MADR 4 repository open without any write, and their Migration produces one clean, reviewable diff each.

### After v1

As listed in the roadmap: the live editor in its light form, licence, distribution and name before the first public release; then `adr lint`, then MADR 2.x and log4brains.

## Open implementation decisions

Each has a recommendation and a way to verify it. None blocks M0.

1. **The metadata writer.** Checked against the documentation of `yaml` 2.x: its Document API keeps comments, blank lines and key order, but `toString()` re-stringifies — quoting and flow-versus-block style are chosen on output, not preserved. That rules it out for writing. The same library's lower layer retains every character of the input, and parsed nodes carry source offsets (`range`: start, value end, node end). **Recommendation:** parse with `yaml` to read and to locate nodes, write by splicing the original text at those offsets, never by stringifying. **Verify in M1** with hostile fixtures: comments, mixed quoting, flow and block lists, CRLF, foreign keys, keys in unusual order. **Fallback:** a small hand-written editor for the tool's own keys — the schema is tiny and tool-owned. **Verified (2026-09-19):** the spike in `packages/core/src/metadata/write.ts` sets scalars, extends flow and block lists, inserts and removes keys by splicing at `yaml`'s node offsets. On the hostile fixtures every write changes exactly the intended lines; quoting, spacing, comments, foreign keys, CRLF and a byte order mark survive. The fallback is not needed.
2. **git access.** Shell out to the system `git` behind a thin wrapper, rather than a JavaScript reimplementation. Users have git by definition, and its behaviour is the reference. Verify in M4; degrade to "no history" when git is absent.
3. **Packaging.** electron-vite for development and build is settled by M0 (official `svelte-ts` template; needs Node 20.19+ or 22.12+, Node 24 is installed). The packaging tool — electron-builder or Electron Forge — is decided with distribution, before the first public release. Leaning towards electron-builder.
4. **Migration and the body.** In adr-tools the Status lives in a `## Status` section of the body. After Migration the Status is in the Metadata; if the section stays, the file can later contradict itself. **Decided (2026-09-19):** Migration removes the section when it holds nothing but the Status word and supersession lines that were fully captured; otherwise it leaves the section and reports it. Either way the user sees the diff first. This is the one place where the tool edits body text on its own.
5. **Graph rendering.** Decide in M4 with a throwaway prototype, not now.
6. **Line endings.** The tool keeps whatever line ending a file has and uses the Decision Log's prevailing one for new files. `.gitattributes` pins this repository's own Markdown to LF and exempts the fixtures from any normalization, so the round-trip tests see the same bytes on every machine.
7. **Change sets as architecture.** Recorded as [ADR-0004](adr/0004-operations-return-change-sets.md) once Accept, Reject and Deprecate and the app's preview were built on it. The ADR was written as `proposed` and accepted through the app itself.

## Risks

- **Byte-preserving writes.** Addressed by the M1 spike and its fallback.
- **The live editor.** The largest single piece of UI work; deliberately after v1, and in a light form first.
- **Legacy formats vary more than their documentation suggests.** M5 is fixture-driven, and unknown input is shown as it is rather than guessed at.
- **Platform differences** in file watching and paths. The CI matrix runs from M0.

## A note on our own rules

ADR-0002 could use a sentence about line endings under its Consequences. By our own definition that would not be a Correction — it adds meaning to an accepted ADR. So ADR-0002 stays as it is, and the rule lives in `docs/file-format.md` and in decision 6 above.
