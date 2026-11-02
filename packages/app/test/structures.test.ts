import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { analyse, readCache, writeCache, type Analysis } from '../src/main/analysis'
import { Structures, viewOf } from '../src/main/structures'

/** A small repository without git: a Cycle between two Components, one of which has children. */
let root: string

const write = (path: string, text: string): void => {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), text)
}

beforeAll(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'adr-tool-structure-')))
  write(
    '.arch/components.yml',
    [
      'components:',
      '  shop:',
      '    name: Shop',
      '    paths: [src/shop/**]',
      '    components:',
      '      cart: { name: Cart, paths: [src/shop/cart/**] }',
      '  billing:',
      '    paths: [src/billing/**, src/nothing/**]',
      ''
    ].join('\n')
  )
  write('src/shop/index.ts', "export * from './cart/cart'\n")
  write('src/shop/cart/cart.ts', "import { invoice } from '../../billing/invoice'\n")
  write(
    'src/billing/invoice.ts',
    "import type { Cart } from '../shop/cart/cart'\nimport x from './gone'\n"
  )
  write('src/billing/invoice.test.ts', "import { invoice } from './invoice'\n")
})

afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('the analysis of a repository, as the app runs it', () => {
  it('parses what changed since the cache was written, and nothing else', async () => {
    const first = await analyse(root, undefined)
    expect(first.changed).toBe(true)
    expect(Object.keys(first.cache.files).sort()).toEqual([
      'src/billing/invoice.test.ts',
      'src/billing/invoice.ts',
      'src/shop/cart/cart.ts',
      'src/shop/index.ts'
    ])

    const again = await analyse(root, first.cache)
    expect(again.changed).toBe(false)
    expect(again.analysis.dependencies).toEqual(first.analysis.dependencies)

    write('src/shop/index.ts', "export * from './cart/cart'\nexport const two = 2\n")
    const edited = await analyse(root, again.cache)
    expect(edited.changed).toBe(true)
    expect(edited.cache.files['src/shop/index.ts']!.hash).not.toBe(
      again.cache.files['src/shop/index.ts']!.hash
    )
    // An analysis that changed throws away what an older one cached.
    expect((await analyse(root, { ...again.cache, version: -1 })).changed).toBe(true)
  })

  it('reads Java with the WebAssembly of tree-sitter, found next to its packages', async () => {
    const maven = fileURLToPath(
      new URL('../../structure/test/fixtures/maven-shop/', import.meta.url)
    )
    const { analysis, cache } = await analyse(maven, undefined)
    expect(analysis.dependencies.notAnalysed).toEqual([])
    expect(analysis.dependencies.dependencies).toHaveLength(11)
    expect(Object.values(cache.files).every(({ extraction }) => 'java' in extraction)).toBe(true)
  })

  it('keeps its cache in a file that a crash cannot leave half written', async () => {
    const { cache } = await analyse(root, undefined)
    const file = join(root, '..', `${root.split('/').at(-1)}-cache`, 'cache.json')
    await writeCache(file, cache)
    expect(await readCache(file)).toEqual(cache)
    expect(await readCache(join(root, 'no-such-cache.json'))).toBeUndefined()
    rmSync(dirname(file), { recursive: true, force: true })
  })
})

describe('a level as the window gets it', () => {
  let analysis: Analysis
  beforeAll(async () => {
    analysis = (await analyse(root, undefined)).analysis
  })

  it('names the nodes, counts their files, and says what was found on the way', () => {
    const view = viewOf('repo', analysis, undefined, false)
    expect(view.origin).toBe('declared')
    expect(view.nodes).toEqual([
      { kind: 'component', id: 'shop', name: 'Shop', files: 2 },
      { kind: 'component', id: 'billing', name: 'billing', files: 1 }
    ])
    expect(view.edges.map((edge) => `${edge.from} > ${edge.to} ${edge.weight}`)).toEqual([
      'billing > shop 1',
      'shop > billing 1'
    ])
    expect(view.cycles.map((cycle) => cycle.members)).toEqual([['billing', 'shop']])
    expect(view.problems).toEqual([
      { kind: 'dead-pattern', component: 'billing', key: 'paths', pattern: 'src/nothing/**' }
    ])
    expect(view.notResolvedCount).toBe(1)
    expect(view.notResolved).toEqual([
      { file: 'src/billing/invoice.ts', specifier: './gone', line: 2 }
    ])
    expect([view.sourceFiles, view.testFiles, view.javaFiles]).toEqual([4, 1, 0])
  })

  it('goes down into a Component, with the way back up', () => {
    const view = viewOf('repo', analysis, 'shop/cart', false)
    expect(view.path).toEqual([
      { id: 'shop', name: 'Shop' },
      { id: 'shop/cart', name: 'Cart' }
    ])
    expect(view.nodes).toEqual([
      { kind: 'source-file', id: 'src/shop/cart/cart.ts', name: 'cart.ts', files: 1 }
    ])
  })

  it('comes back to the top from below a Component that is gone', () => {
    const view = viewOf('repo', analysis, 'gone', false)
    expect(view.parent).toBeUndefined()
    expect(view.path).toEqual([])
  })

  it('includes test files on request', () => {
    const view = viewOf('repo', analysis, 'billing', true)
    expect(view.nodes.map((node) => node.name)).toEqual(['invoice.test.ts', 'invoice.ts'])
  })
})

describe('the Structures of the open repositories', () => {
  it('analyses a repository once, and again when asked to, then says so', async () => {
    const analysis = (await analyse(root, undefined)).analysis
    let runs = 0
    const changed: string[] = []
    const structures = new Structures(
      async () => {
        runs++
        return analysis
      },
      (id) => changed.push(id),
      false
    )
    await Promise.all([
      structures.view('repo', root, undefined, false),
      structures.view('repo', root, 'shop', false)
    ])
    expect(runs).toBe(1)

    structures.refresh('repo')
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(runs).toBe(2)
    expect(changed).toEqual(['repo'])

    await structures.close('repo')
    structures.refresh('repo')
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(runs).toBe(2)
  })
})
