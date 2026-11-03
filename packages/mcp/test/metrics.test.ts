import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { metricTools } from '../src/metrics'
import { Refusal } from '../src/protocol'

// docs/mcp.md, "component_metrics"; the numbers are the fixtures' of part 13, which
// packages/structure/test/fixture-metrics.test.ts counts a second way.

const fixture = (name: string): string =>
  fileURLToPath(new URL(`../../structure/test/fixtures/${name}/`, import.meta.url))

const scratch: string[] = []
afterAll(() => scratch.forEach((dir) => rmSync(dir, { recursive: true, force: true })))

/** A copy of a fixture, with `files` written over it. */
function copyOf(from: string, files: Record<string, string> = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'adr-mcp-metrics-'))
  scratch.push(root)
  cpSync(from, root, { recursive: true })
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  return root
}

const measure = (root: string, input: Record<string, unknown> = {}) =>
  metricTools({ root })
    .find((tool) => tool.name === 'component_metrics')!
    .run(input)

const maven = copyOf(fixture('maven-shop'), {
  '.arch/components.yml':
    'components:\n  cart:\n    paths: [cart/**]\n  catalog:\n    paths: [catalog/**]\n  web:\n    paths: [web/**]\n'
})

describe('component_metrics (docs/mcp.md)', () => {
  it('measures the top level of the Java shop: its main sequence, its propagation cost, its functions', async () => {
    const result = await measure(maven)
    expect(result).toMatchObject({
      origin: 'declared',
      tests: false,
      level: {
        below: null,
        propagationCost: 0.5,
        nodes: [
          {
            kind: 'component',
            id: 'cart',
            files: 3,
            abstractness: 0,
            instability: 0.5,
            distance: 0.5
          },
          { kind: 'component', id: 'catalog', files: 3, abstractness: 1 / 3, instability: 0 },
          { kind: 'component', id: 'web', files: 3, abstractness: 0, instability: 1, distance: 0 }
        ]
      },
      functionCount: 10,
      splitClasses: [],
      splitClassCount: 0,
      // Cart, Line, Search, Product, CartView, Page, and a Util in cart and in web.
      classCount: 8,
      // What Java's reader does not see touches the Dependencies, not what a file alone says.
      notes: [
        'Java is read without a classpath. Dependencies may be missing there: afferent and efferent coupling, fan-in, fan-out and propagation cost are lower bounds, and instability and distance can be off either way. Complexity, LCOM4 and abstractness are read from each file alone and are not affected.'
      ]
    })
    expect((result.functions as unknown[])[0]).toEqual({
      file: 'cart/src/main/java/com/shop/cart/Cart.java',
      name: 'Cart.discount(long)',
      line: 19,
      endLine: 28,
      complexity: 5
    })
    expect(result).not.toHaveProperty('metrics')
  })

  it('measures one Component, test files on request, undefined metrics as null', async () => {
    const web = await measure(maven, { component: 'web', tests: true })
    expect(web).toMatchObject({
      component: 'web',
      tests: true,
      metrics: { files: 4, abstractness: 0, instability: 1, distance: 0, fanIn: 0 },
      functionCount: 5,
      level: { below: 'web' }
    })
    expect((web.functions as { name: string }[]).map((one) => one.name)).toContain(
      'PageTest.showsACart()'
    )
    // Below web lie its directories; the shop has no Component that declares nothing.
    const catalog = await measure(maven, { component: 'catalog' })
    expect(catalog.metrics).toMatchObject({ afferent: 3, efferent: 0, internalShare: 0.5 })
  })

  it('names the classes whose methods fall apart', async () => {
    const result = await measure(copyOf(fixture('shop')), { component: 'billing' })
    expect(result).toMatchObject({ splitClassCount: 1, notes: [] })
    expect(result.splitClasses).toEqual([
      {
        file: 'src/billing/ledger.ts',
        name: 'Ledger',
        line: 2,
        endLine: 17,
        methods: 3,
        lcom4: 2
      }
    ])
  })

  it('refuses a Component that is not there', async () => {
    await expect(measure(maven, { component: 'payment' })).rejects.toThrow(Refusal)
    await expect(measure(maven, { component: 'payment' })).rejects.toThrow(
      'There is no Component payment. list_components names the Components there are.'
    )
  })
})
