# Assessment

Dated evaluations of a repository's architecture, and the registers of risks and technical debt that outlive them.

## Language

**Assessment**:
A dated evaluation of the architecture, written by a person and kept as a Markdown document in the repository. It rates Quality Scenarios and records Findings. It is a **draft** while it is written and **final** once it is finished: a final Assessment is a record of its day.
_Avoid_: Review (that is the context of Annotations), audit, evaluation, report (that is an export of an Assessment); proposed, accepted, published (those say an ADR's Status, or nothing)

**Quality Scenario**:
A concrete, checkable statement of how the system must behave with respect to one Quality Attribute, against which an Assessment rates the architecture: what arrives at the system, how it responds, and how the response is measured. It keeps its ID when the next Assessment carries it over.
_Avoid_: Quality goal (that is the attribute, not the scenario), requirement, NFR, use case

**Quality Attribute**:
One of the eight characteristics of ISO/IEC 25010, or one of its sub-characteristics: what a Quality Scenario is about — maintainability, or maintainability's modifiability.
_Avoid_: Quality goal, NFR category, "-ility", metric (that is what the suite measures)

**Importance, Difficulty**:
How much a Quality Scenario matters to the system's success, and how hard it is for the architecture to achieve — each high, medium or low. Together they place the Scenario in the utility tree.
_Avoid_: Priority, weight, effort, Risk (that is an entry of its own)

**Rating**:
How well the architecture, as assessed, meets a Quality Scenario's measure, in the judgement of the Assessment's author: met, partly met or not met. The suite never rates, and never adds ratings up.
_Avoid_: Score, grade, result, Status (that is an ADR's)

**Finding**:
A judgement a person records in an Assessment, with its Evidence attached through Traces.
_Avoid_: Violation (that is derived from the code), Problem, issue, observation

**Evidence**:
What a Finding rests on: Traces to Violations, by their fingerprints, to metric values of Components, to Annotations, to ADRs, to Risks and to Technical Debt Items.
_Avoid_: Proof, source, reference, link

**Entry**:
A Quality Scenario or a Finding as an Assessment holds it: a heading of the author's with a small block below it that the suite reads. Everything around the entries is the author's text.
_Avoid_: Item, record, section (that is the author's grouping of entries)

**Snapshot**:
The metric values at the time of an Assessment, frozen into a file beside it with the commit they were taken at, so that its Evidence keeps reading the same however the code moves on. Taking a Snapshot writes it anew; a final Assessment's Snapshot stays as it is.
_Avoid_: Baseline (that is the recorded Violations of Conformance), cache, report, history

**Risk**:
Something that may go wrong with the architecture, kept as an entry of its own in the register of Risks with its own state — open, mitigated, accepted or closed. It outlives the Assessment in which it was first named.
_Avoid_: Threat, concern (that is a type of Annotation), issue

**Technical Debt Item**:
A known shortcoming of the architecture that was accepted for now and is to be paid off, kept as an entry of its own in the register of Technical Debt Items with its own state — open, scheduled or paid off.
_Avoid_: Tech debt (as a countable thing), TODO, Finding, Risk (a Risk may happen; debt already exists)

**Register**:
The Risks, or the Technical Debt Items, of a repository: one file per entry in a directory of its own, so that entries recorded on two branches meet without a conflict. Which Assessments name an entry is computed, never written into it.
_Avoid_: List, backlog, log (that is a Decision Log), board (that is a view of a register)

**State**:
Where a Risk or a Technical Debt Item stands, changed by a person as it is dealt with. A change of it records the day it was made.
_Avoid_: Status (that is an ADR's), stage, phase
