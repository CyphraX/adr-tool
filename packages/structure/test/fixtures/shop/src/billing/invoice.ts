import { total, type Cart } from '../cart/cart'
import type { Product } from '../catalog/product'

export interface Invoice {
  readonly cents: number
  readonly products: readonly Product[]
}

export const invoiceOf = (cart: Cart): Invoice => ({ cents: total(cart), products: [] })
