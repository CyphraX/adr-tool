import { find } from '../catalog/search'
import { priceOf } from '../pricing/price'
import { discountOf } from '../pricing/discount'
import { lineOf, type Line } from './line'

export interface Cart {
  readonly lines: readonly Line[]
}

export const add = (cart: Cart, sku: string): Cart =>
  find(sku) ? { lines: [...cart.lines, lineOf(sku)] } : cart

export const total = (cart: Cart): number => priceOf(cart) - discountOf(cart)
