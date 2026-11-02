---
status: accepted
decision-makers: Alex Roth
supersedes: [0001-sqlite-for-the-catalogue]
---

# Postgres for the catalogue

* Date: 2021-01-20

## Context and Problem Statement

The catalogue outgrew one file; two services write to it now.

## Decision Outcome

Chosen option: "Postgres", because it is what the other services use.
