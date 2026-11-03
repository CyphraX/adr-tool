# Review

An architect's remarks on code, kept outside the code and built to survive its change.

## Language

**Annotation**:
A remark by a person on a range of lines in a Source File, stored outside that file. It is a `note`, a `question` or a `concern`, and it is either open or resolved.
_Avoid_: Comment (that is a comment in the source code), note (that is only one of its types), remark, Finding

**Reply**:
A person's answer under an Annotation, in a file of its own beside it, so that people who reply at the same time meet in a merge without a conflict. The Replies of an Annotation are its conversation; they have no state of their own.
_Avoid_: Comment, response, thread, follow-up

**Resolve / Reopen**:
To mark an Annotation resolved, or open again. Nothing is deleted: a resolved Annotation stays where it is, with its Replies.
_Avoid_: Close, done, delete, Accept (that decides an ADR)

**Anchor**:
What ties an Annotation to its place: the Source File, the line range, the quoted lines and the commit they were read in.
_Avoid_: Location, position, range

**Quoted lines**:
The lines of the Source File as they were when the Annotation was written, kept in it: what the suite looks for when the code changes. The lines around them are not kept.
_Avoid_: Snippet, excerpt, context, selection

**Similarity**:
How much of the quoted lines a block of lines still is, from 0 to 1: one minus their edit distance in characters, line by line, over the length of the longer of the two. A block is similar enough at one half.
_Avoid_: Score, confidence, match, distance (that is what it is measured from)

**Moved**:
Said of an Annotation whose Anchor is found again, but not as it is written: at other lines, in a renamed Source File, or with other text. It is shown at its new place; writing that place into the Anchor is **Update the Anchor**, a previewed change.
_Avoid_: Relocated, outdated, stale, Drift (that is a Diagram that disagrees with the code)

**Orphaned**:
Said of an Annotation whose Anchor can no longer be found in the code. An orphaned Annotation is a Problem; it has no Repair, and is attached again by hand.
_Avoid_: Stale, outdated, detached, broken

**Attach again**:
To give an Annotation a new Anchor by selecting the lines it is about: what a person does for an orphaned one, or for one that the suite found in the wrong place.
_Avoid_: Re-anchor, reattach, fix, Repair (an orphaned Annotation has none)
