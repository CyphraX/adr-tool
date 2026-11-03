import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import {
  analyseDependencies,
  extractorOf,
  levelOf,
  metricsOf,
  openStructure,
  prepareGo
} from '../src'
import { goComplexityByWords } from './measures-by-definition'
import { metricsByDefinition } from './metrics-by-definition'
import { nodeFileSystem, repositoryFiles } from './repository-files'

// The Go fixture to look at in the app (README.md, "Development"), and the done-when of part
// 20 of docs/plan-vision.md: its Components, Dependencies and Cycles are pinned here, and every
// use is resolved, a Library, or listed as not resolved.
const root = fileURLToPath(new URL('fixtures/go-shop/', import.meta.url))
const require = createRequire(import.meta.url)

it('drafts a Go module and the module nested in it, with their Dependencies and Cycles', async () => {
  const go = await prepareGo({
    runtime: await readFile(require.resolve('web-tree-sitter/web-tree-sitter.wasm')),
    grammar: await readFile(require.resolve('tree-sitter-go/tree-sitter-go.wasm'))
  })
  const fs = nodeFileSystem(root)
  const files = repositoryFiles(root)
  const structure = await openStructure(fs, files)
  const analysis = await analyseDependencies(fs, files, structure.sourceFiles, extractorOf({ go }))

  // The nested module is a unit; beside it, the package directories of the root module.
  expect(structure.components.map((component) => [component.id, component.paths])).toEqual([
    ['billing', ['billing/**']],
    ['cart', ['cart/**']],
    ['catalog', ['catalog/**']],
    ['cmd', ['cmd/**']],
    ['web', ['web/**']]
  ])
  expect(structure.sourceFiles.filter((file) => file.test).map((file) => file.path)).toEqual([
    'cart/cart_test.go'
  ])

  // Every import: a Dependency, the standard library, a Library, or not resolved.
  expect(analysis.notAnalysed).toEqual([])
  expect(analysis.notResolved).toEqual([
    { file: 'web/server.go', specifier: 'example.com/shop/payments', line: 11 }
  ])
  expect(analysis.libraries).toEqual([{ file: 'cart/line.go', library: 'github.com/google/uuid' }])
  expect(
    analysis.dependencies.map(
      (dependency) => `${dependency.from} > ${dependency.to} ${dependency.lines.join(',')}`
    )
  ).toEqual([
    // Within a package, and into the root module through billing's `replace example.com/shop
    // => ../`, folded to the root of the repository.
    'billing/invoice/invoice.go > billing/invoice/tax.go 13',
    'billing/invoice/invoice.go > cart/cart.go 12',
    'cart/cart.go > cart/line.go 8,18',
    'cart/cart.go > catalog/product.go 17',
    'cart/cart_test.go > cart/cart.go 10',
    'cart/cart_test.go > catalog/product.go 11',
    'cart/line.go > cart/cart.go 21',
    'cart/line.go > catalog/product.go 11',
    'catalog/search.go > catalog/product.go 4,7',
    'cmd/shop/main.go > cart/cart.go 13',
    'cmd/shop/main.go > web/server.go 13',
    // Into the nested module through `replace example.com/shop/billing => ./billing`, by an alias.
    'web/server.go > billing/invoice/invoice.go 16',
    'web/server.go > cart/cart.go 15'
  ])

  // Packages cannot form a Cycle in Go; two files of one package can.
  const top = levelOf(structure, analysis.dependencies)!
  expect(top.edges.map((edge) => `${edge.from} > ${edge.to} ${edge.weight}`)).toEqual([
    'billing > cart 1',
    'cart > catalog 2',
    'cmd > cart 1',
    'cmd > web 1',
    'web > billing 1',
    'web > cart 1'
  ])
  expect(top.cycles).toEqual([])
  const cart = levelOf(structure, analysis.dependencies, 'cart')!
  expect(cart.cycles.map((cycle) => cycle.members)).toEqual([['cart/cart.go', 'cart/line.go']])

  // Its metrics, tests included, follow from the Dependencies as for the other languages.
  const { dependencies, lineCounts } = analysis
  expect(metricsOf(structure, dependencies, lineCounts, { tests: true })).toEqual(
    metricsByDefinition(structure, dependencies, lineCounts, true)
  )
  // What is measured inside its files (part 13): abstractness and distance by their definitions
  // too, and the complexity of every function by its words, a second count.
  const { measures } = analysis
  expect(metricsOf(structure, dependencies, lineCounts, { tests: true }, measures)).toEqual(
    metricsByDefinition(structure, dependencies, lineCounts, true, measures)
  )
  let functions = 0
  for (const [path, measured] of measures) {
    const text = await readFile(join(root, path), 'utf8')
    for (const one of measured.functions) {
      expect([
        path,
        one.name,
        goComplexityByWords(
          text
            .split('\n')
            .slice(one.line - 1, one.endLine)
            .join('\n')
        )
      ]).toEqual([path, one.name, one.complexity])
      functions++
    }
  }
  expect(functions).toBeGreaterThan(5)

  // What its go.mod files require, for the Library inventory.
  expect(analysis.manifests).toEqual([
    { manifest: 'billing/go.mod', name: 'example.com/shop', version: 'v0.0.0', line: 5 },
    { manifest: 'go.mod', name: 'example.com/shop/billing', version: 'v0.0.0', line: 6 },
    { manifest: 'go.mod', name: 'github.com/google/uuid', version: 'v1.6.0', line: 7 },
    {
      manifest: 'go.mod',
      name: 'golang.org/x/text',
      version: 'v0.21.0',
      group: 'indirect',
      line: 8
    }
  ])
})
