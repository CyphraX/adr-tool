import json

import requests

from shop.catalog.product import Product


def search(url: str, query: str) -> list[Product]:
    answer = requests.get(url, params={"q": query}, timeout=5)
    return [Product(**item) for item in json.loads(answer.text)]
