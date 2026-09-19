---
status: accepted
created: 2025-05-05
decided: 2025-05-12
decision-makers: [Kim Becker, Alex Roth]
tags: [persistence]
supersedes: [0002-sqlite-for-everything]
depends-on: [0001-modular-monolith]
corrections:
  - date: 2025-06-02
    author: Alex Roth
    note: Spelling
---

# Postgres for the write model

The second customer brings concurrent writers, and SQLite serializes them. The write model moves to Postgres; each module keeps its own schema, as [the modular monolith](0001-modular-monolith.md) demands.

| | SQLite | Postgres |
| --- | --- | --- |
| Concurrent writers | one | many |
| Operations | none | a managed instance |
| Backups | copy a file | point-in-time recovery |

## Consequences

- Local development needs a container. `docker compose up db` is part of the setup now.
- Reports still read from the write model. That is the next thing to give.

See the [Postgres documentation on schemas](https://www.postgresql.org/docs/current/ddl-schemas.html).
