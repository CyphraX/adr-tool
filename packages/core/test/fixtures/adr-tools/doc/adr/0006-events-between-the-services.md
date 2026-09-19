# 6. Events between the services

Date: 2018-01-15

## Status

Accepted

Supersedes [4. Queue between the services](./0004-queue-between-the-services.md)

## Context

The queue never came.

## Decision

The services publish events.

## Consequences

Consumers must be idempotent.
