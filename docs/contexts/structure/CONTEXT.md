# Structure

What the code of a repository is made of and how its parts depend on each other. Every other context of the suite attaches to the Components defined here.

## Language

**Component**:
A building block of the architecture that the architect names and declares, mapped to code by path patterns. Components are hierarchical: a Component can have child Components. It owns the Source Files that none of its descendants claims, and contains those it owns together with those its descendants own.
_Avoid_: Module (collides with Maven, ES and Java modules), package, building block, C4 "container"

**Component ID**:
The stable identifier of a Component, a path of segments such as `core/metadata`, separate from its display name. Everything that names a Component names this; it changes only through a Rename.
_Avoid_: Name, key, path (the ID is not a folder)

**Rename**:
To give a Component a new Component ID — by changing a segment or by moving it to another parent — rewriting the declaration and everything that names the old ID in one step.
_Avoid_: Move, Renumber (that is for ADRs; Decisions avoids "rename" for it and means a file there)

**Draft**:
The Components the suite derives from a repository's build files and folders as long as none are declared. It is shown as a proposal, and what the suite's checks find on it are hints, not Problems.
_Avoid_: Proposal (`proposed` is a Status), suggestion, default, auto-detection

**Adopt**:
To make the Draft the declaration by writing it into the repository.
_Avoid_: Accept (that decides an ADR), apply, import, generate

**Source File**:
One file of source code; the smallest unit the code model knows. It is owned by at most one Component: where a Component and one of its descendants both claim it, the descendant owns it. A Source File that cannot be parsed is not analysed: it stays in the model without Dependencies of its own.
_Avoid_: Element, unit, class, type

**Unassigned**:
Said of a Source File that no Component claims. It is a state, not a Problem.
_Avoid_: Orphaned (that is an Annotation without its Anchor), unmapped, uncovered

**Dependency**:
A directed use of one Source File by another inside the repository, found in the code. Dependencies between Components are the sum of the Dependencies between their Source Files. A Dependency that exists for the compiler only and is gone at run time is type-only.
_Avoid_: Import (that is only how it is found), reference, coupling (that is a metric computed from Dependencies), Relation

**Cycle**:
A set of Source Files, or of Components of one level, in which each depends on every other, directly or through others. It is reported as one group, not as the many round trips it contains. In Structure a Cycle is a fact; it becomes a Violation only through a Rule.
_Avoid_: Circular dependency, loop, tangle

**Library**:
A third-party package the repository uses. Using a Library is not a Dependency.
_Avoid_: External dependency, third-party dependency, package, artifact

**System**:
Several repositories that together form one piece of software and are looked at as a whole.
_Avoid_: Workspace, project, landscape
