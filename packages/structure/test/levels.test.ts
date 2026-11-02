import { describe, expect, it } from 'vitest'
import { memoryFileSystem } from '@adr-tool/kernel'
import { analyseDependencies } from '../src/dependencies'
import { levelOf, type Level } from '../src/levels'
import { openStructure } from '../src/structure'

/** A shop with a Cycle at every level: between Components, between children, between files. */
const shop: Record<string, string> = {
  '.arch/components.yml': [
    'components:',
    '  shop:',
    '    paths: [src/shop/**]',
    '    components:',
    '      cart: { paths: [src/shop/cart/**] }',
    '      pricing: { paths: [src/shop/pricing/**] }',
    '  billing:',
    '    paths: [src/billing/**]',
    '  shared:',
    '    paths: [src/shared/**]',
    ''
  ].join('\n'),
  'src/shop/index.ts': "export * from './cart/cart'\n",
  'src/shop/cart/cart.ts': [
    "import { price } from '../pricing/price'",
    "import { invoice } from '../../billing/invoice'",
    ''
  ].join('\n'),
  'src/shop/cart/line.ts': "import type { Money } from '../../shared/money'\n",
  'src/shop/pricing/price.ts': [
    "import { Cart } from '../cart/cart'",
    "import { invoice } from '../../billing/invoice'",
    ''
  ].join('\n'),
  'src/shop/pricing/discount.ts': "import { line } from '../cart/line'\n",
  'src/billing/invoice.ts': [
    "import type { Cart } from '../shop/cart/cart'",
    "import { money } from '../shared/money'",
    ''
  ].join('\n'),
  'src/billing/a.ts': "import { b } from './b'\n",
  'src/billing/b.ts': "import { a } from './a'\n",
  'src/shared/money.ts': '',
  'src/shared/money.test.ts': [
    "import { money } from './money'",
    "import { cart } from '../shop/cart/cart'",
    ''
  ].join('\n'),
  'scripts/seed.ts': "import '../src/shop/index'\n"
}

async function levels(repository: Record<string, string>) {
  const fs = memoryFileSystem(repository)
  const files = Object.keys(repository)
  const structure = await openStructure(fs, files)
  const { dependencies } = await analyseDependencies(fs, files, structure.sourceFiles)
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
