---
date: 2026-11-03
status: draft
authors: [Aylin Demir, Lena Becker]
scope: [cart, catalog, web]
nav_order: 1
---

# The shop before the checkout rewrite

Two weeks on the three Maven modules of the shop, before the checkout is rewritten. We asked
what the rewrite must not break, and how well the shop as it stands would take it.

## Quality Scenarios

### The total of a large cart shows at once

```yaml
scenario: S1
attribute: performance-efficiency/time-behaviour
source: A customer
stimulus: adds a product to a cart of 200 lines
artifact: cart
environment: normal operation, at the Christmas peak
response: the cart shows its new total
measure: within 100 ms
importance: H
difficulty: M
rating: partly-met
```

The total is computed on every call, over every line. At 200 lines that is still fast enough;
at the peak it is not known.

### The catalog changes how it searches

```yaml
scenario: S2
attribute: maintainability/modifiability
source: The team of the catalog
stimulus: changes how Search finds a product
artifact: catalog
environment: development
response: the change is made in the catalog alone
measure: no file outside catalog/ changes
importance: H
difficulty: L
rating: not-met
```

The page uses `Search` itself, so a change to it reaches the web.

### A new kind of page

```yaml
scenario: S3
attribute: maintainability/modularity
source: A developer
stimulus: adds a page that lists the products of a cart
artifact: web
environment: development
response: the page is written in the web alone
measure: within a day, no change to cart/ or catalog/
importance: M
difficulty: L
rating: met
```

### The page is tested on its own

```yaml
scenario: S4
attribute: maintainability/testability
source: A developer
stimulus: writes a test for Page
artifact: web
environment: development
response: the test needs a cart, and nothing of the catalog
measure: the test compiles against web and cart alone
importance: M
difficulty: M
rating: partly-met
```

`PageTest` passes `null` for the `Search` it would otherwise need.

### The catalog cannot be reached

```yaml
scenario: S5
attribute: reliability/fault-tolerance
source: The catalog's database
stimulus: does not answer
artifact: cart
environment: normal operation
response: the cart still shows what is in it, with the prices it had
measure: no error page; the total is shown
importance: L
difficulty: H
```

Not rated: the shop has no database yet that could fail.

### A price is not changed by the web

```yaml
scenario: S6
attribute: security/integrity
source: A page of the web
stimulus: tries to change the price of a line
artifact: cart
environment: normal operation
response: the price stays as the catalog gave it
measure: no code of web writes a price
importance: H
difficulty: L
rating: met
```

`Product` is a record, and `Line` keeps it as it is.

## Findings

### The web reaches into the catalog past the cart

```yaml
finding: F1
scenarios: [S2, S4]
evidence:
  - violation: web-through-cart
    from: web
    to: catalog
  - annotation: 20261102-the-page-searches-the-catalog-itself
  - adr: 0001-the-web-shows-the-catalog-through-the-cart
  - risk: 20261103-a-change-to-the-search-breaks-the-page
```

`Page` searches the catalog itself, against ADR-0001. It is the one Dependency that makes S2
fail, and the reason `PageTest` passes `null`.

### The cart stands between the web and the catalog

```yaml
finding: F2
scenarios: [S3, S6]
evidence:
  - metric: instability
    component: cart
  - metric: fan-in
    component: catalog
```

The cart is as stable as it is unstable: half of what touches it comes in. The catalog is used
by both others, and uses nothing: it is the most stable of the three, as it should be.

### Two classes Util in one package

```yaml
finding: F3
scenarios: [S3]
evidence:
  - debt: 20261103-two-classes-util-in-one-package
  - risk: 20261103-the-two-utils-get-mixed-up
  - metric: files
    component: web
```

`cart` and `web` each have a `com.shop.web.Util`. Nothing tells the two apart.

### The total is computed on every call

```yaml
finding: F4
scenarios: [S1]
evidence:
  - debt: 20261103-the-total-is-computed-on-every-call
  - risk: 20261103-a-large-cart-is-slow-at-the-peak
  - metric: complexity
    file: cart/src/main/java/com/shop/cart/Cart.java
    name: Cart.total()
```

Fast enough today, and as simple as a function gets: one way through it. Kept as a debt until
the rewrite keeps the total with the lines.
