import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { extractUses, openStructure } from '../src'
import { complexityByEslint, type Counted } from './complexity-by-eslint'
import { nodeFileSystem, repositoryFiles } from './repository-files'

const shop = fileURLToPath(new URL('fixtures/shop/', import.meta.url))
const repository = fileURLToPath(new URL('../../../', import.meta.url))

/**
 * Each TypeScript and JavaScript Source File of a repository, with the complexity of its
 * functions as `structure` counts it and as ESLint counts it, each where the function ends.
 */
async function bothCounts(root: string) {
  const files = repositoryFiles(root)
  const { sourceFiles } = await openStructure(nodeFileSystem(root), files)
  const counted: { path: string; ours: Counted; eslint: Counted }[] = []
  for (const { path, language } of sourceFiles) {
    if (language !== 'typescript') continue
    const text = await readFile(join(root, path), 'utf8')
    const extraction = extractUses(path, text)
    // A file that cannot be parsed is not measured (section 2).
    if (!extraction.analysed || !('uses' in extraction)) continue
    const ours: Counted = extraction
      .measures!.functions.map(({ endLine, complexity }): [number, number] => [endLine, complexity])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    counted.push({ path, ours, eslint: complexityByEslint(path, text) })
  }
  return counted
}

// The done-when of part 13: the numbers agree with a second, independent count.
it('is what ESLint counts, for every function of the TypeScript fixture', async () => {
  const counted = await bothCounts(shop)
  for (const { ours, eslint } of counted) expect(ours).toEqual(eslint)
  expect(Object.fromEntries(counted.map(({ path, ours }) => [path, ours]))).toEqual({
    'src/billing/invoice.ts': [[9, 1]],
    // record, the callback of total, total, note.
    'src/billing/ledger.ts': [
      [8, 2],
      [11, 1],
      [12, 1],
      [16, 2]
    ],
    'src/cart/cart.ts': [
      [11, 2],
      [13, 1]
    ],
    'src/cart/line.ts': [
      [7, 1],
      [9, 1]
    ],
    'src/catalog/product.ts': [],
    // The callback first, where both end.
    'src/catalog/search.ts': [
      [4, 1],
      [4, 1]
    ],
    'src/pricing/discount.ts': [[4, 2]],
    // `?.` and `??` in the callback of reduce.
    'src/pricing/price.ts': [
      [5, 1],
      [5, 3]
    ]
  })
})

it('is what ESLint counts, for every function of this repository', async () => {
  const counted = await bothCounts(repository)
  const differing = counted.filter(
    ({ ours, eslint }) => JSON.stringify(ours) !== JSON.stringify(eslint)
  )
  expect(
    Object.fromEntries(differing.map(({ path, ours, eslint }) => [path, { ours, eslint }]))
  ).toEqual({})
  // Enough to mean something: thousands of functions in hundreds of files.
  expect(counted.length).toBeGreaterThan(200)
  expect(counted.reduce((sum, { ours }) => sum + ours.length, 0)).toBeGreaterThan(3000)
}, 120_000)
