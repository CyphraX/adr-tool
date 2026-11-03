import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  analyseDependencies,
  extractorOf,
  levelOf,
  measuredInside,
  metricsOf,
  openStructure,
  prepareJava,
  propagationCostOf,
  type Structure
} from '../src'
import { lcom4Of, type MethodUses } from '../src/measures'
import { metricsByDefinition } from './metrics-by-definition'
import {
  javaComplexityByWords,
  lcom4ByDefinition,
  propagationCostByDefinition
} from './measures-by-definition'
import { nodeFileSystem, repositoryFiles } from './repository-files'

// The done-when of part 13: the numbers of the fixtures agree with a second, independent count.
const require = createRequire(import.meta.url)
const fixture = (name: string): string =>
  fileURLToPath(new URL(`fixtures/${name}/`, import.meta.url))

async function analysed(root: string) {
  const java = await prepareJava({
    runtime: await readFile(require.resolve('web-tree-sitter/web-tree-sitter.wasm')),
    grammar: await readFile(require.resolve('tree-sitter-java/tree-sitter-java.wasm'))
  })
  const fs = nodeFileSystem(root)
  const files = repositoryFiles(root)
  const structure = await openStructure(fs, files)
  return {
    structure,
    ...(await analyseDependencies(fs, files, structure.sourceFiles, extractorOf({ java })))
  }
}

/** A, I and D of each Component, rounded for reading. */
function mainSequence(metrics: ReturnType<typeof metricsOf>): Record<string, number[]> {
  const round = (value: number | undefined): number => Math.round((value ?? NaN) * 1000) / 1000
  return Object.fromEntries(
    [...metrics].map(([id, { abstractness, instability, distance }]) => [
      id,
      [abstractness, instability, distance].map(round)
    ])
  )
}

/** Every level below a Component, and the top level. */
function everyLevel(
  structure: Pick<Structure, 'components' | 'sourceFiles'>,
  dependencies: Parameters<typeof levelOf>[1]
) {
  const ids = (list: Structure['components']): string[] =>
    list.flatMap((component) => [component.id, ...ids(component.children)])
  return [undefined, ...ids(structure.components)].map((parent) =>
    levelOf(structure, dependencies, parent)!
  )
}

describe('the Java fixture', () => {
  it('has the complexity of its methods by hand, and by the words of each', async () => {
    const root = fixture('maven-shop')
    const { structure, measures } = await analysed(root)
    const { functions } = measuredInside(structure, measures, undefined, { tests: true })
    expect(
      functions.map(({ file, name, complexity }) => [
        file.slice(file.lastIndexOf('/') + 1),
        name,
        complexity
      ])
    ).toEqual([
      ['Cart.java', 'Cart.discount(long)', 5],
      ['Cart.java', 'Cart.add(Product)', 1],
      ['Cart.java', 'Cart.total()', 1],
      ['Line.java', 'Line.cents()', 1],
      ['Search.java', 'Search.Search(List)', 1],
      ['Search.java', 'Search.find(String)', 1],
      ['CartView.java', 'CartView.CartView(Cart)', 1],
      ['CartView.java', 'CartView.render()', 1],
      ['Page.java', 'Page.Page(Search)', 1],
      ['Page.java', 'Page.show(Cart)', 1],
      ['PageTest.java', 'PageTest.showsACart()', 1]
    ])
    for (const { file, line, endLine, complexity } of functions) {
      const text = (await readFile(join(root, file), 'utf8')).split('\n')
      expect(javaComplexityByWords(text.slice(line - 1, endLine).join('\n'))).toBe(complexity)
    }
    expect(functions.find((one) => one.name === 'Cart.discount(long)')).toMatchObject({
      file: 'cart/src/main/java/com/shop/cart/Cart.java',
      line: 19,
      endLine: 28
    })
  })

  it('has one group of methods in every class, and none in a record or class without methods', async () => {
    const { structure, measures } = await analysed(fixture('maven-shop'))
    const { classes } = measuredInside(structure, measures)
    expect(Object.fromEntries(classes.map(({ name, lcom4 }) => [name, lcom4]))).toEqual({
      Cart: 1,
      Line: 1,
      Search: 1,
      CartView: 1,
      Page: 1,
      Product: undefined,
      Util: undefined
    })
  })

  it('draws its modules on the main sequence: abstractness and distance by hand and by definition', async () => {
    const { structure, dependencies, lineCounts, measures } = await analysed(fixture('maven-shop'))
    for (const tests of [false, true]) {
      expect(metricsOf(structure, dependencies, lineCounts, { tests }, measures)).toEqual(
        metricsByDefinition(structure, dependencies, lineCounts, tests, measures)
      )
    }
    const metrics = metricsOf(structure, dependencies, lineCounts, {}, measures)
    // catalog: Catalog of Catalog, Product and Search is abstract, and nothing goes out.
    // cart: three classes; Cart and Line use Product, CartView and Page use cart.
    // web: concrete, and uses what nothing uses back.
    expect(mainSequence(metrics)).toMatchObject({
      cart: [0, 0.5, 0.5],
      catalog: [0.333, 0, 0.667],
      web: [0, 1, 0]
    })
    // web, cart, catalog: web reaches both, cart reaches catalog.
    const top = levelOf(structure, dependencies)!
    expect(propagationCostOf(top)).toBe(3 / 6)
  })
})

describe('the TypeScript fixture', () => {
  it('has its classes measured by hand: the ledger falls into two groups', async () => {
    const { structure, measures } = await analysed(fixture('shop'))
    expect(measuredInside(structure, measures).classes).toEqual([
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

  it('has abstractness, distance and propagation cost by hand and by definition', async () => {
    const { structure, dependencies, lineCounts, measures } = await analysed(fixture('shop'))
    for (const tests of [false, true]) {
      expect(metricsOf(structure, dependencies, lineCounts, { tests }, measures)).toEqual(
        metricsByDefinition(structure, dependencies, lineCounts, tests, measures)
      )
    }
    // catalog: Product and find; cart: Cart, add, total, Line, lineOf, again; pricing: two
    // functions; billing: Invoice, invoiceOf, Ledger.
    expect(mainSequence(metricsOf(structure, dependencies, lineCounts, {}, measures))).toEqual({
      catalog: [0.5, 0, 0.5],
      cart: [0.333, 0.333, 0.333],
      pricing: [0, 0.667, 0.333],
      billing: [0.333, 1, 0.333]
    })
    // billing reaches the three others, cart and pricing two each, catalog none.
    expect(propagationCostOf(levelOf(structure, dependencies)!)).toBe(7 / 12)
  })
})

describe('propagation cost', () => {
  it('is its definition on every level of the fixtures and of this repository', async () => {
    for (const root of [
      fixture('shop'),
      fixture('maven-shop'),
      fileURLToPath(new URL('../../../', import.meta.url))
    ]) {
      const { structure, dependencies } = await analysed(root)
      for (const level of everyLevel(structure, dependencies)) {
        expect(propagationCostOf(level)).toBe(propagationCostByDefinition(level))
      }
    }
  }, 60_000)

  it('is 0 without Dependencies, 1 in a Cycle of all, and undefined for one node', () => {
    const node = (id: string) => ({ kind: 'component' as const, id, files: [id] })
    const edge = (from: string, to: string) => ({
      from,
      to,
      weight: 1,
      typeOnly: false,
      dependencies: []
    })
    expect(propagationCostOf({ nodes: [node('a'), node('b')], edges: [] })).toBe(0)
    expect(
      propagationCostOf({
        nodes: [node('a'), node('b'), node('c')],
        edges: [edge('a', 'b'), edge('b', 'c'), edge('c', 'a')]
      })
    ).toBe(1)
    expect(propagationCostOf({ nodes: [node('a')], edges: [] })).toBeUndefined()
    // (unassigned) takes no part, nor what goes through it.
    expect(
      propagationCostOf({
        nodes: [node('a'), node('b'), { kind: 'unassigned', id: '(unassigned)', files: ['x'] }],
        edges: [edge('a', '(unassigned)'), edge('(unassigned)', 'b')]
      })
    ).toBe(0)
  })
})

describe('LCOM4', () => {
  it('is its definition for every way methods can share fields and call each other', () => {
    // Every class of up to four methods over two fields, each method using a subset of them
    // and calling a subset of the others: a few thousand classes, enumerated.
    const names = ['a', 'b', 'c', 'd']
    const subsets = <T>(list: readonly T[]): T[][] =>
      list.reduce<T[][]>((all, item) => [...all, ...all.map((one) => [...one, item])], [[]])
    let checked = 0
    for (let count = 0; count <= 4; count++) {
      const methods = names.slice(0, count)
      // Each method uses some of the fields, and calls nothing or the method after it.
      const choices = methods.map((_, at) =>
        subsets(['x', 'y']).flatMap((fields) => [
          { fields, calls: [] as string[] },
          { fields, calls: [methods[(at + 1) % methods.length]!] }
        ])
      )
      const combine = (at: number, chosen: MethodUses[]): void => {
        if (at === methods.length) {
          expect(lcom4Of(chosen)).toBe(lcom4ByDefinition(chosen))
          checked++
          return
        }
        for (const { fields, calls } of choices[at]!) {
          combine(at + 1, [
            ...chosen,
            { name: methods[at]!, fields: new Set(fields), calls: new Set(calls) }
          ])
        }
      }
      combine(0, [])
    }
    expect(checked).toBeGreaterThan(4000)
  })
})
