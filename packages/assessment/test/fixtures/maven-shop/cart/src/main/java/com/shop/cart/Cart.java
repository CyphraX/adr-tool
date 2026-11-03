package com.shop.cart;

import com.shop.catalog.Product;
import java.util.ArrayList;
import java.util.List;

public final class Cart {
  private final List<Line> lines = new ArrayList<>();

  public void add(Product product) {
    lines.add(new Line(this, product));
  }

  public long total() {
    return lines.stream().mapToLong(Line::cents).sum();
  }
}
