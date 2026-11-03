// Package catalog holds the products of the shop.
package catalog

import "strings"

// Product is something the shop sells.
type Product struct {
	SKU   string
	Name  string
	Price int
}

// Normalize makes names comparable.
func Normalize(name string) string {
	return strings.ToLower(strings.TrimSpace(name))
}
