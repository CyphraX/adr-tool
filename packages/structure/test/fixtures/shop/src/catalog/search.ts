import { products, type Product } from './product'

export const find = (sku: string): Product | undefined =>
  products.find((product) => product.sku === sku)
