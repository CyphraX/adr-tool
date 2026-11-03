package com.shop.cart;

/** In the package of the cart, but in the module web: it uses Cart without an import. */
public final class CartView {
  private final Cart cart;

  public CartView(Cart cart) {
    this.cart = cart;
  }

  public String render() {
    return "Total: " + cart.total();
  }
}
