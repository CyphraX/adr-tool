package com.shop.web;

import com.shop.cart.*;
import com.shop.catalog.Search;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class Page {
  private static final Logger LOG = LoggerFactory.getLogger(Page.class);
  private final Search search;

  public Page(Search search) {
    this.search = search;
  }

  public String show(Cart cart) {
    LOG.info("showing {}", Util.class);
    return new CartView(cart).render();
  }
}
