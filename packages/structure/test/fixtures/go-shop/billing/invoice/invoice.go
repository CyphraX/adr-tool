// Package invoice bills carts.
package invoice

import "example.com/shop/cart"

// Invoice is what a customer is asked to pay.
type Invoice struct {
	Total int
}

// For bills a cart, with tax.
func For(c *cart.Cart) Invoice {
	return Invoice{Total: withTax(c.Total())}
}
