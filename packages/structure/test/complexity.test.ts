import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { extractUses, openStructure } from '../src'
import { scriptOfSvelte } from '../src/typescript/svelte'
import { complexityByEslint, type Counted } from './complexity-by-eslint'
import { nodeFileSystem, repositoryFiles } from './repository-files'

const shop = fileURLToPath(new URL('fixtures/shop/', import.meta.url))
const repository = fileURLToPath(new URL('../../../', import.meta.url))

/**
 * Each TypeScript, JavaScript and Svelte Source File of a repository, with the complexity of
 * its functions as `structure` counts it and as ESLint counts it, each where the function ends.
 * ESLint reads a component's script blocks as the suite takes them out of it, on their lines
 * (`scriptOfSvelte`): what is shared is where the script is, not how it is counted.
 */
async function bothCounts(root: string) {
  const files = repositoryFiles(root)
  const { sourceFiles } = await openStructure(nodeFileSystem(root), files)
  const counted: { path: string; ours: Counted; eslint: Counted }[] = []
  for (const { path, language } of sourceFiles) {
    if (language !== 'typescript' && language !== 'svelte') continue
    const text = await readFile(join(root, path), 'utf8')
    const extraction = extractUses(path, text)
    // A file that cannot be parsed is not measured (section 2).
    if (!extraction.analysed || !('uses' in extraction)) continue
    const ours: Counted = extraction
      .measures!.functions.map(({ endLine, complexity }): [number, number] => [endLine, complexity])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    const eslint =
      language === 'svelte'
        ? complexityByEslint(`${path}.ts`, scriptOfSvelte(text))
        : complexityByEslint(path, text)
    counted.push({ path, ours, eslint })
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
  // Enough to mean something: thousands of functions in hundreds of files, the components of
  // the app among them.
  expect(counted.length).toBeGreaterThan(200)
  expect(counted.filter(({ path }) => path.endsWith('.svelte')).length).toBeGreaterThan(30)
  expect(counted.reduce((sum, { ours }) => sum + ours.length, 0)).toBeGreaterThan(3000)
}, 120_000)

it('is what ESLint counts for a field whose value is an arrow function, and in a component', () => {
  const ours = (path: string, text: string): Counted => {
    const extraction = extractUses(path, text)
    if (!extraction.analysed) throw new Error(`${path} was not parsed`)
    return extraction
      .measures!.functions.map(({ endLine, complexity }): [number, number] => [endLine, complexity])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1])
  }
  // ESLint reports the arrow twice, as a function and as the field's value.
  const field = [
    'export class A {',
    '  limit = 1 || 2',
    '  check = (x: number) => x > this.limit && x < 9',
    '  static { if (A) console.log(A) }',
    '}',
    ''
  ].join('\n')
  expect(ours('a.ts', field)).toEqual([[3, 2]])
  expect(complexityByEslint('a.ts', field)).toEqual(ours('a.ts', field))
  const component = [
    '<script lang="ts">',
    '  let { items }: { items: number[] } = $props()',
    '  const shown = $derived(items.filter((item) => item > 0 && item < 9))',
    '</script>',
    '{#each shown as item (item)}<p>{item}</p>{/each}',
    ''
  ].join('\n')
  expect(ours('List.svelte', component)).toEqual([[3, 2]])
  expect(complexityByEslint('List.svelte.ts', scriptOfSvelte(component))).toEqual(
    ours('List.svelte', component)
  )
})
