import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { drawDiagram, editDiagramText, readDiagram } from '@adr-tool/diagrams'
import { analyse, type Analysis } from '../src/main/analysis'
import { declaredOnDisk, isDiagram, lookOf, overviewOf } from '../src/main/diagrams'
import { nodeFileSystem } from '../src/main/node-file-system'

// What the Diagrams module of the window is told of a repository (shared/diagrams.ts): every
// Diagram with its Problems, and, once the code is analysed, its Drift.

let root: string
let analysis: Analysis

const write = (path: string, text: string): void => {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), text)
}

const DIRECTORY = 'docs/architecture/diagrams'
const CONTAINERS = `${DIRECTORY}/containers.yml`
const CONTAINERS_TEXT = [
  'title: The shop',
  'level: container',
  'elements:',
  '  - component: web',
  '    at: [40, 40]',
  '  - component: shop',
  '    at: [300, 40]',
  '  - component: billing',
  '    at: [560, 40]',
  '  - component: gone',
  '    at: [560, 200]',
  'connections:',
  '  - from: web',
  '    to: billing',
  ''
].join('\n')

beforeAll(async () => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'adr-tool-diagrams-')))
  write(
    '.arch/components.yml',
    [
      'components:',
      '  web: { paths: [src/web/**] }',
      '  shop: { name: Shop, paths: [src/shop/**] }',
      '  billing: { paths: [src/billing/**] }',
      ''
    ].join('\n')
  )
  write('src/web/page.ts', "import { cart } from '../shop/cart'\nexport const page = cart\n")
  write(
    'src/shop/cart.ts',
    "import { invoice } from '../billing/invoice'\nexport const cart = invoice\n"
  )
  write('src/billing/invoice.ts', 'export const invoice = 1\n')
  write(CONTAINERS, CONTAINERS_TEXT)
  write(`${DIRECTORY}/broken.yml`, 'level: container\nelements: [oops\n')
  write(`${DIRECTORY}/broken.svg`, '<svg/>\n')
  analysis = (await analyse(root, undefined)).analysis
})

afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('the Diagrams of a repository, as the window gets them', () => {
  it('lists each with its text and its Problems, before the code is analysed', async () => {
    const overview = await overviewOf('repo', nodeFileSystem(root))
    expect(overview).toMatchObject({
      repositoryId: 'repo',
      directory: DIRECTORY,
      problems: [],
      declared: { origin: 'declared', unreadable: false },
      analysed: false
    })
    expect(overview.declared.components.map((component) => component.id)).toEqual([
      'web',
      'shop',
      'billing'
    ])
    expect(overview.diagrams.map(({ id, readable, title }) => ({ id, readable, title }))).toEqual([
      { id: 'broken', readable: false, title: undefined },
      { id: 'containers', readable: true, title: 'The shop' }
    ])
    const [broken, containers] = overview.diagrams
    expect(broken!.problems.map((problem) => problem.kind)).toEqual(['unreadable-diagram'])
    expect(containers).toMatchObject({
      path: CONTAINERS,
      picture: `${DIRECTORY}/containers.svg`,
      text: CONTAINERS_TEXT,
      problems: [{ kind: 'component-gone', path: CONTAINERS, line: 10, component: 'gone' }]
    })
    expect(containers!.drift).toBeUndefined()
  })

  it('gives each its Drift once the code is analysed', async () => {
    const overview = await overviewOf('repo', nodeFileSystem(root), analysis)
    expect(overview.analysed).toBe(true)
    const containers = overview.diagrams.find((diagram) => diagram.id === 'containers')!
    expect(containers.drift!.map(({ kind, from, to }) => ({ kind, from, to }))).toEqual([
      { kind: 'connection-not-in-code', from: 'web', to: 'billing' },
      { kind: 'dependency-not-in-diagram', from: 'shop', to: 'billing' },
      { kind: 'dependency-not-in-diagram', from: 'web', to: 'shop' }
    ])
  })

  it('says of a picture that is not the Diagram as it is now that it is stale', async () => {
    const fs = nodeFileSystem(root)
    const diagram = readDiagram(CONTAINERS, CONTAINERS_TEXT)
    if (!diagram.readable) throw new Error('unreadable')
    const picture = `${DIRECTORY}/containers.svg`
    write(picture, drawDiagram(diagram, await declaredOnDisk(fs)))
    const current = await overviewOf('repo', fs)
    expect(current.diagrams[1]!.problems.map((problem) => problem.kind)).toEqual(['component-gone'])
    write(picture, '<svg xmlns="http://www.w3.org/2000/svg"/>\n')
    const stale = await overviewOf('repo', fs)
    expect(stale.diagrams[1]!.problems.at(-1)).toEqual({
      kind: 'stale-picture',
      path: CONTAINERS,
      line: 1,
      picture
    })
    rmSync(join(root, picture))
  })

  it('says that .arch/config.yml cannot be read, and looks for no Diagram until it can', async () => {
    write('.arch/config.yml', 'diagrams: [oops\n')
    try {
      const overview = await overviewOf('repo', nodeFileSystem(root))
      expect(overview.config?.kind).toBe('unreadable-config')
      expect(overview).toMatchObject({ directory: undefined, problems: [], diagrams: [] })
    } finally {
      rmSync(join(root, '.arch/config.yml'))
    }
  })

  it('takes nothing for a Diagram that the repository does not have as one', async () => {
    const fs = nodeFileSystem(root)
    expect(await isDiagram(fs, CONTAINERS)).toBe(true)
    expect(await isDiagram(fs, '.arch/components.yml')).toBe(false)
    expect(await isDiagram(fs, `${DIRECTORY}/../../../.arch/components.yml`)).toBe(false)
  })
})

describe('a Diagram as the window holds it', () => {
  it('has the Drift and the suggested connections of its text, saved or not', () => {
    const edited = editDiagramText(CONTAINERS, CONTAINERS_TEXT, [
      { kind: 'remove-element', id: 'gone' },
      { kind: 'remove-connection', from: 'web', to: 'billing' },
      { kind: 'add-connection', from: 'web', to: 'shop' }
    ])
    const look = lookOf(CONTAINERS, edited, analysis)
    expect(look.problems).toEqual([])
    expect(look.drift.map(({ kind, from, to }) => ({ kind, from, to }))).toEqual([
      { kind: 'dependency-not-in-diagram', from: 'shop', to: 'billing' }
    ])
    expect(look.suggestions.map(({ from, to, drawn }) => ({ from, to, drawn }))).toEqual([
      { from: 'shop', to: 'billing', drawn: false },
      { from: 'web', to: 'shop', drawn: true }
    ])
  })

  it('has its Problem and nothing else where its text cannot be read', () => {
    const look = lookOf(CONTAINERS, 'elements: [oops\n', analysis)
    expect(look.problems.map((problem) => problem.kind)).toEqual(['unreadable-diagram'])
    expect(look).toMatchObject({ drift: [], suggestions: [], analysed: true })
  })
})
