from __future__ import annotations

from shop.catalog import Product
from shop.pricing import rules

from .line import Line


class Cart:
    def __init__(self) -> None:
        self.lines: list[Line] = []

    def add(self, product: Product, quantity: int = 1) -> None:
        self.lines.append(Line(product, quantity, self))

    def total(self) -> int:
        return sum(rules.price(line) for line in self.lines)
