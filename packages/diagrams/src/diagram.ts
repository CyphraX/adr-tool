/**
 * A Diagram as its file says it (docs/diagrams-format.md, section 2): read with `yaml`, never
 * written back through it. What the suite writes into the file it splices (ADR-0002).
 */
import { isMap, isScalar, isSeq, LineCounter, parseDocument, type Pair, type YAMLMap } from 'yaml'
import { isSegment } from '@adr-tool/structure/model'
import type { DiagramProblem, UnreadableDiagramProblem } from './problems'
import type { DiagramsSaid } from './sentences'

export type ViewLevel = 'system-context' | 'container' | 'component'

/** The view levels, from the outside in (docs/diagrams-format.md, section 3). */
export const VIEW_LEVELS: readonly ViewLevel[] = ['system-context', 'container', 'component']

export interface Point {
  readonly x: number
  readonly y: number
}

export interface Size {
  readonly width: number
  readonly height: number
}

interface Placed {
  /** The element ID: the Component ID, or the ID of an External System or the repository. */
  readonly id: string
  /** The top left corner of the box. */
  readonly at: Point
  /** The size of the box as written; without it, the box is as large as its text. */
  readonly size?: Size
  /** The line of the item in its file, from 1. */
  readonly line: number
}

/** A Component, by its Component ID. Its name and description are those of its declaration. */
export interface ComponentElement extends Placed {
  readonly kind: 'component'
}

/** An External System, or the repository itself as one box: a plain box with a name. */
export interface PlainElement extends Placed {
  readonly kind: 'external' | 'repository'
  /** The name in the box; the element ID when none is written. */
  readonly name: string
  readonly description?: string
}

export type Element = ComponentElement | PlainElement

export type ElementKind = Element['kind']

/** An arrow from the element that uses to the element that is used. */
export interface Connection {
  readonly from: string
  readonly to: string
  readonly label?: string
  /** The line of the item in its file, from 1. */
  readonly line: number
}

/** A Diagram that can be read: what its file says, and what is wrong with the file alone. */
export interface Diagram {
  readonly readable: true
  /** The file name without `.yml`. */
  readonly id: string
  /** Relative to the repository root. */
  readonly path: string
  readonly title?: string
  readonly description?: string
  /** `undefined` when the file has no level, or one the suite does not know. */
  readonly level?: ViewLevel
  /** Read at the level `component` only. */
  readonly scope?: string
  /** The line of `scope`, from 1, where there is one. */
  readonly scopeLine?: number
  /** Every item of `elements`, as written: a second one of an ID is here too, and not read. */
  readonly elements: readonly Element[]
  /** Every item of `connections`, as written. */
  readonly connections: readonly Connection[]
  /** What is wrong with the file alone, without looking at the declaration of Components. */
  readonly problems: readonly DiagramProblem[]
}

/** A Diagram whose file cannot be read. Nothing else is said about it. */
export interface UnreadableDiagram {
  readonly readable: false
  readonly id: string
  readonly path: string
  readonly problems: readonly [UnreadableDiagramProblem]
}

/** The ID of the Diagram at `path`: its file name without `.yml`. */
export function diagramIdOf(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1)
  return name.endsWith('.yml') ? name.slice(0, -'.yml'.length) : name
}

/** The key of an element that says which kind it is. */
const KINDS: readonly ElementKind[] = ['component', 'external', 'repository']

/** The keys the suite owns, at the top and in an item (docs/diagrams-format.md, section 2). */
const TOP_KEYS = ['title', 'description', 'level', 'scope', 'elements', 'connections']
const ELEMENT_KEYS = [...KINDS, 'name', 'description', 'at', 'size']
const CONNECTION_KEYS = ['from', 'to', 'label']

/** The value of a key the suite owns is not of the form the specification gives it. */
class WrongForm extends Error {
  constructor(readonly said: DiagramsSaid) {
    super(said.code)
  }
}

/** Read a Diagram from the text of its file. Never fails: what cannot be read says why. */
export function readDiagram(path: string, text: string): Diagram | UnreadableDiagram {
  const id = diagramIdOf(path)
  const lines = new LineCounter()
  const doc = parseDocument(text, { uniqueKeys: false, lineCounter: lines })
  const lineOf = (node: unknown): number => {
    const range = (node as { range?: readonly number[] | null } | null)?.range
    return range ? lines.linePos(range[0]!).line : 1
  }
  const unreadable = (detail: DiagramsSaid, line: number): UnreadableDiagram => ({
    readable: false,
    id,
    path,
    problems: [{ kind: 'unreadable-diagram', path, line, detail }]
  })

  if (doc.errors.length > 0) {
    const error = doc.errors[0]!
    const message = error.message.split('\n')[0]!.replace(/[:.]$/, '')
    return unreadable(
      { code: 'diagram-not-yaml', values: { message } },
      error.linePos?.[0].line ?? 1
    )
  }
  const top = emptyToNull(doc.contents)
  if (top !== null && !isMap(top)) {
    return unreadable({ code: 'diagram-not-map', values: {} }, lineOf(top))
  }
  try {
    return readContents(id, path, top, lineOf)
  } catch (error) {
    if (error instanceof WrongForm) {
      const line = (error.said.values as { line?: number }).line ?? 1
      return unreadable(error.said, line)
    }
    throw error
  }
}

function readContents(
  id: string,
  path: string,
  top: YAMLMap | null,
  lineOf: (node: unknown) => number
): Diagram {
  const at = (pair: Pair | undefined): number => lineOf(pair?.key ?? pair?.value)
  const pairOf = (map: YAMLMap | null, key: string): Pair | undefined =>
    map?.items.find((pair) => keyText(pair.key) === key)
  /**
   * A key the suite owns is written once in a map: which of two it is to read, nobody can
   * tell. Keys it does not know may repeat; they are not read.
   */
  const once = (map: YAMLMap | null, keys: readonly string[]): void => {
    const seen = new Set<string>()
    for (const pair of map?.items ?? []) {
      const key = keyText(pair.key)
      if (!keys.includes(key)) continue
      if (seen.has(key)) throw new WrongForm({ code: 'key-twice', values: { key, line: at(pair) } })
      seen.add(key)
    }
  }
  const textOf = (map: YAMLMap | null, key: string): string | undefined => {
    const pair = pairOf(map, key)
    const value = emptyToNull(pair?.value)
    if (pair === undefined || value === null) return undefined
    const text = scalarText(value)
    if (text === undefined) {
      throw new WrongForm({ code: 'diagram-key-not-text', values: { key, line: at(pair) } })
    }
    return text
  }
  const listOf = (key: 'elements' | 'connections'): YAMLMap[] => {
    const pair = pairOf(top, key)
    const value = emptyToNull(pair?.value)
    if (pair === undefined || value === null) return []
    if (!isSeq(value)) {
      throw new WrongForm({ code: 'diagram-key-not-list', values: { key, line: at(pair) } })
    }
    return value.items.map((item) => {
      if (!isMap(item)) {
        throw new WrongForm({ code: 'diagram-item-not-map', values: { key, line: lineOf(item) } })
      }
      once(item, key === 'elements' ? ELEMENT_KEYS : CONNECTION_KEYS)
      return item
    })
  }

  once(top, TOP_KEYS)
  const problems: DiagramProblem[] = []
  const title = textOf(top, 'title')
  const description = textOf(top, 'description')
  const written = textOf(top, 'level')
  const levelLine = at(pairOf(top, 'level'))
  const level = VIEW_LEVELS.find((known) => known === written)
  if (written === undefined) problems.push({ kind: 'no-level', path, line: 1 })
  else if (level === undefined) {
    problems.push({ kind: 'unknown-level', path, line: levelLine, level: written })
  }
  const writtenScope = textOf(top, 'scope')
  if (level === 'component' && writtenScope === undefined) {
    problems.push({ kind: 'no-scope', path, line: levelLine })
  }
  if (level !== undefined && level !== 'component' && writtenScope !== undefined) {
    problems.push({
      kind: 'scope-without-component-level',
      path,
      line: at(pairOf(top, 'scope')),
      level
    })
  }

  const elements = listOf('elements').map((item) => readElement(item, lineOf(item)))
  const connections = listOf('connections').map((item): Connection => {
    const line = lineOf(item)
    const end = (key: 'from' | 'to'): string => {
      const value = textOf(item, key)
      if (value === undefined) {
        throw new WrongForm({ code: 'connection-without-end', values: { key, line } })
      }
      return value
    }
    const label = textOf(item, 'label')
    return { from: end('from'), to: end('to'), ...(label !== undefined && { label }), line }
  })

  function readElement(item: YAMLMap, line: number): Element {
    const kinds = KINDS.filter((kind) => pairOf(item, kind) !== undefined)
    if (kinds.length === 0) throw new WrongForm({ code: 'element-without-kind', values: { line } })
    if (kinds.length > 1) throw new WrongForm({ code: 'element-of-two-kinds', values: { line } })
    const kind = kinds[0]!
    const elementId = textOf(item, kind)
    if (elementId === undefined) {
      throw new WrongForm({ code: 'diagram-key-not-text', values: { key: kind, line } })
    }
    const atPair = pairOf(item, 'at')
    if (atPair === undefined || emptyToNull(atPair.value) === null) {
      throw new WrongForm({ code: 'element-without-position', values: { line } })
    }
    const point = numbers(atPair.value)
    if (point === undefined) {
      throw new WrongForm({ code: 'position-not-a-point', values: { line: at(atPair) } })
    }
    const sizePair = pairOf(item, 'size')
    let size: Size | undefined
    if (sizePair !== undefined && emptyToNull(sizePair.value) !== null) {
      const pair = numbers(sizePair.value)
      if (pair === undefined || pair[0] <= 0 || pair[1] <= 0) {
        throw new WrongForm({ code: 'size-not-positive', values: { line: at(sizePair) } })
      }
      size = { width: pair[0], height: pair[1] }
    }
    const placed = { id: elementId, at: { x: point[0], y: point[1] }, ...(size && { size }), line }
    if (kind === 'component') return { kind, ...placed }
    const elementDescription = textOf(item, 'description')
    return {
      kind,
      ...placed,
      name: textOf(item, 'name') ?? elementId,
      ...(elementDescription !== undefined && { description: elementDescription })
    }
  }

  problems.push(
    ...problemsOfElements(path, elements),
    ...problemsOfConnections(path, elements, connections)
  )
  return {
    readable: true,
    id,
    path,
    ...(title !== undefined && { title }),
    ...(description !== undefined && { description }),
    ...(level !== undefined && { level }),
    ...(level === 'component' &&
      writtenScope !== undefined && { scope: writtenScope, scopeLine: at(pairOf(top, 'scope')) }),
    elements,
    connections,
    problems
  }
}

/** The IDs of plain boxes are segments; no two elements share an ID. */
function problemsOfElements(path: string, elements: readonly Element[]): DiagramProblem[] {
  const problems: DiagramProblem[] = []
  const seen = new Set<string>()
  for (const element of elements) {
    if (element.kind !== 'component' && !isSegment(element.id)) {
      problems.push({ kind: 'invalid-element-id', path, line: element.line, id: element.id })
    }
    if (seen.has(element.id)) {
      problems.push({ kind: 'duplicate-element', path, line: element.line, id: element.id })
    }
    seen.add(element.id)
  }
  return problems
}

/** A connection joins two different elements of the Diagram, and two the same way only once. */
function problemsOfConnections(
  path: string,
  elements: readonly Element[],
  connections: readonly Connection[]
): DiagramProblem[] {
  const ids = new Set(elements.map((element) => element.id))
  const problems: DiagramProblem[] = []
  const seen = new Set<string>()
  for (const { from, to, line } of connections) {
    if (from === to) {
      problems.push({ kind: 'self-connection', path, line, id: from })
      continue
    }
    const unknown = [from, to].filter((id) => !ids.has(id))
    for (const id of unknown) problems.push({ kind: 'unknown-element', path, line, from, to, id })
    if (unknown.length > 0) continue
    const key = `${from}\n${to}`
    if (seen.has(key)) problems.push({ kind: 'duplicate-connection', path, line, from, to })
    seen.add(key)
  }
  return problems
}

/**
 * The elements that are read, in the order of the file: the first of each ID. A later one of
 * the same ID is a Problem, and neither drawn nor counted.
 */
export function elementsOf(diagram: Pick<Diagram, 'elements'>): Element[] {
  const seen = new Set<string>()
  return diagram.elements.filter((element) => {
    if (seen.has(element.id)) return false
    seen.add(element.id)
    return true
  })
}

/**
 * The connections that are read, in the order of the file: between two different elements
 * of the Diagram, the first of each pair of ends.
 */
export function connectionsOf(diagram: Pick<Diagram, 'elements' | 'connections'>): Connection[] {
  const ids = new Set(diagram.elements.map((element) => element.id))
  const seen = new Set<string>()
  return diagram.connections.filter(({ from, to }) => {
    const key = `${from}\n${to}`
    if (from === to || !ids.has(from) || !ids.has(to) || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Two finite numbers in a list, `[x, y]`. */
function numbers(node: unknown): [number, number] | undefined {
  if (!isSeq(node) || node.items.length !== 2) return undefined
  const values = node.items.map((item) =>
    isScalar(item) && typeof item.value === 'number' && Number.isFinite(item.value)
      ? item.value
      : undefined
  )
  const [first, second] = values
  return first === undefined || second === undefined ? undefined : [first, second]
}

/** `key:` without a value is a scalar that holds null, not null itself. */
const emptyToNull = (node: unknown): unknown =>
  node === undefined || node === null || (isScalar(node) && node.value === null) ? null : node

/** A key as the text it was written as. */
const keyText = (key: unknown): string => scalarText(key) ?? String(key)

/** A scalar as the text it stands for: `2` and `true` written as a name are text. */
function scalarText(node: unknown): string | undefined {
  if (!isScalar(node) || node.value === null || typeof node.value === 'object') return undefined
  return typeof node.value === 'string' ? node.value : (node.source ?? String(node.value))
}
