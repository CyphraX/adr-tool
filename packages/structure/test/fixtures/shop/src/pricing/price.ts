import { find } from '../catalog/search'

/** What the price needs to know of a cart, and nothing more: no Dependency on the cart. */
export const priceOf = (cart: { readonly lines: readonly { readonly sku: string }[] }): number =>
  cart.lines.reduce((sum, line) => sum + (find(line.sku)?.cents ?? 0), 0)
