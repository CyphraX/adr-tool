package catalog

// Search finds the products whose name is the one asked for.
func Search(products []Product, name string) []Product {
	var found []Product
	for _, product := range products {
		if Normalize(product.Name) == Normalize(name) {
			found = append(found, product)
		}
	}
	return found
}
