# Structure

What the code of a repository is made of and how its parts depend on each other. Every other context of the suite attaches to the Components defined here.

## Language

**Component**:
A building block of the architecture that the architect names and declares, mapped to code by path patterns. Components are hierarchical: a Component can contain Components.
_Avoid_: Module (collides with Maven, ES and Java modules), package, building block, C4 "container"

**Component ID**:
The stable identifier of a Component, a path of slugs such as `core/metadata`, separate from its display name. Everything that refers to a Component refers to this; it changes only through a rename carried out by the suite.
_Avoid_: Name, key, path (the ID is not a folder)

**Source File**:
One file of source code; the smallest unit the code model knows. It belongs to at most one Component.
_Avoid_: Element, unit, class, type

**Dependency**:
A directed use of one Source File by another inside the repository, found in the code. Dependencies between Components are the sum of the Dependencies between their Source Files.
_Avoid_: Import (that is only how it is found), reference, coupling (that is a figure computed from Dependencies), Relation

**Library**:
A third-party package the repository uses, as named in its build manifests. Using a Library is not a Dependency.
_Avoid_: External dependency, third-party dependency, package, artifact

**System**:
Several repositories that together form one piece of software and are looked at as a whole.
_Avoid_: Workspace, project, landscape
