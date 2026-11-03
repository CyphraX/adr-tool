module example.com/shop

go 1.22

require (
	example.com/shop/billing v0.0.0
	github.com/google/uuid v1.6.0
	golang.org/x/text v0.21.0 // indirect
)

// The billing module lies in this repository.
replace example.com/shop/billing => ./billing
