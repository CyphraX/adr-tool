import { describe, expect, it } from 'vitest'
import { levelOf, type Level } from '../src/levels'
import { analysed, shop } from './shop'

async function levels(repository: Record<string, string>) {
  const { structure, dependencies } = await analysed(repository)
  return (parent?: string, tests = false) => levelOf(structure, dependencies, parent, { tests })
}

const edges = (level: Level | undefined) =>
  level!.edges.map(
    (edge) => `${edge.from} > ${edge.to} ${edge.weight}${edge.typeOnly ? ' (type)' : ''}`
  )

describe('the levels of the hierarchy (docs/structure-format.md, section 4)', () => {
  it('show the top-level Components, and the Unassigned files as one node', async () => {
    const level = (await levels(shop))()!
    expect(level.nodes.map((node) => [node.kind, node.id, node.files.length])).toEqual([
      ['component', 'shop', 5],
      ['component', 'billing', 3],
      ['component', 'shared', 1],
      ['unassigned', '(unassigned)', 1]
    ])
  })

  it('weigh a Dependency between nodes by the pairs of Source Files behind it', async () => {
    const level = (await levels(shop))()!
    expect(edges(level)).toEqual([
      '(unassigned) > shop 1',
      'billing > shared 1',
      'billing > shop 1 (type)',
      'shop > billing 2',
      'shop > shared 1 (type)'
    ])
    const behind = level.edges.find((edge) => edge.from === 'shop' && edge.to === 'billing')!
    expect(behind.dependencies.map((dependency) => [dependency.from, dependency.to])).toEqual([
      ['src/shop/cart/cart.ts', 'src/billing/invoice.ts'],
      ['src/shop/pricing/price.ts', 'src/billing/invoice.ts']
    ])
  })

  it('find the Cycles among the nodes, with the weakest Dependency, never with (unassigned)', async () => {
    const level = (await levels(shop))()!
    expect(level.cycles).toEqual([
      {
        members: ['billing', 'shop'],
        roundTrip: ['billing', 'shop'],
        weakest: { from: 'billing', to: 'shop' },
        typeOnly: false
      }
    ])
  })

  it('leave test files out by default, and include them on request', async () => {
    const level = await levels(shop)
    expect(level()!.nodes.find((node) => node.id === 'shared')!.files).toEqual([
      'src/shared/money.ts'
    ])
    const withTests = level(undefined, true)!
    expect(edges(withTests)).toContain('shared > shop 1')
    expect(withTests.cycles.map((cycle) => cycle.members)).toEqual([['billing', 'shared', 'shop']])
  })

  it('show the children of a Component, with its own files beside them', async () => {
    const level = (await levels(shop))('shop')!
    expect(level.nodes.map((node) => [node.kind, node.id])).toEqual([
      ['own-files', 'shop'],
      ['component', 'shop/cart'],
      ['component', 'shop/pricing']
    ])
    expect(edges(level)).toEqual([
      'shop > shop/cart 1',
      'shop/cart > shop/pricing 1',
      'shop/pricing > shop/cart 2'
    ])
    expect(level.cycles).toEqual([
      {
        members: ['shop/cart', 'shop/pricing'],
        roundTrip: ['shop/cart', 'shop/pricing'],
        weakest: { from: 'shop/cart', to: 'shop/pricing' },
        typeOnly: false
      }
    ])
  })

  it('show the Source Files of a Component without children, and their Cycles without a weakest', async () => {
    const level = (await levels(shop))('billing')!
    expect(level.nodes.map((node) => [node.kind, node.id])).toEqual([
      ['source-file', 'src/billing/a.ts'],
      ['source-file', 'src/billing/b.ts'],
      ['source-file', 'src/billing/invoice.ts']
    ])
    expect(level.cycles).toEqual([
      {
        members: ['src/billing/a.ts', 'src/billing/b.ts'],
        roundTrip: ['src/billing/a.ts', 'src/billing/b.ts'],
        typeOnly: false
      }
    ])
  })

  it('have no level below an ID that no Component has', async () => {
    expect((await levels(shop))('gone')).toBeUndefined()
  })

  it('mark a Cycle that exists for the compiler only', async () => {
    const level = (
      await levels({
        'src/a/x.ts': "import type { Y } from '../b/y'\n",
        'src/b/y.ts': "import type { X } from '../a/x'\n"
      })
    )()!
    // The Draft: one Component per directory under src.
    expect(level.cycles).toEqual([
      {
        members: ['a', 'b'],
        roundTrip: ['a', 'b'],
        weakest: { from: 'a', to: 'b' },
        typeOnly: true
      }
    ])
  })
})
