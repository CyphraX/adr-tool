# Conformance

The intended architecture of a repository, declared by the architect, and the places where the code departs from it.

## Language

**Rule**:
A declared statement about what the code may look like — which Components may depend on which, that there are no cycles, that a metric stays within a threshold. It lives in a file in the repository.
_Avoid_: Constraint, check, policy, fitness function (a Rule on a metric is one, but it is still a Rule)

**Component pattern**:
How a Rule names Components: a Component ID, or one with wildcards over IDs — `*` within a segment, `**` for any number of segments — such as `ui/**` or `features/*`. It is matched against the declared Components, never against paths.
_Avoid_: Glob, path pattern (those match files, as `paths` in the declaration does), selector, wildcard

**Pattern**:
A named set of Rules for an architecture style, such as layered or hexagonal, written in terms of roles. It is applied by assigning Components to its roles.
_Avoid_: Template (that is the blueprint of an ADR), preset, style, design pattern

**Applied Pattern**:
A Pattern as one repository applies it, recorded in its Rules file: which Pattern, under a name of its own, and which Components fill which role. Its Rules are derived from it, never written out.
_Avoid_: Pattern instance, binding, profile; Pattern alone (that is the style, not its application here)

**Violation**:
One place where the code breaks a Rule. It is derived from the code and never stored; it is identified by the Rule and by what it connects, not by line numbers.
_Avoid_: Problem (that is an inconsistency in the suite's own artefacts), Finding (that is a human judgement), error, issue

**Fingerprint**:
The name of a Violation that stays when lines move: its Rule and what it is about — the source and target Component of a Dependency, the members of a Cycle, the Component of a metric, the Source File and qualified name of a function or class whose metric is outside (a second one of the same name is told apart by its position, which a function of that name added before it moves). Exceptions, the Baseline and Findings name a Violation by it.
_Avoid_: ID, hash, key (a fingerprint has no line number and is not a hash of the code)

**Exception**:
A Violation the architect has accepted, recorded next to the Rules with a reason. It can carry a Trace to the ADR that justifies it.
_Avoid_: Waiver, suppression, ignore

**Baseline**:
A recorded set of Violations that exist today, so that only Violations added later count as failures.
_Avoid_: Snapshot (that is the frozen metrics of an Assessment), ignore list
