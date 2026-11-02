import { total, type Cart } from '../cart/cart'

/** Ten percent off above twenty: the pricing asks the cart for its total, and closes a Cycle. */
export const discountOf = (cart: Cart): number => (cart.lines.length > 20 ? total(cart) / 10 : 0)
