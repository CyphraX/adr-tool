import { add, type Cart } from './cart'

export interface Line {
  readonly sku: string
}

export const lineOf = (sku: string): Line => ({ sku })

export const again = (cart: Cart, line: Line): Cart => add(cart, line.sku)
