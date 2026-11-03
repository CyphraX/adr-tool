package main

import (
	"log"
	"net/http"

	"example.com/shop/cart"
	"example.com/shop/web"
)

func main() {
	http.HandleFunc("/checkout", func(w http.ResponseWriter, r *http.Request) {
		web.Checkout(w, cart.New())
	})
	log.Fatal(http.ListenAndServe(":8080", nil))
}
