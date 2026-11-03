import { describe, expect, it } from 'vitest'
import type { DiagramProblem, SuggestedConnection } from '@adr-tool/diagrams'
import type { DeclaredComponent } from '@adr-tool/structure/model'
import type { DiagramEntry, DiagramsOverview } from '../src/shared/diagrams'
import {
  GRID,
  boxAt,
  componentsOfLevel,
  freeSpot,
  idFromName,
  isElementId,
  newDiagramOf,
  readingOrder,
  scopesOf,
  searchDiagrams,
  snap
} from '../src/renderer/src/lib/diagram-canvas'
import { diagramsCount, diagramsSection } from '../src/renderer/src/lib/diagrams-problems'

// docs/plan-vision.md, part 7: what the canvas of the Diagrams module works out by itself.

const component = (
  id: string,
  children: readonly DeclaredComponent[] = [],
  name = id.split('/').at(-1)!
): DeclaredComponent => ({ id, name, paths: [], tests: [], children })

const DECLARED: DeclaredComponent[] = [
  component('web'),
  component('shop', [
    component('shop/cart'),
    component('shop/orders', [component('shop/orders/lines')])
  ]),
  component('billing', [], 'Billing service')
]

const suggestion = (from: string, to: string, throughScope = false): SuggestedConnection => ({
  from,
  to,
  weight: 1,
  typeOnly: false,
  dependencies: [],
  throughScope,
  drawn: false
})

describe('the Components a level shows', () => {
  it('are the top level in a container view, and none in a system context', () => {
    const ids = (level: Parameters<typeof componentsOfLevel>[1], scope?: string): string[] =>
      componentsOfLevel(DECLARED, level, scope).map(({ id }) => id)
    expect(ids('container')).toEqual(['web', 'shop', 'billing'])
    expect(ids('system-context')).toEqual([])
    expect(ids(undefined)).toEqual([
      'web',
      'shop',
      'shop/cart',
      'shop/orders',
      'shop/orders/lines',
      'billing'
    ])
  })

  it('are the parts of the scope in a component view, then what stands beside it and beside what contains it, as declared', () => {
    const ids = (scope: string | undefined): string[] =>
      componentsOfLevel(DECLARED, 'component', scope).map(({ id }) => id)
    expect(ids('shop')).toEqual(['shop/cart', 'shop/orders', 'web', 'billing'])
    expect(ids('shop/orders')).toEqual(['shop/orders/lines', 'web', 'shop/cart', 'billing'])
    expect(ids('nowhere')).toEqual([])
    expect(ids(undefined)).toEqual([])
  })

  it('can be looked into only where a Component has parts', () => {
    expect(scopesOf(DECLARED).map(({ id }) => id)).toEqual(['shop', 'shop/orders'])
  })
})

describe('where a box goes', () => {
  it('snaps to the grid of 20px, without a negative zero', () => {
    expect(GRID).toBe(20)
    expect([snap(9), snap(10), snap(31), snap(-4)]).toEqual([0, 20, 40, 0])
    expect(Object.is(snap(-4), 0)).toBe(true)
  })

  it('is at the left, below everything, when it is added', () => {
    expect(freeSpot([])).toEqual({ x: 40, y: 40 })
    expect(
      freeSpot([
        { x: 120, y: 40, height: 60 },
        { x: 60, y: 200, height: 56 }
      ])
    ).toEqual({ x: 60, y: 300 })
  })

  it('is found under a point, the box drawn last first', () => {
    const boxes = [
      { id: 'a', x: 0, y: 0, width: 100, height: 60 },
      { id: 'b', x: 80, y: 40, width: 100, height: 60 }
    ]
    expect(boxAt(boxes, { x: 10, y: 10 })?.id).toBe('a')
    expect(boxAt(boxes, { x: 90, y: 50 })?.id).toBe('b')
    expect(boxAt(boxes, { x: 300, y: 50 })).toBeUndefined()
  })

  it('is read top to bottom, and left to right in a row', () => {
    const boxes = [
      { id: 'c', x: 0, y: 200, height: 60 },
      { id: 'b', x: 300, y: 20, height: 60 },
      { id: 'a', x: 0, y: 40, height: 60 }
    ]
    expect(readingOrder(boxes).map(({ id }) => id)).toEqual(['a', 'b', 'c'])
  })
})

describe('the ID of an External System', () => {
  it('is made from its name, and numbered where the Diagram has it', () => {
    expect(idFromName('GitHub', new Set())).toBe('github')
    expect(idFromName('  File system  ', new Set())).toBe('file-system')
    expect(idFromName('Zahlungsdienst Ärzte', new Set())).toBe('zahlungsdienst-arzte')
    expect(idFromName('GitHub', new Set(['github', 'github-2']))).toBe('github-3')
    expect(idFromName('…', new Set())).toBe('system')
  })

  it('is a segment, as the format says', () => {
    expect(isElementId('file-system')).toBe(true)
    expect(isElementId('a/b')).toBe(false)
    expect(isElementId('')).toBe(false)
  })
})

describe('a new Diagram', () => {
  const start = {
    id: 'containers',
    title: ' The containers ',
    repository: { id: 'shop-repo', name: 'shop' },
    declared: DECLARED,
    suggestions: [
      suggestion('web', 'shop'),
      suggestion('shop', 'billing'),
      suggestion('shop', 'web', true)
    ]
  }

  it('of the system context starts with the repository alone', () => {
    expect(newDiagramOf({ ...start, level: 'system-context', scope: undefined })).toEqual({
      id: 'containers',
      title: 'The containers',
      level: 'system-context',
      elements: [{ kind: 'repository', id: 'shop-repo', name: 'shop', at: { x: 40, y: 40 } }],
      connections: []
    })
  })

  it('of a level shows its Components on the grid, apart, with what the code has between them', () => {
    const diagram = newDiagramOf({ ...start, title: '', level: 'container', scope: undefined })
    expect(diagram).not.toHaveProperty('title')
    expect(diagram.elements.map(({ id }) => id)).toEqual(['web', 'shop', 'billing'])
    expect(diagram.connections).toEqual([
      { from: 'web', to: 'shop' },
      { from: 'shop', to: 'billing' }
    ])
    const at = new Map(diagram.elements.map(({ id, at }) => [id, at]))
    for (const { x, y } of at.values()) expect([x % GRID, y % GRID]).toEqual([0, 0])
    // A chain stands in three columns, one beside the other.
    const xs = ['web', 'shop', 'billing'].map((id) => at.get(id)!.x)
    expect(new Set(xs).size).toBe(3)
    expect(Math.min(...xs)).toBe(40)
  })

  it('of a component view keeps its scope, and leaves out what goes through it', () => {
    const diagram = newDiagramOf({
      ...start,
      level: 'component',
      scope: 'shop',
      suggestions: [suggestion('shop/cart', 'shop/orders'), suggestion('shop', 'web', true)]
    })
    expect(diagram.scope).toBe('shop')
    expect(diagram.elements.map(({ id }) => id)).toEqual([
      'shop/cart',
      'shop/orders',
      'web',
      'billing'
    ])
    expect(diagram.connections).toEqual([{ from: 'shop/cart', to: 'shop/orders' }])
    // Unconnected boxes in one column do not stand on each other.
    const boxes = diagram.elements.map(({ at }) => at)
    const pairs = boxes.flatMap((a, i) => boxes.slice(i + 1).map((b) => [a, b] as const))
    for (const [a, b] of pairs) expect(a.x !== b.x || Math.abs(a.y - b.y) >= 40).toBe(true)
  })
})

describe('the search of Diagrams', () => {
  const entry = (id: string, title?: string): DiagramEntry => ({
    id,
    path: `docs/architecture/diagrams/${id}.yml`,
    picture: `docs/architecture/diagrams/${id}.svg`,
    text: '',
    readable: true,
    ...(title !== undefined && { title }),
    problems: []
  })
  const entries = [
    entry('packages', 'The packages of the suite'),
    entry('containers'),
    entry('suite-context')
  ]

  it('finds them by title before ID, every word in one of them', () => {
    expect(searchDiagrams(entries, 'suite').map(({ id }) => id)).toEqual([
      'packages',
      'suite-context'
    ])
    expect(searchDiagrams(entries, 'CONTAIN').map(({ id }) => id)).toEqual(['containers'])
    expect(searchDiagrams(entries, 'packages nothing')).toEqual([])
    expect(searchDiagrams(entries, '  ')).toEqual([])
  })
})

describe('the Diagrams in the Problems of the repository', () => {
  const gone: DiagramProblem = {
    kind: 'component-gone',
    component: 'old',
    path: 'docs/architecture/diagrams/packages.yml',
    line: 4
  }
  const stale: DiagramProblem = {
    kind: 'stale-picture',
    picture: 'docs/architecture/diagrams/packages.svg',
    path: 'docs/architecture/diagrams/packages.yml',
    line: 1
  }
  const overview = (origin: 'declared' | 'draft'): DiagramsOverview => ({
    repositoryId: 'r1',
    directory: 'docs/architecture/diagrams',
    config: {
      kind: 'unreadable-config',
      path: '.arch/config.yml',
      line: 2,
      said: { code: 'config-not-map', values: {} }
    },
    problems: [{ kind: 'invalid-diagrams-directory', path: '.arch/config.yml', line: 3 }],
    declared: { origin, unreadable: false, components: [] },
    diagrams: [{ ...searchEntry(), problems: [gone, stale] }],
    analysed: false
  })
  const searchEntry = (): DiagramEntry => ({
    id: 'packages',
    path: 'docs/architecture/diagrams/packages.yml',
    picture: 'docs/architecture/diagrams/packages.svg',
    text: '',
    readable: true,
    title: 'The packages',
    problems: []
  })

  it('are read, failed, or known', () => {
    expect(diagramsSection({ overview: undefined, reading: true, failed: undefined })).toEqual({
      state: 'reading'
    })
    expect(diagramsSection({ overview: undefined, reading: false, failed: 'gone' })).toEqual({
      state: 'failed',
      reason: 'gone'
    })
    expect(diagramsCount({ state: 'reading' })).toBe(0)
  })

  it('count the settings once and each Problem, with a Repair where there is one', () => {
    const section = diagramsSection({
      overview: overview('declared'),
      reading: false,
      failed: undefined
    })
    expect(diagramsCount(section)).toBe(4)
    if (section.state !== 'known') throw new Error(section.state)
    expect(
      section.entries.map(({ problem, diagram, repairable }) => [
        problem.kind,
        diagram?.id,
        repairable
      ])
    ).toEqual([
      ['invalid-diagrams-directory', undefined, false],
      ['component-gone', 'packages', true],
      ['stale-picture', 'packages', true]
    ])
  })

  it('take out an element whose Component is gone only against a declaration', () => {
    const section = diagramsSection({
      overview: overview('draft'),
      reading: false,
      failed: undefined
    })
    if (section.state !== 'known') throw new Error(section.state)
    expect(section.entries.map(({ repairable }) => repairable)).toEqual([false, false, true])
  })
})
