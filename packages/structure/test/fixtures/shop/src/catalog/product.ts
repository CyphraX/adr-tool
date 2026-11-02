export interface Product {
  readonly sku: string
  readonly name: string
  readonly cents: number
}

export const products: readonly Product[] = [{ sku: 'p1', name: 'Pen', cents: 150 }]
