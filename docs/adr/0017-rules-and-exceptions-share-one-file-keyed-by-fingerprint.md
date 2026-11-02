---
status: accepted
created: 2026-11-02
decided: 2026-11-02
decision-makers: [Philipp Saal]
tags: [conformance, file-format]
depends-on: [0002-never-reserialize-markdown, 0007-the-analysis-never-executes-anything-from-the-analysed, 0009-traces-are-recorded-on-the-source-only-unlike-back]
affects: [conformance, cli]
---

# Rules and Exceptions share one file, keyed by fingerprint

The Conformance module needs a file for the intended architecture that Lena writes by hand, an agent writes through the MCP server, and the window will write through a form — and that Jonas reads on GitHub when a check fails his pull request. So the Rules of a repository are a list in `.arch/rules.yml`, beside `.arch/components.yml`: one block item per Rule, with an `id` that stays, a `why` in a sentence, an explicit `kind`, and Components named by Component ID or by a pattern over IDs (`ui/**`), never by path ([conformance-format.md](../conformance-format.md)). The Exceptions are a second list in the same file, `exceptions`, and an applied Pattern a third, `patterns`. An Exception names the Violation it accepts by the Violation's **fingerprint**: the Rule's ID and what the Violation is about, by the kind of the Rule — the source and the target Component of a Dependency, the members of a Cycle, the Component of a metric — and never a file or a line. It carries a `reason` and, optionally, a Trace to the ADR that justifies it, `justified-by`, written as the repository names an ADR from outside a Decision Log (`docs/adr/0012-…`).

## Considered Options

- **Exceptions in a file of their own, `.arch/exceptions.yml`.** Rules would change rarely and Exceptions often, each in its own diff. But an Exception means nothing without its Rule: a reviewer who reads one file sees the Rule and what it allows, and a Rule that is removed shows its Exceptions in the same diff. A form, an agent and a Rename write one file instead of two, and the two lists cannot fall out of step across files. The Baseline of part 5 is different — a set of fingerprints the suite writes in bulk, never read as prose —, and gets the file of its own, `.arch/baseline.yml`.
- **Exceptions inside their Rule**, as a list under each Rule. The closest reading. But a Rule's lines would grow with every accepted Violation, a form that changes a Rule would rewrite more than the Rule, and a fingerprint would lose its Rule ID, which another artefact — a Baseline, a Finding — has to name.
- **The fingerprint as one string**, `billing-not-web:billing->web`. Short to cite, but a separator is a grammar of its own, and it collides with the Component IDs of another repository (`payments:billing`, part 17) and with the paths of a Cycle among Source Files. Keys read on GitHub without a manual and are matched exactly; one line of text, `billing-not-web: billing -> web`, is still printed for reading.
- **Line numbers or a hash of the import in the fingerprint.** It would tell two imports apart, but it changes when a line is added above an import, which is exactly what Jonas must not be failed for. A Violation is between two Components: a second import of the same kind is the same Violation, with one more Source File Dependency behind it.
- **The kind given by the key that names it** (`from: ui` with `must-not-depend: [persistence]`). One line shorter. An explicit `kind` lets a version of the suite say of a Rule from a later version that it does not know its kind, instead of that it has none, and gives a form one field to choose from.
- **Rules as code**, in the manner of ArchUnit. They would break [ADR-0007](0007-the-analysis-never-executes-anything-from-the-analysed.md).

## Consequences

- A Violation is found at the outermost Component a Rule names below the point where the two files' chains of Components part. Declaring a child Component beneath one side later leaves the fingerprint — and the Exception that names it — as it was.
- An Exception that matches no Violation is a Problem, and so is one whose ADR does not exist: fixing a Violation removes its Exception in the same change, and the file never collects permissions for what is gone. The fingerprint of a Cycle among Source Files names their paths; when one of them is moved, its Exception matches nothing, and says so.
- Rename of a Component rewrites the IDs in Rules, fingerprints and applied Patterns in the same change set as the declaration and the ADRs ([structure-format.md](../structure-format.md), section 1). `conformance` plans its half; the app joins the halves ([ADR-0006](0006-one-core-package-per-module-on-a-shared-kernel.md)).
- The Trace of an Exception to an ADR is recorded on the Exception alone ([ADR-0009](0009-traces-are-recorded-on-the-source-only-unlike-back.md)). `conformance` does not know Decisions: whoever checks the file — `adr check`, later the app — tells it which ADRs exist.
- Rules are evaluated on the declaration only. On a Draft, whose IDs follow directories, a file with Rules is a Problem until the Components are adopted.
- `adr check` analyses the code, so the command line now carries what Structure's analysis needs: the `typescript` package and the two `.wasm` files of tree-sitter are bundled into `dist/adr.mjs`, the WebAssembly as base64 text in the file. It stays one file with nothing to install beside it, as [cli.md](../cli.md) promises, at about 12 MB instead of 2. Loading it from a sibling file or from `node_modules` was not chosen: a copy of the command would break where the sibling is missing, and a `node_modules` of the analysed repository is the repository's, not the suite's. The command never runs anything from the repository it checks: it asks git, with the guards the app uses, which files there are, and reads them as text.
