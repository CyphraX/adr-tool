import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import {
  analyseDependencies,
  extractorOf,
  levelOf,
  metricsOf,
  openStructure,
  prepareJava
} from '../src'
import { metricsByDefinition } from './metrics-by-definition'
import { nodeFileSystem, repositoryFiles } from './repository-files'

// The Java fixture to look at in the app (README.md, "Development"), and the done-when of
// part 4: its Dependencies, those within a package included, are pinned here.
const root = fileURLToPath(new URL('fixtures/maven-shop/', import.meta.url))
const require = createRequire(import.meta.url)

it('shows the Dependencies of a multi-module Maven project, within a package and across modules', async () => {
  const java = await prepareJava({
    runtime: await readFile(require.resolve('web-tree-sitter/web-tree-sitter.wasm')),
    grammar: await readFile(require.resolve('tree-sitter-java/tree-sitter-java.wasm'))
  })
  const fs = nodeFileSystem(root)
  const files = repositoryFiles(root)
  const structure = await openStructure(fs, files)
  const analysis = await analyseDependencies(fs, files, structure.sourceFiles, extractorOf(java))

  // The Draft takes the Maven modules, and below web the two packages it holds.
  expect(structure.components.map((component) => component.id)).toEqual(['cart', 'catalog', 'web'])
  expect(analysis.notAnalysed).toEqual([])
  expect(analysis.notResolved).toEqual([
    { file: 'web/src/main/java/com/shop/web/Page.java', specifier: 'Util', line: 17 }
  ])
  expect([...new Set(analysis.libraries.map((use) => use.library))]).toEqual([
    'org.slf4j',
    'org.junit.jupiter.api'
  ])

  const short = (path: string) => path.slice(path.lastIndexOf('/') + 1, -'.java'.length)
  expect(
    analysis.dependencies.map((dependency) => `${short(dependency.from)} > ${short(dependency.to)}`)
  ).toEqual([
    'Cart > Line',
    'Cart > Product',
    'Line > Cart',
    'Line > Product',
    // The catalog's interface, and the class that implements it.
    'Catalog > Product',
    'Search > Catalog',
    'Search > Product',
    'CartView > Cart',
    'Page > Cart',
    'Page > Search',
    'Page > CartView',
    'PageTest > Cart',
    'PageTest > Page'
  ])

  const top = levelOf(structure, analysis.dependencies)!
  expect(top.edges.map((edge) => `${edge.from} > ${edge.to} ${edge.weight}`)).toEqual([
    'cart > catalog 2',
    'web > cart 2',
    'web > catalog 1'
  ])
  // The module cart holds two packages, so the Draft has a Component for each.
  const cart = levelOf(structure, analysis.dependencies, 'cart/cart')!
  expect(cart.cycles.map((cycle) => cycle.members.map(short))).toEqual([['Cart', 'Line']])

  // Its metrics, tests included, follow from the Dependencies as for TypeScript.
  const { dependencies, lineCounts } = analysis
  expect(metricsOf(structure, dependencies, lineCounts, { tests: true })).toEqual(
    metricsByDefinition(structure, dependencies, lineCounts, true)
  )
  expect(metricsOf(structure, dependencies, lineCounts).get('web')).toMatchObject({
    efferent: 2,
    afferent: 0,
    instability: 1
  })
})
