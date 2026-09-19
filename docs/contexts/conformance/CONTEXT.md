# Conformance

The intended architecture of a repository, declared by the architect, and the places where the code departs from it.

## Language

**Rule**:
A declared statement about what the code may look like — which Components may depend on which, that there are no cycles, that a metric stays within a threshold. It lives in a file in the repository.
_Avoid_: Constraint, check, policy, fitness function (a Rule on a metric is one, but it is still a Rule)

**Pattern**:
A named set of Rules for an architecture style, such as layered or hexagonal, written in terms of roles. It is applied by assigning Components to its roles.
_Avoid_: Template (that is the blueprint of an ADR), preset, style, design pattern

**Violation**:
One place where the code breaks a Rule. It is derived from the code and never stored; it is identified by the Rule and by what it connects, not by line numbers.
_Avoid_: Problem (that is an inconsistency in the suite's own artefacts), Finding (that is a human judgement), error, issue

**Exception**:
A Violation the architect has accepted, recorded next to the Rules with a reason. It can carry a Trace to the ADR that justifies it.
_Avoid_: Waiver, suppression, ignore

**Baseline**:
A recorded set of Violations that exist today, so that only Violations added later count as failures.
_Avoid_: Snapshot (that is the frozen metrics of an Assessment), ignore list
