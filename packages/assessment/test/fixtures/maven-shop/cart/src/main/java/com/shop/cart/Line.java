package com.shop.cart;

import com.shop.catalog.Product;

/** A line knows its cart, and the cart its lines: a Cycle between two files. */
public record Line(Cart cart, Product product) {
  long cents() {
    return product.cents();
  }
}
