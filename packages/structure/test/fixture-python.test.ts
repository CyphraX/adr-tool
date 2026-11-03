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
  preparePython
} from '../src'
import { metricsByDefinition } from './metrics-by-definition'
import { nodeFileSystem, repositoryFiles } from './repository-files'

// The Python fixture to look at in the app (README.md, "Development"), and the done-when of
// part 20 of docs/plan-vision.md: its Components, Dependencies and Cycles are pinned here, and
// every use is resolved, a Library, or listed as not resolved.
const root = fileURLToPath(new URL('fixtures/python-shop/', import.meta.url))
const require = createRequire(import.meta.url)

it('drafts a src layout of Python packages, with their Dependencies and their Cycles', async () => {
  const python = await preparePython({
    runtime: await readFile(require.resolve('web-tree-sitter/web-tree-sitter.wasm')),
    grammar: await readFile(require.resolve('tree-sitter-python/tree-sitter-python.wasm'))
  })
  const fs = nodeFileSystem(root)
  const files = repositoryFiles(root)
  const structure = await openStructure(fs, files)
  const analysis = await analyseDependencies(
    fs,
    files,
    structure.sourceFiles,
    extractorOf({ python })
  )

  // The source root pyproject.toml names, passing over the one package `shop` beneath it.
  expect(structure.components.map((component) => [component.id, component.paths])).toEqual([
    ['cart', ['src/shop/cart/**']],
    ['catalog', ['src/shop/catalog/**']],
    ['pricing', ['src/shop/pricing/**']]
  ])
  expect(structure.sourceFiles.filter((file) => file.test).map((file) => file.path)).toEqual([
    'tests/test_cart.py'
  ])

  // Every import: a Dependency, the standard library, a Library, or not resolved.
  expect(analysis.notAnalysed).toEqual([])
  expect(analysis.notResolved).toEqual([
    { file: 'src/shop/pricing/rules.py', specifier: 'shop.pricing.tariffs', line: 4 }
  ])
  expect(analysis.libraries).toEqual([
    { file: 'src/shop/catalog/search.py', library: 'requests' },
    { file: 'src/shop/pricing/rules.py', library: 'yaml' },
    { file: 'tests/test_cart.py', library: 'pytest' }
  ])
  const short = (path: string) => path.replace(/^src\/shop\//, '')
  expect(
    analysis.dependencies.map(
      (dependency) =>
        `${short(dependency.from)} > ${short(dependency.to)} ${dependency.lines.join(',')}${dependency.typeOnly ? ' type-only' : ''}`
    )
  ).toEqual([
    // Relative, absolute through a package's __init__.py, and a submodule named in `from`.
    'cart/cart.py > cart/line.py 6',
    'cart/cart.py > catalog/__init__.py 3',
    'cart/cart.py > pricing/rules.py 4',
    // Under `if TYPE_CHECKING:`.
    'cart/line.py > cart/cart.py 9 type-only',
    'cart/line.py > catalog/product.py 5',
    'catalog/__init__.py > catalog/product.py 1',
    'catalog/search.py > catalog/product.py 5',
    // Two dots up.
    'pricing/rules.py > cart/line.py 6',
    'tests/test_cart.py > cart/cart.py 3',
    'tests/test_cart.py > catalog/product.py 4'
  ])

  // A Cycle between two Components, and one between two files of the cart.
  const top = levelOf(structure, analysis.dependencies)!
  expect(top.edges.map((edge) => `${edge.from} > ${edge.to} ${edge.weight}`)).toEqual([
    'cart > catalog 2',
    'cart > pricing 1',
    'pricing > cart 1'
  ])
  expect(top.cycles).toEqual([
    {
      members: ['cart', 'pricing'],
      roundTrip: ['cart', 'pricing'],
      weakest: { from: 'cart', to: 'pricing' },
      typeOnly: false
    }
  ])
  const cart = levelOf(structure, analysis.dependencies, 'cart')!
  expect(cart.cycles.map((cycle) => [cycle.members.map(short), cycle.typeOnly])).toEqual([
    [['cart/cart.py', 'cart/line.py'], false]
  ])

  // Its metrics, tests included, follow from the Dependencies as for the other languages.
  const { dependencies, lineCounts } = analysis
  expect(metricsOf(structure, dependencies, lineCounts, { tests: true })).toEqual(
    metricsByDefinition(structure, dependencies, lineCounts, true)
  )

  // What its manifests declare, for the Library inventory: the distribution, not the import.
  expect(analysis.manifests).toEqual([
    { manifest: 'pyproject.toml', name: 'requests', version: '>=2.31' },
    { manifest: 'pyproject.toml', name: 'PyYAML', version: '>=6.0' },
    { manifest: 'pyproject.toml', name: 'pytest', version: '>=8', group: 'dev' },
    { manifest: 'requirements.txt', name: 'requests', version: '==2.32.3' },
    { manifest: 'requirements.txt', name: 'PyYAML', version: '==6.0.2' }
  ])
})
