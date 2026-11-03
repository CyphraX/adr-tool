from __future__ import annotations

from typing import TYPE_CHECKING

from shop.catalog.product import Product

if TYPE_CHECKING:
    # For the type checker only: at run time the cart imports its lines, not the other way.
    from .cart import Cart


class Line:
    def __init__(self, product: Product, quantity: int, cart: Cart) -> None:
        self.product = product
        self.quantity = quantity
        self.cart = cart
