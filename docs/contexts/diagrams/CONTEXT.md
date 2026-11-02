# Diagrams

Pictures of the architecture whose elements are bound to the code, so that a picture can be compared with what it depicts.

## Language

**Diagram**:
A hand-arranged picture of Components, External Systems and the connections between them, kept as a file in the repository. The Dependency graph computed by Structure is not a Diagram.
_Avoid_: Drawing, chart, model, view

**Element**:
A box of a Diagram: a Component, named by its Component ID; an External System; or, in a system context, the repository itself as one box. Every element has an ID within its Diagram.
_Avoid_: Node (that is a box of Structure's views), shape, item, Component (that is one kind of element only)

**External System**:
Software outside the repository that a Diagram shows as a plain box. It has no code behind it and is not a Component.
_Avoid_: System (that is several repositories looked at as one), actor, third party, Library

**Connection**:
An arrow of a Diagram from one element to another that it uses, with a label. Between two Components it stands for the Dependencies of the one on the other; the Diagram does not say whether they are type-only.
_Avoid_: Edge, Dependency (that is found in the code), Relation (that is ADR to ADR), link, Trace

**View level**:
How deep a Diagram looks into the Component hierarchy, after the C4 model: a system context shows the repository as one box, a container view the top-level Components, a component view the children of its scope.
_Avoid_: Level on its own (that is a level of Structure's views), zoom, layer

**Scope**:
The Component a component view looks into. Its children are what the view shows; the Components beside it, and beside what contains it, may stand beside them.
_Avoid_: Parent, focus, boundary

**Layout**:
Where each box of a Diagram stands and how large it is, as its file says. It belongs to the file and is never recomputed.
_Avoid_: Arrangement, positions, geometry

**Suggested connection**:
A connection the code has between two Components a Diagram shows — the Dependencies between the Source Files they contain —, offered to be drawn. It is derived and never stored.
_Avoid_: Proposal, hint, auto-connection, Draft (that is Structure's derived Components)

**Drift**:
A difference between a Diagram and the code: a connection the code does not have, or a Dependency between shown Components that the Diagram leaves out. It is derived and never stored. An element whose Component is gone is a Problem, not Drift.
_Avoid_: Violation (that is code breaking a Rule), Problem, deviation, staleness

**Export**:
To write the picture of a Diagram as SVG beside its file, as a previewed change. The SVG is derived, and committed on purpose.
_Avoid_: Render, publish, save (that is writing the Diagram itself)
