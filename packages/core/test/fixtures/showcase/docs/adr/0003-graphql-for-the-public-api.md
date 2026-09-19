---
status: rejected
created: 2025-02-03
decided: 2025-02-17
decision-makers: [Kim Becker, Alex Roth, Sam Lee]
tags: [api]
---

# GraphQL for the public API

Proposed because partners keep asking for slightly different shapes of the same order data.

We decided against it. Our partners integrate with generated REST clients, none of them runs a GraphQL stack, and the flexible queries would make the rate limits we owe them hard to state. We stay with REST and add sparse fieldsets where a partner needs a smaller payload.

## Considered Options

- **GraphQL.** One endpoint, client-defined shapes; but new tooling for every partner and a harder story for caching and limits.
- **REST with sparse fieldsets.** Less elegant, and it meets every request we have actually received.
