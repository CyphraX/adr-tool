// Package web serves the shop.
package web

import (
	"fmt"
	"net/http"

	inv "example.com/shop/billing/invoice"
	"example.com/shop/cart"
	// The payments were never added to the repository; this import is left behind on purpose.
	"example.com/shop/payments"
)

// Checkout bills a cart and takes the payment.
func Checkout(w http.ResponseWriter, c *cart.Cart) {
	invoice := inv.For(c)
	payments.Charge(invoice.Total)
	fmt.Fprintf(w, "%d\n", invoice.Total)
}
