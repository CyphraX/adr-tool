import { describe, expect, it } from 'vitest'
import { metricsOf, sizeOf } from '../src/metrics'
import { metricsByDefinition } from './metrics-by-definition'
import { analysed, shop } from './shop'

describe('the metrics of a Component (docs/structure-format.md, section 5)', () => {
  it('follow from the list of Dependencies, each by its definition', async () => {
    const { structure, dependencies, lineCounts } = await analysed(shop)
    for (const tests of [false, true]) {
      const metrics = metricsOf(structure, dependencies, lineCounts, { tests })
      expect([...metrics.keys()]).toEqual([
        'shop',
        'shop/cart',
        'shop/pricing',
        'billing',
        'shared'
      ])
      expect(metrics).toEqual(metricsByDefinition(structure, dependencies, lineCounts, tests))
    }
  })

  it('are what one counts by hand', async () => {
    const { structure, dependencies, lineCounts } = await analysed(shop)
    const metrics = metricsOf(structure, dependencies, lineCounts)
    // index.ts, cart.ts, line.ts, price.ts, discount.ts; four Dependencies among them, three
    // going out (to invoice.ts twice, to money.ts), two coming in (from invoice.ts and seed.ts).
    expect(metrics.get('shop')).toEqual({
      files: 5,
      lines: 7,
      efferent: 3,
      afferent: 2,
      instability: 3 / 5,
      fanOut: 2,
      fanIn: 1,
      cohesion: 1,
      internalShare: 4 / 9
    })
    // Its own files are not a Component: index.ts using cart.ts adds nothing to fan-in.
    expect(metrics.get('shop/cart')).toMatchObject({
      efferent: 2,
      afferent: 4,
      instability: 1 / 3,
      fanOut: 1,
      fanIn: 1,
      cohesion: 0.5,
      internalShare: 0
    })
    expect(metrics.get('billing')).toMatchObject({
      files: 3,
      efferent: 1,
      afferent: 2,
      fanOut: 2,
      fanIn: 1,
      cohesion: 1,
      internalShare: 1 / 3
    })
    // Nothing goes out of shared: maximally stable.
    expect(metrics.get('shared')).toMatchObject({ efferent: 0, afferent: 2, instability: 0 })
  })

  it('count Unassigned files as outside, and test files only when asked to', async () => {
    const { structure, dependencies, lineCounts } = await analysed(shop)
    // seed.ts is Unassigned and uses index.ts.
    expect(metricsOf(structure, dependencies, lineCounts).get('shop')!.afferent).toBe(2)
    const withTests = metricsOf(structure, dependencies, lineCounts, { tests: true })
    // money.test.ts lies in shared, uses money.ts beside it and cart.ts in shop.
    expect(withTests.get('shared')).toMatchObject({
      files: 2,
      efferent: 1,
      instability: 1 / 3,
      fanOut: 1,
      cohesion: 1
    })
    expect(withTests.get('shop')!.afferent).toBe(3)
  })

  it('give a Component that contains no Source File no metrics, and leave the undefined undefined', async () => {
    const { structure, dependencies, lineCounts } = await analysed({
      '.arch/components.yml': [
        'components:',
        '  alone: { paths: [src/alone/**] }',
        '  nothing: { paths: [src/nothing/**] }',
        ''
      ].join('\n'),
      'src/alone/a.ts': 'export const a = 1\n'
    })
    const metrics = metricsOf(structure, dependencies, lineCounts)
    expect([...metrics.keys()]).toEqual(['alone'])
    expect(metrics.get('alone')).toEqual({
      files: 1,
      lines: 1,
      efferent: 0,
      afferent: 0,
      instability: undefined,
      fanOut: 0,
      fanIn: 0,
      cohesion: 1,
      internalShare: undefined
    })
  })

  it('size any node of a level by its files and their lines', () => {
    const lines = new Map([
      ['a.ts', 3],
      ['b.ts', 4]
    ])
    expect(sizeOf(['a.ts', 'b.ts', 'unreadable.ts'], lines)).toEqual({ files: 3, lines: 7 })
  })
})
