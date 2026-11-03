package cart

import (
	"testing"

	"example.com/shop/catalog"
)

func TestTotal(t *testing.T) {
	c := New()
	c.Add(catalog.Product{SKU: "p1", Name: "Pen", Price: 200}, 2)
	if c.Total() != 400 {
		t.Fatalf("total is %d", c.Total())
	}
}
