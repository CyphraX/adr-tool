# Assessment

Dated evaluations of a repository's architecture, and the registers of risks and technical debt that outlive them.

## Language

**Assessment**:
A dated evaluation of the architecture, written by a person and kept as a document in the repository. It rates Quality Scenarios and records Findings.
_Avoid_: Review (that is the context of Annotations), audit, evaluation, report (that is an export of an Assessment)

**Quality Scenario**:
A concrete, checkable statement of how the system must behave with respect to one quality attribute, against which an Assessment rates the architecture.
_Avoid_: Quality goal (that is the attribute, not the scenario), requirement, NFR

**Finding**:
A judgement a person records in an Assessment, with its evidence attached through Traces.
_Avoid_: Violation (that is derived from the code), Problem, issue, observation

**Snapshot**:
The metric values at the time of an Assessment, frozen into it so that its evidence keeps reading the same.
_Avoid_: Baseline (that is the recorded Violations of Conformance), cache, report

**Risk**:
Something that may go wrong with the architecture, kept as an entry of its own with its own state. It outlives the Assessment in which it was first named.
_Avoid_: Threat, concern (that is a type of Annotation), issue

**Technical Debt Item**:
A known shortcoming of the architecture that was accepted for now and is to be paid off, kept as an entry of its own with its own state.
_Avoid_: Tech debt (as a countable thing), TODO, Finding, Risk (a Risk may happen; debt already exists)
