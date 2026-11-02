---
status: accepted
created: 2026-11-02
decided: 2026-11-02
decision-makers: [Philipp Saal]
tags: [review, file-format]
depends-on: [0004-operations-return-change-sets, 0020-git-is-a-port-of-the-kernel-implemented-once-for-node]
relates-to: [0002-never-reserialize-markdown]
affects: [review]
---

# An Anchor is found again by its quoted lines and its history

An Annotation is kept outside the code it is about ([vision.md](../vision.md), Review), so nothing in the code moves with it: the next commits insert lines above it, edit the lines it quotes, move them, delete them, rename their file; a rebase replaces the commit it was written at. Aylin gives up on the suite when an Annotation is lost after a rebase ([personas.md](../personas.md)), and a remark found again at the wrong lines is worse than one that says it is lost. The Anchor keeps four things for that: the Source File, the line range, the quoted lines, and the commit they were read in ([review-format.md](../review-format.md), section 2).

The suite finds an Anchor again in four steps, whenever the code is read with the Annotations, and writes nothing on its own ([review-format.md](../review-format.md), section 4):

1. **The file**, at its path, or where git says it was renamed to: from the Anchor's commit to HEAD, or — without that commit — through the renames of the commits since the day before the Annotation was written.
2. **Unchanged**, when its lines at the range are the quoted lines.
3. **With history**: the file as the Anchor's commit has it — or, the commit gone, the newest of the last 50 versions of the file that has the quoted lines at the range — is compared with the file now, line by line. Only lines that are new since then, or quoted lines that were kept, may be the Anchor's: first the quoted lines themselves, whitespace aside, the nearest to where the diff takes the old range; then the most similar block among them.
4. **Without history** — the lines were read before they were committed, or git is not there —: the quoted lines anywhere in the file, the nearest to the old range; then the most similar block within 50 lines of it.

**Similarity** is one minus the edit distance in characters between the quoted lines and a block, line by line with whitespace normalized, over the characters of the longer of the two. **Similar enough** is one half: the bar git sets for a rename, and the default of the fuzzy match of diff-match-patch. A block that is found is **moved**, and its place is offered as Update the Anchor, a previewed change ([ADR-0004](0004-operations-return-change-sets.md)); one that is not is **orphaned**, a Problem without a Repair, since only a person knows where the remark belongs now.

## Considered Options

- **Follow the diff only**, as a code host follows a review comment until it is outdated. Exact while the commit is there; after a rebase, or in a fresh clone of a rebased branch, there is nothing to follow, and that is Aylin's case.
- **Search only**, for the quoted lines and then for similar ones. It survives every rebase, but a deleted method is found again in its look-alike next to it — two getters differ by a name —, and the remark lands on code it was never about. With the history, lines that were there before and not quoted are never candidates, so a deletion stays a deletion.
- **Keep lines of context around the quote**, as web annotations keep a prefix and a suffix. More to compare with, and more that goes stale; the file would also say more than the person selected.
- **A stricter bar** (three quarters). Fewer wrong finds without history, but a one-line Anchor whose line gained an argument is orphaned. **A measure on words** rather than characters punishes a renamed identifier harder and tells look-alikes apart no better.

## Consequences

- An Anchor costs a few reads of git when the code changed: whether its commit is there, the renames since, the file at that commit — or, after a rebase, at up to 50 commits until one has the quoted lines. What a run reads once, HEAD and the changes since a commit, is shared by every Annotation.
- A line diff of more than twelve million line pairs — a file of thousands of lines rewritten — is not computed; the search goes on without history.
- Without history, look-alike code near the old place can be taken for the quoted lines. Update the Anchor shows the lines it found before anything is written, and the person attaches the Annotation again where it belongs.
- With history, a block that was moved and edited in one commit is found among the new lines if it is still similar enough; one that was rewritten is orphaned, which says that the remark may no longer hold.
- A quote of blank lines or a lone brace is found wherever such lines are. The suite cannot know more than was quoted.
- A rename that is not committed is not followed: the Annotation reads as orphaned until it is, or until it is attached again.
- The constants — 0.5, 50 lines, 50 commits, 1000 commits without a day — are in `packages/review/src/find.ts` and `similarity.ts` and in the format; changing one changes what is found again, and is a change of the format.
