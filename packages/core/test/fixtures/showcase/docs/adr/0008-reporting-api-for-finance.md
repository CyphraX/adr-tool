---
status: proposed
created: 2026-03-16
decision-makers: [Sam Lee, Kim Becker]
tags: [reporting, api]
supersedes: [0006-nightly-csv-export]
amends: [0004-postgres-for-the-write-model]
---

# A reporting API for finance

Finance pulls invoices and payments from a read-only reporting API whenever they need them, instead of waiting for a nightly file. This replaces the CSV export for good.

It also changes one consequence of the Postgres decision: reports no longer read from the write model. They get their own read-only role and, once the replica exists, their own connection.

## Consequences

- One more public surface to version and to keep stable.
- The shared drive drops out of the data flow.
