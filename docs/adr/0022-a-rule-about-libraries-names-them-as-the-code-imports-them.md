---
status: accepted
created: 2026-11-03
decided: 2026-11-06
decision-makers: [Philipp Saal]
tags: [conformance, file-format]
depends-on: [0017-rules-and-exceptions-share-one-file-keyed-by-fingerprint]
relates-to: [0007-the-analysis-never-executes-anything-from-the-analysed, 0008-dependencies-come-from-parsers-alone-without-a-type-checker]
affects: [conformance, structure/libraries]
---

# A Rule about Libraries names them as the code imports them

Lena writes "only `persistence` may use `pg`" into `.arch/rules.yml`. Aylin accepts one use of it elsewhere as an Exception. Both stay in the repository for years, so the name by which a Rule and an Exception know a Library is hard to change once written. A Library has two names. One is the name a Manifest declares: `PyYAML`, `org.slf4j:slf4j-api`. The other is the name the code imports: `yaml`, `org.slf4j`. Structure joins the two in the Library inventory, partly by heuristics ([structure-format.md](../structure-format.md), section 3).

So a Rule of the kind `library` names Libraries by the name the code imports them by: an npm package, a Java package, a Python top-level package, a Go module. It names them with Library patterns over the segments of that name, where `/` separates, and `.` as well except in an npm name, whose dots are part of it (`@codemirror/*`, `org.apache.**`, `lodash*` for `lodash.get`). It says which Components may use them, `only-in`, or must not, `not-in` ([conformance-format.md](../conformance-format.md), section 2). A Violation is one Component and one Library. Its fingerprint is `{kind: library, rule, component, library}`, with the Library by its import name. Behind it is every use by that Component's files, each with the lines of its imports.

## Considered Options

- **The name the Manifest declares.** This is closer to the build, and the name a licence belongs to. But a use that no Manifest declares would escape the Rule: a hoisted npm package, or a transitive Java artefact on the classpath. A Rule should catch exactly those. Without a classpath, Java can tie a package to its artefact only by a guess at its group. The mapping of a Python distribution changes when a virtual environment is created. A Rule would then mean something else from one run to the next, with nothing in the file changed.
- **Either name**, a pattern matched against both. It is convenient to write. But `*` would then reach into two vocabularies, and the name in a Violation would depend on which one matched. A key for the declared name can be added later beside `library` without changing what `library` means. Removing a double meaning later would break every Rule that relies on it.
- **A `library` key on `must-not-depend` and `may-only-depend`.** It needs one kind fewer. But the use of a Library is not a Dependency, and its Violation has no target Component. An explicit kind of its own says so, as [ADR-0017](0017-rules-and-exceptions-share-one-file-keyed-by-fingerprint.md) gives every Rule.
- **The Library pattern in the fingerprint**, one Violation per Rule and Component. It is shorter. But an Exception for `pg` would then accept `mysql2` too, as soon as a file imports it under `[pg, 'mysql*']`. The Exception would accept more than Aylin read.
- **The file, or the line of the import, in the fingerprint.** This was refused for Dependencies in ADR-0017, for the same reason: a line added above the import must not fail a pull request. A second file that imports the Library is the same Violation, with one more use behind it.

## Consequences

- The person who writes a Rule writes the import name. The window shows it beside the declared name, under "Imported as", and `list_libraries` in its `imports`. A Python Rule names `yaml`, not `PyYAML`.
- A pattern without a wildcard names one Library, matched exactly; in Java and Python it names the packages below it as well, since a package there holds packages: `org.slf4j` is `org.slf4j.event` too, and the window says so under "Imported as". Patterns are matched without regular expressions, in time no more than the product of the lengths of the pattern and the name. A Rule from a pull request cannot make `adr check` hang.
- Rename rewrites the Components of `only-in` and `not-in`, and the `component` of an Exception. It never rewrites a Library pattern or a Library's name: the suite does not rename Libraries. Suppose an upstream Library changes its name, an npm package moving to a scope or a Java package moving. Its Rules are then edited by hand. Its Exceptions match nothing any more, and say so as a Problem.
- With `only-in`, an Unassigned file that uses the Library breaks the Rule, as it breaks `may-only-depend`: what no Component claims cannot have been allowed. With `not-in` it never does.
- `adr check` annotates a Violation at every import behind it, and its JSON carries them as `uses`. The person who wrote the import reads the Rule's reason at that line.
- A declared Library that the code never imports, such as a linter or a build plugin, cannot break such a Rule. That is a question for the inventory, which lists it as declared and not used.
