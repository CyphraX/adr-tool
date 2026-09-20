# Context Map

The Softarch Suite (working title) has one context per module; [docs/vision.md](docs/vision.md) describes the modules. A glossary lives under `docs/contexts/` until its module has a package of its own, and moves there then.

## Contexts

- [Decisions](./CONTEXT.md): browsing, writing and relating the ADRs of a repository
- [Structure](./docs/contexts/structure/CONTEXT.md): what the code is made of and how its parts depend on each other
- [Conformance](./docs/contexts/conformance/CONTEXT.md): the intended architecture, declared as Rules and checked against the code
- [Diagrams](./docs/contexts/diagrams/CONTEXT.md): pictures of the architecture whose elements are bound to the code
- [Review](./docs/contexts/review/CONTEXT.md): an architect's remarks on code, kept outside the code
- [Assessment](./docs/contexts/assessment/CONTEXT.md): dated evaluations of the architecture and the registers that outlive them

Documentation, the seventh module, gets a glossary when it has terms of its own.

## Shared language

These terms belong to no single context and mean the same in all of them.

**Trace**:
A typed, directed connection from an artefact of one context to an artefact of another — an ADR affects a Component, a Finding cites an Annotation. It is recorded on the source artefact only; the opposite direction is computed.
_Avoid_: Link, reference, Relation (that is ADR to ADR, within Decisions)

**Problem**:
An inconsistency in the suite's own artefacts that the suite detects and names — a Trace to something that does not exist, an orphaned Annotation, a pattern of a Component that matches no Source File. Some Problems have a Repair. Decisions defines the Problems of a Decision Log; every other context adds its own.
_Avoid_: Error, warning, issue, Violation (that is code breaking a Rule), Finding (that is a human judgement)

**Repair**:
An operation the suite offers for a Problem, which writes the one thing that makes the Problem go away, previewed as a change set. A Problem has no Repair where the suite cannot know what was meant. Decisions adds which side it takes as authoritative.
_Avoid_: Fix, quick fix, auto-fix

## Relationships

- **Structure → every other context**: **Component** and **Source File** are defined by Structure and referred to everywhere; a Component is always referred to by its Component ID.
- **Decisions → Structure**: an ADR carries a Trace to the Components it affects.
- **Structure → Conformance**: Conformance evaluates its Rules on Structure's Dependencies and metrics.
- **Conformance → Decisions**: an Exception can carry a Trace to the ADR that justifies it.
- **Structure → Diagrams**: the elements of a Diagram are Components; Drift is measured against Structure's Dependencies.
- **Review → Structure, Decisions**: an Annotation is anchored in a Source File and can carry Traces to ADRs.
- **Assessment → all**: a Finding carries Traces to its evidence — Violations, metric values, Annotations, ADRs.
