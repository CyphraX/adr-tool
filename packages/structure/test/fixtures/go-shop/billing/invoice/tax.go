package invoice

// Rate is the tax rate, in percent.
const Rate = 19

func withTax(net int) int {
	return net + net*Rate/100
}
