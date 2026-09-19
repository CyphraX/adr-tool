---
status: accepted
created: 2025-09-01
decided: 2025-09-08
decision-makers: [Alex Roth, Sam Lee]
tags: [architecture, operations]
amends: [0001-modular-monolith]
---

# Extract notifications into their own service

E-mail and push delivery has a different rhythm from the rest: bursts, retries, third-party outages. It leaves the monolith and becomes a service behind a queue. Everything else stays where it is.

This amends the modular monolith rather than replacing it: one module proved to have a different operational profile, the others did not.

## Consequences

- A queue joins the infrastructure.
- The module boundary we enforced made the extraction a two-week job.
