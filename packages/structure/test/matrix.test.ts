import { describe, expect, it } from 'vitest'
import { matrixOf, orderOf, type Matrix } from '../src/matrix'
import { analysed, shop } from './shop'

const edge = (from: string, to: string, weight = 1) => ({ from, to, weight, typeOnly: false })

/** The cells that lie above the diagonal, as `row > column weight`. */
function aboveDiagonal(matrix: Matrix): string[] {
  const index = new Map(matrix.rows.map((row, position) => [row.node.id, position]))
  return matrix.cells
    .filter((cell) => index.get(cell.from)! < index.get(cell.to)!)
    .map((cell) => `${cell.from} > ${cell.to} ${cell.weight}`)
}

describe('the order of the rows (docs/structure-format.md, section 5)', () => {
  it('puts what a row depends on before it', () => {
    expect(orderOf(['c', 'b', 'a'], [edge('c', 'b'), edge('b', 'a')])).toEqual(['a', 'b', 'c'])
  })

  it('keeps the order of the level among rows that could come next', () => {
    expect(orderOf(['x', 'y', 'z'], [])).toEqual(['x', 'y', 'z'])
    expect(orderOf(['x', 'y', 'z'], [edge('x', 'z')])).toEqual(['y', 'z', 'x'])
  })

  it('keeps the members of a Cycle together, and puts the lighter Dependency of two above the diagonal', () => {
    // a and b form a Cycle, c depends on it, d on nothing.
    expect(
      orderOf(['a', 'b', 'c', 'd'], [edge('a', 'b', 2), edge('b', 'a', 1), edge('c', 'a')])
    ).toEqual(['b', 'a', 'c', 'd'])
    // Weighing the same, the order of the level decides.
    expect(orderOf(['a', 'b'], [edge('a', 'b'), edge('b', 'a')])).toEqual(['a', 'b'])
  })

  it('places the members of a larger Cycle so that little lies above the diagonal', () => {
    // a → b → c → a, with a heavy b → c and a light c → a: only c → a should lie above.
    const order = orderOf(
      ['a', 'b', 'c'],
      [edge('a', 'b', 3), edge('b', 'c', 5), edge('c', 'a', 1)]
    )
    expect(order).toEqual(['c', 'b', 'a'])
    // Once a member is placed, a member that depends on nothing still to be placed comes next.
    expect(
      orderOf(['a', 'b', 'c'], [edge('a', 'b'), edge('b', 'a'), edge('c', 'a'), edge('a', 'c')])
    ).toEqual(['a', 'b', 'c'])
  })
})

describe('the dependency structure matrix (docs/structure-format.md, section 5)', () => {
  it('lists the nodes of a level so that only what closes a Cycle lies above the diagonal', async () => {
    const { structure, dependencies } = await analysed(shop)
    const matrix = matrixOf(structure, dependencies)!
    // shared depends on nothing; billing and shop form a Cycle; (unassigned) uses shop.
    expect(matrix.rows.map((row) => row.node.id)).toEqual([
      'shared',
      'billing',
      'shop',
      '(unassigned)'
    ])
    // The weakest Dependency of the Cycle, as the graph names it.
    expect(aboveDiagonal(matrix)).toEqual(['billing > shop 1'])
    expect(matrix.cycles).toEqual([{ first: 1, last: 2, typeOnly: false }])
    expect(matrix.rows.map((row) => [row.depth, row.expandable])).toEqual([
      [0, true],
      [0, true],
      [0, true],
      [0, false]
    ])
  })

  it('holds in a cell the Dependencies from its row to its column, never on the diagonal', async () => {
    const { structure, dependencies } = await analysed(shop)
    const matrix = matrixOf(structure, dependencies, 'billing')!
    expect(matrix.cells.map((cell) => `${cell.from} > ${cell.to} ${cell.weight}`)).toEqual([
      'src/billing/a.ts > src/billing/b.ts 1',
      'src/billing/b.ts > src/billing/a.ts 1'
    ])
    expect(matrixOf(structure, dependencies, 'gone')).toBeUndefined()
  })

  it('expands a Component into the rows of the level below it, where it stood', async () => {
    const { structure, dependencies } = await analysed(shop)
    const matrix = matrixOf(structure, dependencies, undefined, ['shop', 'shop/cart'])!
    expect(matrix.rows.map((row) => [row.node.kind, row.node.id, row.depth])).toEqual([
      ['component', 'shared', 0],
      ['component', 'billing', 0],
      ['source-file', 'src/shop/cart/cart.ts', 2],
      ['source-file', 'src/shop/cart/line.ts', 2],
      ['component', 'shop/pricing', 1],
      ['own-files', 'shop', 1],
      ['unassigned', '(unassigned)', 0]
    ])
    // The outer before the inner.
    expect(matrix.groups).toEqual([
      { id: 'shop', depth: 0, first: 2, last: 5 },
      { id: 'shop/cart', depth: 1, first: 2, last: 3 }
    ])
    // Rows of different levels meet in their cells; above the diagonal, a Cycle at each level.
    expect(aboveDiagonal(matrix)).toEqual([
      'billing > src/shop/cart/cart.ts 1',
      'src/shop/cart/cart.ts > shop/pricing 1'
    ])
    expect(matrix.cycles).toEqual([
      { first: 1, last: 5, typeOnly: false },
      { first: 2, last: 4, typeOnly: false }
    ])
  })

  it('leaves test files out by default, as the graph does', async () => {
    const { structure, dependencies } = await analysed(shop)
    const files = (tests: boolean) =>
      matrixOf(structure, dependencies, 'shared', [], { tests })!.rows.map((row) => row.node.id)
    expect(files(false)).toEqual(['src/shared/money.ts'])
    expect(files(true)).toEqual(['src/shared/money.ts', 'src/shared/money.test.ts'])
  })
})
