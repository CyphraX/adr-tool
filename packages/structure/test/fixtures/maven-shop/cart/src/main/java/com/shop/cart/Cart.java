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

  /** A percentage off each line above ten euros: the fixture's one function that decides much. */
  public long discount(long percent) {
    if (percent <= 0 || lines.isEmpty()) {
      return 0;
    }
    long cents = 0;
    for (Line line : lines) {
      cents += line.cents() > 1000 ? line.cents() * percent / 100 : 0;
    }
    return cents;
  }
}
