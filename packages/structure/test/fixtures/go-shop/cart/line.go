package cart

import (
	"example.com/shop/catalog"
	"github.com/google/uuid"
)

// Line is one product in a cart, so many times.
type Line struct {
	ID       string
	Product  catalog.Product
	Quantity int
}

// NewLine makes a line with an ID of its own.
func NewLine(product catalog.Product, quantity int) Line {
	return Line{ID: uuid.NewString(), Product: product, Quantity: quantity}
}

// In says whether the line is one of a cart's.
func (l Line) In(c *Cart) bool {
	for _, other := range c.Lines {
		if other.ID == l.ID {
			return true
		}
	}
	return false
}
