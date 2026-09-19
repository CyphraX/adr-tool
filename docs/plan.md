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

*Status (2026-09-19):* built, in five parts: the Problems view, its Repairs, git read-only, search, the Relations graph.

Part 1: the Problems view. The sidebar counts the Problems of the Decision Log in view; the view lists each one with the ADRs it is reported on, and the one repair that exists so far — Renumber — sits next to the ADR it would move. Root causes are `core`'s business (`groupProblems`): an ADR whose frontmatter cannot be read is read as if it had none, so a missing or unfounded Back-reference, a `superseded` Status without a successor or one that is not set, reported between it and another ADR, is shown under the unreadable file and not counted. The other ADR's detail still shows such a Problem, and says which file it follows from. A duplicate number is never a consequence: the file name carries the number.

Part 2: repairs. What each one writes is specified in [file-format.md, section 5, "Repairs"](file-format.md#repairs), under one rule: the Relation is authoritative. `core` offers the repairs of a Problem (`repairsOf`) and plans one (`planRepair`) only if the log, read afresh, still has a Problem that offers it and that Problem does not merely follow from an unreadable file — so the renderer can ask for nothing `core` would not have offered. Renumber is one repair among the others and goes the same way. A Problem without a repair (frontmatter that cannot be read, a malformed date, a Status outside the five values) says that a person has to fix the file. This half of the done-when is `packages/core/test/repair.test.ts` on the fixture `broken`, and was clicked through in the running app on a scratch git repository: ten Problems, ten Repairs, each `git diff` one or two lines of one file — or one rename — with the quoting, the comments and the CRLF line endings of the files untouched.

Part 3: git, read-only. The main process asks the system's git (`main/git.ts`; decision 2) for three things: the branch and the ADR files with uncommitted changes — shown at the foot of the sidebar, as a dot in the list and next to the path in the detail —, the history of an ADR's file through every rename (`git log --follow`: a Renumber renames), and a file's text before and after a commit. The history dialog lists the commits with author and date and shows the selected one's diff with the same component the preview of a change uses; what is on disk and not committed yet is its first entry. **A Correction finds its commit by what it says**, not by searching messages: every entry of the history carries the Corrections the file records at that point, and the oldest entry that records this one — same date, author and note; of several that read the same, the n-th as the n-th — recorded it. That needs no convention for commit messages, holds when two branches each recorded a Correction and were merged, and also finds a Correction that is not committed yet. A file that was renamed and not committed — a Renumber the app just made — keeps its history: a staged rename is git's to tell, an unstaged one shows as a file that is gone and a new one with the same text. Whether a file is uncommitted is git's to say, never a comparison of bytes: with `core.autocrlf` the working tree has CRLF where the commit has LF. A commit, a checkout or `git add` from outside reaches the view because the watcher also looks at `HEAD`, `index` and `logs/HEAD` in git's directory; every git call goes through the one wrapper and runs with `--no-optional-locks`, so that reading never touches the index and wakes the watcher again. A repository is untrusted input, its configuration and its commit messages included: file names are literal pathspecs, only full object names go back into a command line, the log is parsed NUL-separated, and nothing runs a program the repository names (no fsmonitor, no signature check, blobs through `cat-file`). The renderer never names a path or a revision it was not given: an ADR is named by repository, Decision Log and ID, a commit by a hash out of the history the main process just read. Without git, or outside a repository, the folder opens as before: no branch, no markers, no History button. This half of the done-when was checked in the running app on a scratch repository: the markers of three Corrections open the import commit, the commit that recorded the Correction (its body line and its entry), and "Not committed yet".

Part 4: full-text search with quick jump. Ctrl+K (Cmd+K on a Mac), or the Search button above the list, opens a palette: type, arrow, Enter — and the ADR is in front, whatever view or filter was on, and in whichever Decision Log of the repository it lives. The search runs in the renderer over what is already loaded (`lib/search.ts`, a pure function with its tests): every word has to be somewhere in the ADR; a number as people say it ("4", "0004", "adr-4", "ADR 4", "#4") means that ADR; a match in the title counts more than one in the ID, the tags, the decision-makers, the Status, a date or a Correction, and those more than one in the text. Best first, whichever log a hit is in; of equals, the log in view first; the palette shows the best twelve and says when there are more. Case and accents do not matter ("fur" finds "für"; "ß" stays "ß"): what is compared is folded character by character, so it is exactly as long as the text, and the match can be marked where it is. A hit that only the text explains shows the line it was found in, with the match marked. The shortcut is exactly that chord — the editor has its own use for Ctrl+K on a Mac and for Ctrl+Shift+K everywhere — and does nothing over an open dialog. No index: a Decision Log has tens or hundreds of ADRs, and a scan of loaded text per keystroke is faster than anything that would have to be kept up to date.

Part 5: the Relations graph. The sidebar's "Graph" replaces the list with a drawing of the Decision Log in view, and makes room for it; the ADR that is clicked opens next to it, and its Relations light up. **Left to right is "builds on"**: an ADR stands right of everything it supersedes, amends or depends on, so a chain of supersessions reads like a time line and the foundations stand in the first column. `relates-to` says nothing about order and decides no column. Each type has its own line as well as its own name — as each Status has its own shape —, a Relation of a `proposed` ADR has the colour of `proposed`, one that never took effect is faint. An ADR with Problems carries the same mark as in the list, two Relations between the same two ADRs run side by side, the Relations of the ADR that is open stand out without losing their colour, and a line under the drawing says how to read it. ADRs without any Relation are not drawn; the drawing says how many. A jump from the search stays in the graph when the graph draws the ADR. The layout is our own (decision 5). Checked in the running app on the showcase log and on the broken fixture, where the `supersedes` cycle draws as two arrows between its two ADRs.

The done-when was checked in the running app, on scratch git repositories: the markers of three Corrections open the commit that recorded each (part 3), and the fixture `broken` went from ten Problems to none through ten Repairs, each `git diff` exactly the intended lines (part 2). In `core` the second half is `packages/core/test/repair.test.ts`.

Known gaps: grouping Problems by root cause is about frontmatter that cannot be read at all — a file that can be read but has a Status outside the five values voids its Relations, and what that causes on other ADRs is still listed Problem by Problem. The history dialog does not follow the files while it is open. The search does not fold "ß" to "ss". The graph draws one Decision Log, scrolls but does not zoom, has no filter by Relation type, and its lines are not read out to a screen reader — the same Relations are in every ADR's detail; an ADR that very many others build on across many layers makes a tall drawing, because every long edge gets a lane of its own.

### M5 — Foreign formats

Tolerant readers for MADR 3/4 and adr-tools, driven by fixtures built from [the format survey](research/adr-format-survey.md): three Status locations, four spellings of "superseded by", unknown Status values shown verbatim, a missing Status read as `accepted`. Migration per file or per Decision Log, always as a previewed change set.

*Done when:* an adr-tools repository and a MADR 4 repository open without any write, and their Migration produces one clean, reviewable diff each.

*Status (2026-09-19):* in parts: the reader for adr-tools, the reader for MADR, Migration. The mapping of each format is in [file-format.md, section 8](file-format.md#8-foreign-formats), written before its reader.

Part 1: the files of adr-tools. A file without frontmatter whose body has a `## Status` section is read as adr-tools wrote it (`core/src/foreign/adr-tools.ts`): the Status from the section's text, the link lines `Supercedes` and `Superceded by` — in adr-tools' spelling and in the dictionary's —, `Amends` and `Amended by` as Relations and Back-references, the `Date:` line as `created`. A "superseded by" line makes the ADR `superseded` whatever the text next to it says: adr-tools only deletes the word `Accepted`. Such an ADR is `foreign`, and **the rule that the spec only implied is now enforced: nothing writes to it.** Before, a file without frontmatter was simply an `accepted` ADR of our own format, and Accept, a Correction or a Repair would have spliced frontmatter on top of a `## Status` section that says something else. Every operation that would write to a foreign file is refused in `core` and not offered in the app, and so is what could only be completed by writing to one: a new ADR, or a Relation of a `proposed` one, that would supersede or amend a foreign ADR. A Repair that would write to a foreign file is not offered, and refused with that reason when asked for all the same. Renumber renames a foreign file, which writes nothing into it, and is refused when a foreign file mentions the old ID anywhere — as a link the tool reads as a Relation or as one it does not: nobody could correct the dead link from here. Recognition is conservative — no frontmatter and a real `## Status` heading, nothing else — so that nobody loses write access to a file of our own format because it looks a little like something else. One rule changed for every format: a number in the title that repeats the ADR's own (`# 3. Title`) is not part of the title, so that a migrated file reads the same as before; file-format.md, section 4, names the price. A repository is untrusted input, and the review of this part found the two ways it mattered here: the words of a link line were looked up in a plain object, where `constructor [x](y.md)` finds something and one such line kept the whole repository from opening; and two regular expressions backtracked quadratically over a long line. The words are in a `Map` now, a link line is taken apart by hand, a heading's closing `#`s are cut off by hand, and a test feeds the reader lines of 300,000 characters. Checked in the running app on a scratch git repository made from the fixture `adr-tools`: nine ADRs, three Relations in the graph, one Problem (a Status the tool does not know, shown as written), no write buttons on the eight foreign ADRs, `git status` clean afterwards.

Part 2: the files of MADR (`core/src/foreign/madr.ts`). Most of MADR 3 and 4 is valid as it stands — `status: accepted`, `decision-makers`, and `date`, `consulted`, `informed` or Jekyll's keys as foreign keys — so a file is MADR's only when it says what our format cannot: a `status` that begins with "superseded by", or `deciders` for the decision-makers. The successor is a Markdown link in MADR 3 and an identifier in MADR 4 (`ADR-0005`, in the ways people write that); the identifier names the one ADR of the log with that number, and when there is none, or two, it stays as written and is a Problem like any unknown ID. **MADR records a supersession on the superseded ADR only.** Read naively that is an unfounded Back-reference on every superseded ADR, with a Repair that would take the `superseded` Status away — so while a file is read as MADR's, the successor it names is read as superseding it (`log/load.ts`), in memory, and Migration will write `supersedes` into the successor. Renumber is refused for an ADR whose number such a file names. The third Status location of the milestone's first sentence, the list under the title (MADR 2, log4brains), is read for the Status alone; the rest of those two formats stays after v1, as the roadmap has it. MADR's `date` is not mapped: it is the day of the last update, neither `created` nor `decided`. Checked in the running app on a scratch git repository made from the fixture `madr`: ten ADRs, the template and the README skipped, two Relations read from the superseded side, four Problems that are a person's to look at (`on hold`, the template's placeholder left in, a successor that does not exist), `git status` clean afterwards.

### After v1

As listed in the roadmap: the live editor in its light form, licence, distribution and name before the first public release; then `adr lint`, then MADR 2.x and log4brains.

## Open implementation decisions

Each has a recommendation and a way to verify it. None blocks M0.

1. **The metadata writer.** Checked against the documentation of `yaml` 2.x: its Document API keeps comments, blank lines and key order, but `toString()` re-stringifies — quoting and flow-versus-block style are chosen on output, not preserved. That rules it out for writing. The same library's lower layer retains every character of the input, and parsed nodes carry source offsets (`range`: start, value end, node end). **Recommendation:** parse with `yaml` to read and to locate nodes, write by splicing the original text at those offsets, never by stringifying. **Verify in M1** with hostile fixtures: comments, mixed quoting, flow and block lists, CRLF, foreign keys, keys in unusual order. **Fallback:** a small hand-written editor for the tool's own keys — the schema is tiny and tool-owned. **Verified (2026-09-19):** the spike in `packages/core/src/metadata/write.ts` sets scalars, extends flow and block lists, inserts and removes keys by splicing at `yaml`'s node offsets. On the hostile fixtures every write changes exactly the intended lines; quoting, spacing, comments, foreign keys, CRLF and a byte order mark survive. The fallback is not needed.
2. **git access.** Shell out to the system `git` behind a thin wrapper, rather than a JavaScript reimplementation. Users have git by definition, and its behaviour is the reference. Verify in M4; degrade to "no history" when git is absent. **Verified (2026-09-19):** `packages/app/src/main/git.ts`, tested against a scratch repository whose opened directory lies below the top of the repository, with a rename, CRLF text and a non-ASCII commit subject; without a repository, and with a git that does not exist, every call answers "nothing".
3. **Packaging.** electron-vite for development and build is settled by M0 (official `svelte-ts` template; needs Node 20.19+ or 22.12+, Node 24 is installed). The packaging tool — electron-builder or Electron Forge — is decided with distribution, before the first public release. Leaning towards electron-builder.
4. **Migration and the body.** In adr-tools the Status lives in a `## Status` section of the body. After Migration the Status is in the Metadata; if the section stays, the file can later contradict itself. **Decided (2026-09-19):** Migration removes the section when it holds nothing but the Status word and supersession lines that were fully captured; otherwise it leaves the section and reports it. Either way the user sees the diff first. This is the one place where the tool edits body text on its own.
5. **Graph rendering.** Decide in M4 with a throwaway prototype, not now. **Decided (2026-09-19):** a layered layout of our own (`packages/app/src/renderer/src/lib/graph-layout.ts`, about 200 lines, a pure function with its tests), drawn as HTML buttons over one SVG. There was no separate throwaway prototype, and no library was tried against it: the first version of that function was looked at in the running app on the showcase log and on the broken fixture, and probed with synthetic logs (40 ADRs in the tests, a fuzz of 400 graphs in review), and it was good enough to keep. It does longest-path layering, a few barycentre sweeps against crossings, waypoints for edges that skip a layer, and neighbours pulled level so that a chain is a straight line. What decided it: these graphs are tens of ADRs and mostly chains; the layout wants to know the domain (what "builds on" means, that `relates-to` does not say which of the two builds on the other, that a cycle must still draw); and the renderer runs under a strict content security policy with nothing from the network, where a layout library is one more thing to audit. The fallback, should logs grow past what this handles, is a bundled layout library (dagre) behind the same function.
6. **Line endings.** The tool keeps whatever line ending a file has and uses the Decision Log's prevailing one for new files. `.gitattributes` pins this repository's own Markdown to LF and exempts the fixtures from any normalization, so the round-trip tests see the same bytes on every machine.
7. **Change sets as architecture.** Recorded as [ADR-0004](adr/0004-operations-return-change-sets.md) once Accept, Reject and Deprecate and the app's preview were built on it. The ADR was written as `proposed` and accepted through the app itself.

## Risks

- **Byte-preserving writes.** Addressed by the M1 spike and its fallback.
- **The live editor.** The largest single piece of UI work; deliberately after v1, and in a light form first.
- **Legacy formats vary more than their documentation suggests.** M5 is fixture-driven, and unknown input is shown as it is rather than guessed at.
- **Platform differences** in file watching and paths. The CI matrix runs from M0.

## A note on our own rules

ADR-0002 could use a sentence about line endings under its Consequences. By our own definition that would not be a Correction — it adds meaning to an accepted ADR. So ADR-0002 stays as it is, and the rule lives in `docs/file-format.md` and in decision 6 above.
