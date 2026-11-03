import pytest

from shop.cart.cart import Cart
from shop.catalog.product import Product


@pytest.fixture
def cart() -> Cart:
    return Cart()


def test_total(cart: Cart) -> None:
    cart.add(Product("p1", "Pen", 200), 2)
    assert cart.total() == 400
