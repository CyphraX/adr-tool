---
status: superseded
created: 2025-01-15
decided: 2025-01-20
decision-makers: [Kim Becker]
tags: [persistence]
superseded-by: [0004-postgres-for-the-write-model]
---

# SQLite for everything

One file, no server, trivial backups. For the first release a single SQLite database holds all modules' tables.

## Consequences

- Writes are serialized. Fine for the pilot customer, a known limit beyond that.
