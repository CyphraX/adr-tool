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
To give a Component a new Component ID by changing its segment, rewriting the declaration and everything that names the old ID in one step. Moving a Component to another parent changes its ID too, but is done by hand; what it leaves dangling shows up as Problems.
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

**Directory node**:
A directory below a Component without children, as the views show it, so that the levels go down as deep as the folders do. It has the Dependencies, Cycles and metrics of a Component, but it is not one: nothing declares it, and nothing may name it — no Trace, no Rule. Who wants it named declares it as a Component.
_Avoid_: Sub-component, package (Java's), folder Component

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
A third-party package that a Manifest of the repository declares or its code uses. Using a Library is not a Dependency. It is known by the name the code imports it by, which need not be the name it is declared by: `PyYAML` is imported as `yaml`.
_Avoid_: External dependency, third-party dependency, package, artifact

**Manifest**:
A file in which a part of the repository declares the Libraries it needs, with their versions: `package.json`, `pom.xml`, `build.gradle`, `pyproject.toml`, a requirements file, `go.mod`. It is read as text and never run, and it belongs to the Component whose code lies below it.
_Avoid_: Build file (that is what the Draft reads, a Manifest among others), lockfile (that says what was installed, not what was declared), dependency file

**Library inventory**:
The Libraries of a repository or of a Component, seen together: for each one the Manifests that declare it, its versions, the Components and Source Files that use it, and its declared licence. It says what is declared and not used, and what is used and not declared. It is derived, never stored.
_Avoid_: SBOM or bill of materials (those are documents for exchange, with every package installed), dependency list, Libraries alone

**Declared licence**:
The licence that the copy of a Library installed in the repository says it has. It is read, never guessed from a licence's text or looked up elsewhere; where it cannot be told, the inventory says why.
_Avoid_: Licence check, compliance (the suite judges no licence), detected licence

**System**:
Several repositories that together form one piece of software and are looked at as a whole.
_Avoid_: Workspace, project, landscape
