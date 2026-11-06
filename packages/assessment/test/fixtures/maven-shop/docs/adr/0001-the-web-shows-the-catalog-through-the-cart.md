---
status: accepted
created: 2026-05-12
decided: 2026-05-12
decision-makers: [Aylin Demir]
affects: [web, cart, catalog]
---

# The web shows the catalog through the cart

## Context and Problem Statement

The page shows what is in the cart, and the products in it. Where should it get them from?

## Considered Options

- The page asks the cart, which knows its products
- The page searches the catalog itself

## Decision Outcome

Chosen option: "The page asks the cart, which knows its products", because then the web has one
thing to know, and the catalog may change how it searches.
