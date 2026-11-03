/**
 * The edits of a Diagram, as the window and agents make them (docs/diagrams-format.md, section
 * 2, "How the suite writes"): move an element, add one, take one out, name an External System,
 * connect two elements, take a connection out, label it. Each changes the lines it is about
 * and nothing else (ADR-0002) — a position is one line, an item is its lines, a key its line —
 * and is checked to read back as the Diagram it is meant to be; what cannot be written that
 * way is refused with a sentence.
 */
import { isMap, isScalar, isSeq, parseDocument, stringify, type Document, type YAMLMap } from 'yaml'
import { applyEdits, plan, type FileSystem, type Plan, type TextEdit } from '@adr-tool/kernel'
import { isSegment } from '@adr-tool/structure/model'
import {
  emptyToNull,
  MAX_COORDINATE,
  readDiagram,
  type Diagram,
  type Element,
  type Point
} from './diagram'
import {
  columnOf,
  comparable,
  endOfValueLine,
  isInline,
  itemLines,
  lineBreakOf,
  lineStart,
  listOf,
  mapsOf,
  pairOf,
  rangeOf,
  textAt
} from './lines'
import { refusal, refuse, type DiagramsSaid } from './sentences'

/** An element as an edit adds it: a Component by its ID, or a plain box with its words. */
export type NewElement =
  | { readonly kind: 'component'; readonly id: string; readonly at: Point }
  | {
      readonly kind: 'external' | 'repository'
      readonly id: string
      /** Without it, or empty, the box shows the element ID. */
      readonly name?: string
      readonly description?: string
      readonly at: Point
    }

/** A connection as an edit adds it. */
export interface NewConnection {
  readonly from: string
  readonly to: string
  readonly label?: string
}

/** One change of a Diagram, as the window holds it until it is saved. */
export type DiagramEdit =
  /** Put the box of an element elsewhere: its `at`. */
  | { readonly kind: 'move-element'; readonly id: string; readonly at: Point }
  /** A new element, at the end of `elements`. */
  | { readonly kind: 'add-element'; readonly element: NewElement }
  /** Take every element of the ID out, with the connections from and to it. */
  | { readonly kind: 'remove-element'; readonly id: string }
  /** The name and description of an External System or the repository; left out, they go. */
  | {
      readonly kind: 'describe-element'
      readonly id: string
      readonly name?: string
      readonly description?: string
    }
  /** A new connection, at the end of `connections`. */
  | ({ readonly kind: 'add-connection' } & NewConnection)
  /** Take the connections from one element to another out. */
  | { readonly kind: 'remove-connection'; readonly from: string; readonly to: string }
  /** The label of a connection; left out or empty, it goes. */
  | {
      readonly kind: 'relabel-connection'
      readonly from: string
      readonly to: string
      readonly label?: string
    }

const asText = (text: string): string => text

/** The keys of an item in the order the suite writes them (docs/diagrams-format.md, section 2). */
const ELEMENT_ORDER = ['component', 'external', 'repository', 'name', 'description', 'at', 'size']
const CONNECTION_ORDER = ['from', 'to', 'label']

/**
 * The text of a Diagram after `edits`, one after another, each on the text the one before
 * left. Refused, as a whole, where one of them cannot be made: the Diagram cannot be read, the
 * edit no longer applies, or it cannot be written without rewriting more than its lines.
 */
export function editDiagramText(path: string, text: string, edits: readonly DiagramEdit[]): string {
  let current = text
  for (const edit of edits) current = editOnce(path, current, edit)
  return current
}

/**
 * Plan `edits` against the Diagram at `path` as it is on disk now: one change of the lines they
 * touch. The window plans what it holds this way when it is saved, and an agent what it asks for.
 */
export function planDiagramEdit(
  fs: FileSystem,
  path: string,
  edits: readonly DiagramEdit[]
): Promise<Plan> {
  return plan(fs, asText, async (pending) => {
    if (edits.length === 0) return
    await pending.write(path, (text) => [spliceBetween(text, editDiagramText(path, text, edits))])
  })
}

/** The one edit that turns `before` into `after`: what lies between what they share at either end. */
export function spliceBetween(before: string, after: string): TextEdit {
  let start = 0
  const shorter = Math.min(before.length, after.length)
  while (start < shorter && before[start] === after[start]) start++
  let end = 0
  while (
    end < shorter - start &&
    before[before.length - 1 - end] === after[after.length - 1 - end]
  ) {
    end++
  }
  return { start, end: before.length - end, insert: after.slice(start, after.length - end) }
}

/** What an edit is said to be, inside the sentence of a refusal. */
function whatOf(edit: DiagramEdit): DiagramsSaid {
  switch (edit.kind) {
    case 'move-element':
      return { code: 'editing-move', values: { id: edit.id } }
    case 'add-element':
      return { code: 'editing-add', values: { id: edit.element.id } }
    case 'remove-element':
      return { code: 'editing-remove', values: { id: edit.id } }
    case 'describe-element':
      return { code: 'editing-describe', values: { id: edit.id } }
    case 'add-connection':
      return { code: 'editing-connect', values: { from: edit.from, to: edit.to } }
    case 'remove-connection':
      return { code: 'editing-disconnect', values: { from: edit.from, to: edit.to } }
    case 'relabel-connection':
      return { code: 'editing-label', values: { from: edit.from, to: edit.to } }
  }
}

/** A text as the suite writes it into YAML: on one line, quoted where YAML needs it. */
export function yamlText(value: string): string {
  const line = value.replace(/[\r\n\t]+/g, ' ')
  return stringify(line, { lineWidth: 0 }).replace(/\r?\n$/, '')
}

/** A point as the suite writes it: whole numbers, as a list in brackets on one line. */
const pointText = (at: Point): string => `[${Math.round(at.x) + 0}, ${Math.round(at.y) + 0}]`

function checkPoint(at: Point): void {
  const fine = (value: number): boolean =>
    Number.isFinite(value) && Math.abs(Math.round(value)) <= MAX_COORDINATE
  if (!fine(at.x) || !fine(at.y)) refuse({ code: 'invalid-position', values: {} })
}

/** The words of a box, as they are written: an empty one is none. */
const given = (value: string | undefined): string | undefined =>
  value === undefined || value.trim() === '' ? undefined : value.replace(/[\r\n\t]+/g, ' ')

/** One edit of the text, checked to read back as the Diagram it is meant to be. */
function editOnce(path: string, text: string, edit: DiagramEdit): string {
  const before = readDiagram(path, text)
  if (!before.readable) {
    refuse({ code: 'unreadable-diagram', values: { path, detail: before.problems[0].detail } })
  }
  const cannot = refusal({ code: 'cannot-edit-diagram', values: { path, edit: whatOf(edit) } })
  const doc = parseDocument(text, { uniqueKeys: false })
  const writer = new Writer(text, doc, () => cannot)
  const elementItem = (id: string): YAMLMap | undefined =>
    mapsOf(listOf(doc, 'elements')).find((item) =>
      ['component', 'external', 'repository'].some((kind) => textAt(item, kind) === id)
    )
  const connectionItems = (from: string, to: string): YAMLMap[] =>
    mapsOf(listOf(doc, 'connections')).filter(
      (item) => textAt(item, 'from') === from && textAt(item, 'to') === to
    )
  const shows = (id: string): boolean => before.elements.some((element) => element.id === id)
  const gone = (id: string): never =>
    refuse({ code: 'no-longer-shows', values: { path, component: id } })

  let expected: Pick<Diagram, 'elements' | 'connections'>
  let edits: TextEdit[]
  switch (edit.kind) {
    case 'move-element': {
      checkPoint(edit.at)
      const item = elementItem(edit.id) ?? gone(edit.id)
      const at = pairOf(item, 'at')?.value
      if (!isSeq(at) || !at.flow) throw cannot
      const [start, end] = rangeOf(at) ?? writer.cannot()
      edits = [{ start, end, insert: pointText(edit.at) }]
      const first = before.elements.findIndex((element) => element.id === edit.id)
      const rounded = { x: Math.round(edit.at.x) + 0, y: Math.round(edit.at.y) + 0 }
      expected = {
        elements: before.elements.map((element, index) =>
          index === first ? { ...element, at: rounded } : element
        ),
        connections: before.connections
      }
      break
    }
    case 'add-element': {
      const { element } = edit
      checkPoint(element.at)
      if (shows(element.id)) refuse({ code: 'already-shown', values: { path, id: element.id } })
      if (element.kind !== 'component' && !isSegment(element.id)) {
        refuse({ code: 'invalid-element-id', values: { id: element.id } })
      }
      const at = { x: Math.round(element.at.x) + 0, y: Math.round(element.at.y) + 0 }
      const keys = [`${element.kind}: ${yamlText(element.id)}`]
      let added: Element
      if (element.kind === 'component') {
        added = { kind: 'component', id: element.id, at, line: 0 }
      } else {
        const name = given(element.name)
        const description = given(element.description)
        if (name !== undefined) keys.push(`name: ${yamlText(name)}`)
        if (description !== undefined) keys.push(`description: ${yamlText(description)}`)
        added = {
          kind: element.kind,
          id: element.id,
          at,
          line: 0,
          name: name ?? element.id,
          ...(description !== undefined && { description })
        }
      }
      keys.push(`at: ${pointText(at)}`)
      edits = writer.append('elements', keys)
      expected = { elements: [...before.elements, added], connections: before.connections }
      break
    }
    case 'remove-element': {
      if (!shows(edit.id)) gone(edit.id)
      const elements = listOf(doc, 'elements')
      if (!elements || elements.flow) throw cannot
      const leaving = mapsOf(elements).filter((item) =>
        ['component', 'external', 'repository'].some((kind) => textAt(item, kind) === edit.id)
      )
      const connections = listOf(doc, 'connections')
      const unhooked = mapsOf(connections).filter(
        (item) => textAt(item, 'from') === edit.id || textAt(item, 'to') === edit.id
      )
      if (unhooked.length > 0 && connections!.flow) throw cannot
      edits = [...leaving, ...unhooked].map((item) => writer.remove(item))
      expected = {
        elements: before.elements.filter((element) => element.id !== edit.id),
        connections: before.connections.filter(
          (connection) => connection.from !== edit.id && connection.to !== edit.id
        )
      }
      break
    }
    case 'describe-element': {
      const first = before.elements.findIndex((element) => element.id === edit.id)
      const element = before.elements[first] ?? gone(edit.id)
      if (element.kind === 'component') {
        refuse({ code: 'named-by-declaration', values: { id: edit.id } })
      }
      const item = elementItem(edit.id) ?? gone(edit.id)
      const name = given(edit.name)
      const description = given(edit.description)
      // The two keys are written one after the other: the second is placed after the first.
      const named = applyEdits(text, writer.set(item, 'name', name, ELEMENT_ORDER))
      const again = parseDocument(named, { uniqueKeys: false })
      const itemAgain = mapsOf(listOf(again, 'elements')).find(
        (candidate) => textAt(candidate, element.kind) === edit.id
      )
      const described = applyEdits(
        named,
        new Writer(named, again, () => cannot).set(
          itemAgain ?? writer.cannot(),
          'description',
          description,
          ELEMENT_ORDER
        )
      )
      edits = [spliceBetween(text, described)]
      expected = {
        elements: before.elements.map((one, index) =>
          index === first && one.kind !== 'component'
            ? {
                kind: one.kind,
                id: one.id,
                at: one.at,
                ...(one.size && { size: one.size }),
                line: one.line,
                name: name ?? one.id,
                ...(description !== undefined && { description })
              }
            : one
        ),
        connections: before.connections
      }
      break
    }
    case 'add-connection': {
      const { from, to } = edit
      if (from === to) refuse({ code: 'connected-to-itself', values: { id: from } })
      if (!shows(from)) gone(from)
      if (!shows(to)) gone(to)
      if (before.connections.some((one) => one.from === from && one.to === to)) {
        refuse({ code: 'already-connected', values: { from, to } })
      }
      const label = given(edit.label)
      const keys = [`from: ${yamlText(from)}`, `to: ${yamlText(to)}`]
      if (label !== undefined) keys.push(`label: ${yamlText(label)}`)
      edits = writer.append('connections', keys)
      expected = {
        elements: before.elements,
        connections: [
          ...before.connections,
          { from, to, ...(label !== undefined && { label }), line: 0 }
        ]
      }
      break
    }
    case 'remove-connection': {
      const { from, to } = edit
      const items = connectionItems(from, to)
      if (items.length === 0) refuse({ code: 'not-connected', values: { path, from, to } })
      if (listOf(doc, 'connections')!.flow) throw cannot
      edits = items.map((item) => writer.remove(item))
      expected = {
        elements: before.elements,
        connections: before.connections.filter((one) => !(one.from === from && one.to === to))
      }
      break
    }
    case 'relabel-connection': {
      const { from, to } = edit
      const item = connectionItems(from, to)[0]
      if (!item) refuse({ code: 'not-connected', values: { path, from, to } })
      const label = given(edit.label)
      edits = writer.set(item, 'label', label, CONNECTION_ORDER)
      const first = before.connections.findIndex((one) => one.from === from && one.to === to)
      expected = {
        elements: before.elements,
        connections: before.connections.map((one, index) =>
          index === first
            ? { from: one.from, to: one.to, ...(label !== undefined && { label }), line: one.line }
            : one
        )
      }
      break
    }
  }

  const after = applyEdits(text, edits)
  const read = readDiagram(path, after)
  if (!read.readable || comparable(read) !== comparable({ ...before, ...expected })) throw cannot
  return after
}

/** What writes into the text of one Diagram, by its lines, or says that it cannot. */
class Writer {
  private readonly lineBreak: string

  constructor(
    private readonly text: string,
    private readonly doc: Document,
    private readonly refused: () => Error
  ) {
    this.lineBreak = lineBreakOf(text)
  }

  cannot(): never {
    throw this.refused()
  }

  /** Take the lines of an item out. */
  remove(item: unknown): TextEdit {
    const lines = itemLines(this.text, item) ?? this.cannot()
    return { ...lines, insert: '' }
  }

  /**
   * A new item at the end of `elements` or `connections`, in block style: its first key on the
   * line of its `-`, the others below it, as the items before it are indented. Where there is
   * no list yet, the key is written: `elements` before `connections`, `connections` at the end.
   */
  append(key: 'elements' | 'connections', keys: readonly string[]): TextEdit[] {
    const { text, lineBreak } = this
    const top = emptyToNull(this.doc.contents)
    if (top !== null && (!isMap(top) || top.flow)) this.cannot()
    const items = (dash: number, indent: number): string =>
      keys
        .map(
          (line, index) =>
            `${' '.repeat(index === 0 ? dash : indent)}${index === 0 ? '- ' : ''}${line}${lineBreak}`
        )
        .join('')
    const topColumn = top === null ? 0 : (columnOf(text, (top as YAMLMap).items[0]?.key) ?? 0)
    const pair = pairOf(top, key)
    const value = emptyToNull(pair?.value)

    if (pair !== undefined && isSeq(value) && !value.flow && value.items.length > 0) {
      const first = value.items[0]!
      const last = value.items.at(-1)!
      const [firstStart] = rangeOf(first) ?? this.cannot()
      const dash = text.lastIndexOf('-', firstStart)
      const dashColumn = dash - lineStart(text, dash)
      const keyColumn = firstStart - lineStart(text, firstStart)
      const [, lastEnd] = rangeOf(last) ?? this.cannot()
      const at = endOfValueLine(text, lastEnd) ?? this.cannot()
      const lead = at === text.length && !text.endsWith('\n') ? lineBreak : ''
      return [{ start: at, end: at, insert: lead + items(dashColumn, keyColumn) }]
    }

    const dashColumn = topColumn + 2
    if (pair !== undefined) {
      // `elements:` with nothing, `~`, `null` or `[]` after it: the items go below the key.
      const empty =
        value === null || (isSeq(value) && value.flow === true && value.items.length === 0)
      if (!empty) this.cannot()
      const keyEnd = rangeOf(pair.key)?.[1] ?? this.cannot()
      const colon = text.indexOf(':', keyEnd)
      const node = pair.value
      const nodeRange = isScalar(node) || isSeq(node) ? rangeOf(node) : undefined
      const removed =
        nodeRange && nodeRange[1] > nodeRange[0]
          ? { start: colon + 1, end: nodeRange[1], insert: '' }
          : undefined
      const lineDone = endOfValueLine(text, removed ? removed.end : colon + 1) ?? this.cannot()
      const lead = lineDone === text.length && !text.endsWith('\n') ? lineBreak : ''
      const insert = {
        start: lineDone,
        end: lineDone,
        insert: lead + items(dashColumn, dashColumn + 2)
      }
      return removed ? [removed, insert] : [insert]
    }

    const block = `${' '.repeat(topColumn)}${key}:${lineBreak}${items(dashColumn, dashColumn + 2)}`
    const connections = key === 'elements' ? pairOf(top, 'connections') : undefined
    if (connections !== undefined) {
      const at = lineStart(text, rangeOf(connections.key)?.[0] ?? this.cannot())
      return [{ start: at, end: at, insert: block }]
    }
    const lead = text === '' || text.endsWith('\n') ? '' : lineBreak
    return [{ start: text.length, end: text.length, insert: lead + block }]
  }

  /**
   * Set a key of an item to a text, on its line: the value is replaced where the key is there,
   * the key is written on a line of its own after the key before it in `order` where it is
   * not, and its line is taken out where the text is `undefined`.
   */
  set(item: YAMLMap, key: string, value: string | undefined, order: readonly string[]): TextEdit[] {
    const { text, lineBreak } = this
    if (item.flow) this.cannot()
    const pair = pairOf(item, key)
    if (value === undefined) {
      if (pair === undefined) return []
      // The key on a line of its own, not on the line of the item's `-`.
      const [keyStart] = rangeOf(pair.key) ?? this.cannot()
      const start = lineStart(text, keyStart)
      if (text.slice(start, keyStart).trim() !== '') this.cannot()
      const node = emptyToNull(pair.value)
      const valueEnd =
        node === null ? (rangeOf(pair.key)?.[1] ?? keyStart) : (rangeOf(node)?.[1] ?? this.cannot())
      const end =
        endOfValueLine(text, node === null ? text.indexOf(':', valueEnd) + 1 : valueEnd) ??
        this.cannot()
      return [{ start, end, insert: '' }]
    }
    const written = yamlText(value)
    if (pair !== undefined) {
      const node = emptyToNull(pair.value)
      if (node === null) {
        // `label:` without a value: the value goes behind the colon.
        const keyEnd = rangeOf(pair.key)?.[1] ?? this.cannot()
        const colon = text.indexOf(':', keyEnd)
        const nodeRange = rangeOf(pair.value)
        const end = nodeRange && nodeRange[1] > nodeRange[0] ? nodeRange[1] : colon + 1
        return [{ start: colon + 1, end, insert: ` ${written}` }]
      }
      if (!isInline(node)) this.cannot()
      const [start, end] = rangeOf(node)!
      return [{ start, end, insert: written }]
    }
    // After the last key before it in the order, or after the item's last key.
    const position = order.indexOf(key)
    const before = item.items.filter((one) => {
      const index = order.indexOf(String(isScalar(one.key) ? one.key.value : one.key))
      return index >= 0 && index < position
    })
    const after = before.at(-1) ?? item.items.at(-1)
    if (!after) this.cannot()
    const node = emptyToNull(after.value)
    const valueEnd =
      node === null
        ? text.indexOf(':', rangeOf(after.key)?.[1] ?? this.cannot()) + 1
        : (rangeOf(node)?.[1] ?? this.cannot())
    const at = endOfValueLine(text, valueEnd) ?? this.cannot()
    const indent = columnOf(text, item.items[0]?.key) ?? this.cannot()
    const lead = at === text.length && !text.endsWith('\n') ? lineBreak : ''
    return [
      { start: at, end: at, insert: `${lead}${' '.repeat(indent)}${key}: ${written}${lineBreak}` }
    ]
  }
}
