---
status: proposed
created: 2026-02-02
decision-makers: [Sam Lee]
tags: [persistence, reporting]
depends-on: [0004-postgres-for-the-write-model, 0011-reporting-api]
---

# A read replica for reports

Month-end reports hold long transactions on the primary and slow down ordering. Reports move to a streaming read replica.

## Open questions

- [ ] How stale may a report be? Finance says minutes are fine; we should write that down.
- [x] Does the managed instance support replicas in our region? It does.
