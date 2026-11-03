// Package cart holds what a customer is about to buy.
package cart

import "example.com/shop/catalog"

// Cart is a list of lines.
type Cart struct {
	Lines []Line
}

// New makes an empty cart.
func New() *Cart {
	return &Cart{}
}

// Add puts a product into the cart.
func (c *Cart) Add(product catalog.Product, quantity int) {
	c.Lines = append(c.Lines, NewLine(product, quantity))
}

// Total is what the cart costs.
func (c *Cart) Total() int {
	total := 0
	for _, line := range c.Lines {
		total += line.Product.Price * line.Quantity
	}
	return total
}
