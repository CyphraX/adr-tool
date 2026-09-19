---
status: accepted
created: 2025-01-13
decided: 2025-01-20
decision-makers: [Kim Becker, Alex Roth]
tags: [architecture]
amended-by: [0005-extract-notification-service]
---

# Start as a modular monolith

We are four developers and the domain is still moving. We build one deployable with strict module boundaries — Ordering, Billing, Catalog — instead of separate services. A module may only call another through its public interface; the build fails on a shortcut.

## Considered Options

- **Microservices from day one.** Independent deployment, but we would pay for distributed transactions and an operations setup before we know where the boundaries are.
- **A plain layered monolith.** Fastest to start, and the hardest to take apart later.

## Consequences

- Extracting a module later stays possible, because the boundaries are already enforced.
- One database for now. Modules own their tables and never read each other's.
