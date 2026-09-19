# Diagrams

Pictures of the architecture whose elements are bound to the code, so that a picture can be compared with what it depicts.

## Language

**Diagram**:
A hand-arranged picture of Components, External Systems and the connections between them, kept as a file in the repository. The Dependency graph computed by Structure is not a Diagram.
_Avoid_: Drawing, chart, model, view

**External System**:
Software outside the repository that a Diagram shows as a plain box. It has no code behind it and is not a Component.
_Avoid_: System (that is several repositories looked at as one), actor, third party, Library

**Drift**:
A difference between a Diagram and the code: a connection the code does not have, or a Dependency between shown Components that the Diagram leaves out. It is derived and never stored.
_Avoid_: Violation (that is code breaking a Rule), Problem, deviation, staleness
