import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { analyseDependencies, levelOf, openStructure } from '../src'
import { nodeFileSystem, repositoryFiles } from './repository-files'

// The fixture to look at in the app (README.md, "Development"): what it shows is pinned here.
const root = fileURLToPath(new URL('fixtures/shop/', import.meta.url))

it('shows a Cycle between two Components with its weakest Dependency, and one between two files', async () => {
  const fs = nodeFileSystem(root)
  const files = repositoryFiles(root)
  const structure = await openStructure(fs, files)
  const { dependencies, notResolved } = await analyseDependencies(fs, files, structure.sourceFiles)
  expect(structure.origin).toBe('declared')
  expect(structure.problems).toEqual([])
  expect(notResolved).toEqual([])

  const top = levelOf(structure, dependencies)!
  expect(
    top.edges.map(
      (edge) => `${edge.from} > ${edge.to} ${edge.weight}${edge.typeOnly ? ' (type)' : ''}`
    )
  ).toEqual([
    'billing > cart 1',
    'billing > catalog 1 (type)',
    'cart > catalog 1',
    'cart > pricing 2',
    'pricing > cart 1',
    'pricing > catalog 1'
  ])
  expect(top.cycles).toEqual([
    {
      members: ['cart', 'pricing'],
      roundTrip: ['cart', 'pricing'],
      weakest: { from: 'pricing', to: 'cart' },
      typeOnly: false
    }
  ])

  const cart = levelOf(structure, dependencies, 'cart')!
  expect(cart.cycles.map((cycle) => cycle.members)).toEqual([
    ['src/cart/cart.ts', 'src/cart/line.ts']
  ])
})
