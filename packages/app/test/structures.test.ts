import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { levelOf, metricsOf, propagationCostOf } from '@adr-tool/structure/model'
import { analyse, readCache, writeCache, type Analysis } from '../src/main/analysis'
import { readSourceFile, Structures, viewOf } from '../src/main/structures'

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
    expect(analysis.dependencies.dependencies).toHaveLength(13)
    expect(Object.values(cache.files).every(({ extraction }) => 'java' in extraction)).toBe(true)
    // Its numbers are a lower bound, and its pages say so.
    const view = viewOf('maven', analysis, undefined, false)
    const pages = view.components
    expect(pages.map((page) => [page.id, page.java])).toEqual([
      ['cart', true],
      ['catalog', true],
      ['web', true]
    ])
    // The main sequence of its modules, and the functions of the cart, the most complex first.
    expect(
      view.nodes.map(({ id, metrics }) => [id, metrics?.abstractness, metrics?.instability])
    ).toEqual([
      ['cart', 0, 0.5],
      ['catalog', 1 / 3, 0],
      ['web', 0, 1]
    ])
    expect(view.propagationCost).toBe(0.5)
    const cart = pages.find((page) => page.id === 'cart')!
    expect(cart.functionCount).toBe(4)
    expect(cart.functions.map(({ name, line, complexity }) => [name, line, complexity])).toEqual([
      ['Cart.discount(long)', 19, 5],
      ['Cart.add(Product)', 10, 1],
      ['Cart.total()', 14, 1],
      ['Line.cents()', 7, 1]
    ])
    expect(cart.functions[0]!.file).toBe('cart/src/main/java/com/shop/cart/Cart.java')
    expect(cart.classes).toEqual([])
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
    // index.ts has two lines since the cache test above.
    expect(
      view.nodes.map(({ kind, id, name, files, lines }) => ({ kind, id, name, files, lines }))
    ).toEqual([
      { kind: 'component', id: 'shop', name: 'Shop', files: 2, lines: 3 },
      { kind: 'component', id: 'billing', name: 'billing', files: 1, lines: 2 }
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
      { kind: 'source-file', id: 'src/shop/cart/cart.ts', name: 'cart.ts', files: 1, lines: 1 }
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

  it('gives each Component of the level the metrics structure computes, and other nodes a size', () => {
    const { structure, dependencies } = analysis
    const metrics = metricsOf(
      structure,
      dependencies.dependencies,
      dependencies.lineCounts,
      {},
      dependencies.measures
    )
    const view = viewOf('repo', analysis, undefined, false)
    expect(view.nodes.map((node) => node.metrics)).toEqual([
      metrics.get('shop'),
      metrics.get('billing')
    ])
    expect(view.nodes[0]!.metrics).toMatchObject({
      efferent: 1,
      afferent: 1,
      instability: 0.5,
      fanOut: 1,
      fanIn: 1,
      cohesion: 1,
      internalShare: 1 / 3
    })
    expect(viewOf('repo', analysis, 'shop/cart', false).nodes[0]!.metrics).toBeUndefined()
  })

  it('lays the level out as a matrix, with the Components asked for expanded where they stood', () => {
    const view = viewOf('repo', analysis, undefined, false, ['shop', 'gone'])
    expect(view.matrix.rows.map((row) => [row.kind, row.id, row.depth, row.expandable])).toEqual([
      ['component', 'shop/cart', 1, true],
      ['own-files', 'shop', 1, false],
      ['component', 'billing', 0, true]
    ])
    expect(view.matrix.expanded).toEqual(['shop'])
    expect(view.matrix.groups).toEqual([{ id: 'shop', name: 'Shop', depth: 0, first: 0, last: 1 }])
    expect(view.matrix.cycles).toEqual([{ first: 0, last: 2, typeOnly: false }])
    expect(view.matrix.cells.map((cell) => `${cell.from} > ${cell.to} ${cell.weight}`)).toEqual([
      'billing > shop/cart 1',
      'shop > shop/cart 1',
      'shop/cart > billing 1'
    ])
  })

  it('gives every Component it shows a page: declaration, metrics, Dependencies at its level, Cycles', () => {
    const view = viewOf('repo', analysis, undefined, false, ['shop'])
    expect(view.components.map((component) => component.id)).toEqual([
      'shop',
      'billing',
      'shop/cart'
    ])
    const shop = view.components[0]!
    expect(shop).toMatchObject({
      id: 'shop',
      name: 'Shop',
      paths: ['src/shop/**'],
      tests: [],
      level: undefined,
      files: ['src/shop/cart/cart.ts', 'src/shop/index.ts'],
      testFiles: 0,
      java: false,
      dependsOn: [
        { kind: 'component', id: 'billing', name: 'billing', weight: 1, typeOnly: false }
      ],
      usedBy: [{ kind: 'component', id: 'billing', name: 'billing', weight: 1, typeOnly: true }],
      cycles: [
        {
          roundTrip: [
            { kind: 'component', id: 'billing', name: 'billing' },
            { kind: 'component', id: 'shop', name: 'Shop' }
          ],
          typeOnly: false
        }
      ]
    })
    expect(shop.metrics).toEqual(view.nodes[0]!.metrics)
    // Its test file is counted among its test files, and listed only when tests are included.
    expect(view.components[1]).toMatchObject({
      id: 'billing',
      files: ['src/billing/invoice.ts'],
      testFiles: 1
    })
    expect(
      viewOf('repo', analysis, undefined, true).components.find((page) => page.id === 'billing')!
        .files
    ).toEqual(['src/billing/invoice.test.ts', 'src/billing/invoice.ts'])
    // Below shop, cart is used by the files shop owns itself.
    expect(view.components[2]).toMatchObject({
      level: 'shop',
      dependsOn: [],
      usedBy: [{ kind: 'own-files', id: 'shop', name: 'Shop', weight: 1, typeOnly: false }],
      cycles: []
    })
  })
})

// The done-when of part 5 (docs/plan-structure.md): what the window gets for this repository
// are the numbers `structure` computes, which its own tests check against the definitions.
describe('this repository, as the window gets it', () => {
  let analysis: Analysis
  beforeAll(async () => {
    analysis = (await analyse(fileURLToPath(new URL('../../../', import.meta.url)), undefined))
      .analysis
  })

  it('shows the metrics structure computes for each Component', () => {
    const { structure, dependencies } = analysis
    const metrics = metricsOf(
      structure,
      dependencies.dependencies,
      dependencies.lineCounts,
      {},
      dependencies.measures
    )
    const view = viewOf('repo', analysis, undefined, false)
    expect(view.nodes.map((node) => node.id)).toEqual([
      'app',
      'cli',
      'conformance',
      'core',
      'kernel',
      'mcp',
      'structure',
      '(unassigned)'
    ])
    for (const node of view.nodes.filter((node) => node.kind === 'component')) {
      expect(node.metrics).toEqual(metrics.get(node.id))
    }
    expect(view.nodes.find((node) => node.id === 'kernel')!.metrics!.instability).toBe(0)
    expect(view.propagationCost).toBe(
      propagationCostOf(levelOf(structure, dependencies.dependencies)!)
    )
    // Nothing above the diagonal: this repository has no Cycle.
    const rows = view.matrix.rows.map((row) => row.id)
    expect(
      view.matrix.cells.filter((cell) => rows.indexOf(cell.from) < rows.indexOf(cell.to))
    ).toEqual([])
  })

  // The done-when of part 8: below a Component without children, its directories.
  it('opens the renderer onto its directories and its own files, and those onto theirs', () => {
    const renderer = viewOf('repo', analysis, 'app/renderer', false)
    const kinds = (nodes: readonly { kind: string; name: string }[]) =>
      nodes.map((node) => `${node.kind} ${node.name}`)
    expect(kinds(renderer.nodes).sort()).toEqual(
      [
        'directory components',
        'directory lib',
        'source-file App.svelte',
        'source-file env.d.ts',
        'source-file main.ts'
      ].sort()
    )
    for (const node of renderer.nodes.filter((node) => node.kind === 'directory')) {
      expect(node.metrics).toBeDefined()
    }
    const lib = renderer.components.find((page) => page.id === 'app/renderer/lib')!
    expect(lib).toMatchObject({
      name: 'lib',
      directory: 'packages/app/src/renderer/src/lib',
      level: 'app/renderer',
      paths: [],
      tests: []
    })
    expect(lib.files).toContain('packages/app/src/renderer/src/lib/strings.ts')

    const inside = viewOf('repo', analysis, 'app/renderer/lib', false)
    expect(inside.parent).toBe('app/renderer/lib')
    expect(inside.path).toEqual([
      { id: 'app', name: 'app' },
      { id: 'app/renderer', name: 'renderer' },
      { id: 'app/renderer/lib', name: 'lib' }
    ])
    expect(inside.nodes.every((node) => node.kind === 'source-file')).toBe(true)
    expect(inside.nodes.map((node) => node.name)).toContain('strings.ts')
    // The directories are the view's: what the window gets of the declaration stays as it is.
    expect(analysis.structure.components.find((c) => c.id === 'app')!.children).toHaveLength(4)
    expect(
      analysis.structure.components
        .find((c) => c.id === 'app')!
        .children.find((c) => c.id === 'app/renderer')!.children
    ).toEqual([])
  })
})

describe('a Source File for the code viewer', () => {
  let analysis: Analysis
  beforeAll(async () => {
    analysis = (await analyse(root, undefined)).analysis
  })

  it('is read as the disk has it, with its language', async () => {
    expect(await readSourceFile(root, 'src/billing/invoice.ts', analysis)).toEqual({
      ok: true,
      file: {
        path: 'src/billing/invoice.ts',
        language: 'typescript',
        text: "import type { Cart } from '../shop/cart/cart'\nimport x from './gone'\n"
      }
    })
  })

  it('is read only when the analysis lists it as a Source File', async () => {
    // The renderer names a file by the path the analysis gave it, and nothing else is read.
    for (const path of [
      '.arch/components.yml',
      '../outside.ts',
      `${root}/src/billing/invoice.ts`,
      'src/billing/gone.ts',
      'src/billing/../billing/invoice.ts'
    ]) {
      expect(await readSourceFile(root, path, analysis)).toMatchObject({ ok: false })
    }
  })

  it('is refused when it is too large to show, or gone since the analysis', async () => {
    expect(await readSourceFile(root, 'src/billing/invoice.ts', analysis, 20)).toMatchObject({
      ok: false,
      reason: expect.stringContaining('too large')
    })
    write('src/billing/brief.ts', 'export {}\n')
    const withBrief = (await analyse(root, undefined)).analysis
    rmSync(join(root, 'src/billing/brief.ts'))
    expect(await readSourceFile(root, 'src/billing/brief.ts', withBrief)).toMatchObject({
      ok: false
    })
  })

  it('is asked for through the Structures, which analyse first if need be', async () => {
    const structures = new Structures(
      async () => analysis,
      () => undefined,
      false
    )
    expect(await structures.sourceFile('repo', root, 'src/shop/index.ts')).toMatchObject({
      ok: true,
      file: { path: 'src/shop/index.ts' }
    })
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
