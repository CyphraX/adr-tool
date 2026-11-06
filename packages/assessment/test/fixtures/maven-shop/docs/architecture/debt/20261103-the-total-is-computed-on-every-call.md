---
state: scheduled
date: 2026-11-03
changed: 2026-11-03
owner: Aylin Demir
components: [cart]
---

# The total is computed on every call

`Cart.total()` sums every line each time it is asked. The rewrite of the checkout keeps the
total with the lines.
