---
status: proposed
created: 2026-09-20
decision-makers: [Philipp Saal]
tags: [structure, security]
relates-to: [0006-one-core-package-per-module-on-a-shared-kernel]
---

# The analysis never executes anything from the analysed repository

Structure reads other people's code: a repository is opened to see what it is made of, often before anyone has reason to trust it. So the analysis never runs anything the repository brings along — no build tool (`mvn`, `gradle`, a script of `package.json`), no compiler plugin, no configuration that is written as code, no rule script. Build and configuration files are read as text: `pom.xml` for its `<module>` entries, `settings.gradle` for the string literals of its `include` calls, `tsconfig.json` as JSON. Opening a repository is then as safe as opening a text file, and it works on a fresh clone in which nothing is installed.

## Considered Options

- **Ask the build tool.** Maven and Gradle can hand out the resolved classpath, and with it exact Java Dependencies, also on members and through inheritance. But a build runs the plugins and scripts of the repository with the user's rights, needs the right JDK and the network, and takes minutes where reading takes milliseconds.
- **Load the repository's own tool configuration**, the `plugins` of a `tsconfig.json` or a `vite.config.ts` for its aliases. That is executing code under a friendlier name. What `tsconfig.json` says in `paths` covers most aliases without it.
- **Run builds in a sandbox.** It would buy the precision back safely, but a desktop app for three platforms cannot assume a container runtime, and the sandboxes of the operating systems differ too much to build on. It can be added later as something a person switches on, without touching the default.

## Consequences

- Java metrics are a lower bound. Without a classpath the analysis does not see reflection, fully qualified names inside code, or members inherited from a type a file does not name ([structure-format.md](../structure-format.md), section 3). The app says so wherever a Java metric is shown.
- The Draft finds the projects a `settings.gradle` names with string literals. Projects that are computed, or moved with `projectDir`, are declared by hand.
- An alias that lives only in the configuration of a bundler is not resolved. What is not resolved is counted and shown, never guessed.
- The Rules of the Conformance module are declarative for the same reason; rules written as code stay out.
- Assessing a repository that belongs to someone else — the consultant's case of the vision — becomes possible at all.
- What is read is still untrusted input. It is parsed, never trusted: no file of a repository decides where the suite reads or writes outside of that repository.
