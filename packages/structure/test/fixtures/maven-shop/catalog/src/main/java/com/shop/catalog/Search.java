package com.shop.catalog;

import java.util.List;
import java.util.Optional;

public final class Search {
  private final List<Product> products;

  public Search(List<Product> products) {
    this.products = products;
  }

  public Optional<Product> find(String sku) {
    return products.stream().filter(product -> product.sku().equals(sku)).findFirst();
  }
}
