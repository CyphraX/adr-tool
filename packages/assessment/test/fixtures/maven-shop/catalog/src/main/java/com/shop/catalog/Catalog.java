package com.shop.catalog;

/** What the shop asks of its catalog: the module's one abstraction. */
public interface Catalog {
  java.util.Optional<Product> find(String sku);
}
