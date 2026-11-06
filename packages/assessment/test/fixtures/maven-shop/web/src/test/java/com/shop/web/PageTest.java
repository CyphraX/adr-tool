package com.shop.web;

import static org.junit.jupiter.api.Assertions.assertNotNull;

import com.shop.cart.Cart;
import org.junit.jupiter.api.Test;

class PageTest {
  @Test
  void showsACart() {
    assertNotNull(new Page(null).show(new Cart()));
  }
}
