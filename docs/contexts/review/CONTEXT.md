# Review

An architect's remarks on code, kept outside the code and built to survive its change.

## Language

**Annotation**:
A remark by a person on a range of lines in a Source File, stored outside that file. It is a `note`, a `question` or a `concern`, and it is either open or resolved.
_Avoid_: Comment (that is a comment in the source code), note (that is only one of its types), remark, Finding

**Anchor**:
What ties an Annotation to its place: the Source File, the line range, the quoted lines and the commit they were read in.
_Avoid_: Location, position, range

**Orphaned**:
Said of an Annotation whose Anchor can no longer be found in the code. An orphaned Annotation is a Problem.
_Avoid_: Stale, outdated, detached, broken
