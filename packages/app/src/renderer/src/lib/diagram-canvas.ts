/**
 * What the canvas of the Diagrams module works out from what it holds: where a box goes, which
 * Components a level shows, how a new Diagram is placed, and in which order the boxes are read.
 * Nothing here reads or writes, or knows the window: a Diagram is changed only by its edits
 * (`DiagramEdit`), which `diagrams` makes line by line.
 */
import {
  geometryOf,
  type Diagram,
  type NewDiagram,
  type NewElement,
  type PlacedBox,
  type Point,
  type SuggestedConnection,
  type ViewLevel
} from '@adr-tool/diagrams'
import { everyComponent, isSegment, type DeclaredComponent } from '@adr-tool/structure/model'
import type { DiagramEntry } from '../../../shared/diagrams'
import { NODE, layoutGraph } from './graph-layout'
import { fold } from './search'

/** The grid a box snaps to when it is dragged or placed, in px. */
export const GRID = 20

/** How far from the top left the first box stands, and the room between two boxes. */
const MARGIN = 40
const GAP = { x: 80, y: 40 }

export const snap = (value: number): number => Math.round(value / GRID) * GRID + 0

export const snapPoint = (point: Point): Point => ({ x: snap(point.x), y: snap(point.y) })

const parentOf = (id: string): string => (id.includes('/') ? id.slice(0, id.lastIndexOf('/')) : '')

/**
 * The declared Components a Diagram of a level shows, in the order of their declaration: at the
 * top level for a container view; for the component view of a scope its parts, then the
 * Components beside it and beside what contains it (docs/diagrams-format.md, section 3); none in
 * a system context, which shows the repository as one box. Without a level, every one.
 */
export function componentsOfLevel(
  declared: readonly DeclaredComponent[],
  level: ViewLevel | undefined,
  scope: string | undefined
): DeclaredComponent[] {
  const every = everyComponent(declared)
  switch (level) {
    case undefined:
      return every
    case 'system-context':
      return []
    case 'container':
      return [...declared]
    case 'component': {
      if (scope === undefined || !every.some((component) => component.id === scope)) return []
      const line: string[] = []
      for (let id = scope; id !== ''; id = parentOf(id)) line.push(id)
      const parts = every.filter((component) => parentOf(component.id) === scope)
      const beside = every.filter(
        (component) =>
          !line.includes(component.id) && line.some((id) => parentOf(id) === parentOf(component.id))
      )
      return [...parts, ...beside]
    }
  }
}

/** The Components that have parts, which a component view can look into. */
export const scopesOf = (declared: readonly DeclaredComponent[]): DeclaredComponent[] =>
  everyComponent(declared).filter((component) => component.children.length > 0)

/** Where a box that is added goes: at the left, below everything there is. */
export function freeSpot(boxes: readonly Pick<PlacedBox, 'x' | 'y' | 'height'>[]): Point {
  if (boxes.length === 0) return { x: MARGIN, y: MARGIN }
  const left = Math.min(...boxes.map((box) => box.x))
  const bottom = Math.max(...boxes.map((box) => box.y + box.height))
  return { x: snap(left), y: snap(bottom + GAP.y) }
}

/**
 * An element ID made from a name, as an External System is given one: lowercase, words joined
 * by dashes, and another number where the Diagram has the ID already.
 */
export function idFromName(name: string, taken: ReadonlySet<string>): string {
  const base =
    fold(name)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'system'
  if (!taken.has(base)) return base
  for (let number = 2; ; number++) {
    if (!taken.has(`${base}-${number}`)) return `${base}-${number}`
  }
}

/** Whether an ID can be an element's or a Diagram's: a segment, as the format says. */
export const isElementId = (id: string): boolean => isSegment(id)

/** The boxes as they are read, and as the keyboard goes through them: top to bottom, left to right. */
export function readingOrder<B extends Pick<PlacedBox, 'x' | 'y' | 'height'>>(
  boxes: readonly B[]
): B[] {
  // Boxes whose tops are less than half a box apart stand in one row.
  const rows: B[][] = []
  for (const box of boxes.toSorted((a, b) => a.y - b.y || a.x - b.x)) {
    const row = rows.at(-1)
    if (row && box.y - row[0]!.y < row[0]!.height / 2) row.push(box)
    else rows.push([box])
  }
  return rows.flatMap((row) => row.toSorted((a, b) => a.x - b.x))
}

/** The box under a point of the canvas, the topmost first: the one drawn last. */
export function boxAt<B extends Pick<PlacedBox, 'x' | 'y' | 'width' | 'height'>>(
  boxes: readonly B[],
  point: Point
): B | undefined {
  return boxes.findLast(
    (box) =>
      point.x >= box.x &&
      point.x <= box.x + box.width &&
      point.y >= box.y &&
      point.y <= box.y + box.height
  )
}

/** What a new Diagram starts from, as the dialog describes it. */
export interface NewDiagramStart {
  readonly id: string
  readonly title: string
  readonly level: ViewLevel
  readonly scope: string | undefined
  /** The repository as the one box of a system context. */
  readonly repository: { readonly id: string; readonly name: string }
  readonly declared: readonly DeclaredComponent[]
  /** The connections the code has between the Components of the level. */
  readonly suggestions: readonly SuggestedConnection[]
}

/**
 * A new Diagram of a level: its Components placed in columns as Structure lays out a level —
 * what is used left of what uses it, the rows ordered so that few lines cross —, spaced for the
 * boxes the picture draws, and every connection the code has between them drawn. A system
 * context starts with the repository alone.
 */
export function newDiagramOf(start: NewDiagramStart): NewDiagram {
  const words = start.title.trim() === '' ? {} : { title: start.title.trim() }
  if (start.level === 'system-context') {
    return {
      id: start.id,
      ...words,
      level: 'system-context',
      elements: [
        {
          kind: 'repository',
          id: start.repository.id,
          name: start.repository.name,
          at: { x: MARGIN, y: MARGIN }
        }
      ],
      connections: []
    }
  }
  const components = componentsOfLevel(start.declared, start.level, start.scope)
  const ids = components.map((component) => component.id)
  const shown = new Set(ids)
  const connections = start.suggestions
    .filter(({ from, to, throughScope }) => !throughScope && shown.has(from) && shown.has(to))
    .map(({ from, to }) => ({ from, to }))
  const layout = layoutGraph(ids, connections, { keepUnconnected: true })

  // The sizes of the boxes, as the picture draws them, decide the room between them.
  const measured = geometryOf(
    {
      elements: ids.map((id, position) => ({
        kind: 'component' as const,
        id,
        at: { x: 0, y: 0 },
        line: position + 1
      })),
      connections: []
    } satisfies Pick<Diagram, 'elements' | 'connections'>,
    { origin: 'declared', components: start.declared }
  )
  const sizeOf = new Map(measured.boxes.map((box) => [box.id, box]))
  const layers = new Map<number, typeof layout.nodes>()
  for (const node of layout.nodes) layers.set(node.layer, [...(layers.get(node.layer) ?? []), node])

  const at = new Map<string, Point>()
  let x = MARGIN
  for (const layer of [...layers.keys()].sort((a, b) => a - b)) {
    const nodes = layers.get(layer)!.toSorted((a, b) => a.y - b.y)
    const width = Math.max(...nodes.map((node) => sizeOf.get(node.id)!.width))
    let below = MARGIN
    for (const node of nodes) {
      // As far down as the layout puts it, relative to the others, and never on the box above.
      const y = Math.max(below, snap(MARGIN + (node.y - NODE.padding) * 2.5))
      at.set(node.id, { x: snap(x), y: snap(y) })
      below = snap(y) + sizeOf.get(node.id)!.height + GAP.y
    }
    x += width + GAP.x
  }
  const elements: NewElement[] = ids.map((id) => ({ kind: 'component', id, at: at.get(id)! }))
  return {
    id: start.id,
    ...words,
    level: start.level,
    ...(start.level === 'component' && start.scope !== undefined && { scope: start.scope }),
    elements,
    connections
  }
}

/** A Diagram as a search finds it: by its ID and its title. */
export interface DiagramHit {
  readonly path: string
  readonly id: string
  readonly title: string | undefined
  readonly score: number
}

/** The Diagrams whose ID or title has every word of the query, the best first. */
export function searchDiagrams(entries: readonly DiagramEntry[], query: string): DiagramHit[] {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const hits: DiagramHit[] = []
  for (const entry of entries) {
    const [id, title] = [fold(entry.id), fold(entry.title ?? '')]
    let score = 0
    for (const word of words) {
      const found = title.includes(word) ? 2 : id.includes(word) ? 1 : 0
      if (found === 0) {
        score = 0
        break
      }
      score += found
    }
    if (score > 0) hits.push({ path: entry.path, id: entry.id, title: entry.title, score })
  }
  return hits.sort((a, b) => b.score - a.score)
}
