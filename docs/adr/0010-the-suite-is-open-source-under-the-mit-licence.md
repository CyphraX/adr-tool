---
status: accepted
created: 2026-11-02
decided: 2026-11-02
decision-makers: [Philipp Saal]
tags: [licence, release]
---

# The suite is open source under the MIT licence

The roadmap kept licence and business model open until the first public release, and the app local-only until then: no backend, no accounts, no telemetry. The author has decided: the code is published under the MIT licence. There is no business model in the code. Whatever is offered for money later — support, training, an installer that is signed and kept up to date — sits beside the code, never in front of a feature of it.

## Considered Options

- **Apache-2.0.** Permissive as well, with an explicit patent grant and a notice file to keep. For a desktop tool of one author, with no patents in play, the grant buys little and the conditions are longer for everyone who reuses a part of it.
- **A copyleft licence (GPL, AGPL).** Keeps every derived tool open. It also keeps the suite out of the companies whose legal departments do not let copyleft code near their own, and those are the teams the suite wants to reach through git and CI. The AGPL's network clause has nothing to bite on in an app without a server.
- **Proprietary, sold by licence.** A business model in the code. It contradicts what the suite stands for — files in the repository are the truth, readable without the app, operable by any agent — and it would need the licence checks, the accounts and the network that principle 1 of [vision.md](../vision.md) rules out.

## Consequences

- `LICENSE` holds the MIT text, and every package says `MIT`.
- Every dependency the app ships has to be compatible with it. The ones used today are MIT, ISC or Apache-2.0; their notices go into the installers with distribution.
- Code that comes in from elsewhere comes in under the same licence, or under one that is compatible with it.
