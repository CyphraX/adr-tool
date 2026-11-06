/**
 * Where the items and keys of a Diagram stand in its text, so that what the suite writes into
 * the file is spliced line by line (ADR-0002): the YAML is parsed to find them, never written
 * back through the parser.
 */
import { isMap, isScalar, isSeq, type Document, type Pair, type YAMLMap, type YAMLSeq } from 'yaml'
import { emptyToNull, keyText, scalarText, type Diagram } from './diagram'

/** The offset of the start of the line an offset stands in. */
export const lineStart = (text: string, offset: number): number =>
  text.lastIndexOf('\n', offset - 1) + 1

/** The offset behind the line break of the line an offset stands in; the end of the text without one. */
export function lineEnd(text: string, offset: number): number {
  const next = text.indexOf('\n', offset)
  return next === -1 ? text.length : next + 1
}

/** The line break the file uses: CRLF where it has one, LF otherwise. */
export const lineBreakOf = (text: string): string => (text.includes('\r\n') ? '\r\n' : '\n')

/** The range of a node: where it starts, where its value ends, where it ends with its comment. */
export function rangeOf(node: unknown): readonly [number, number, number] | undefined {
  const range = (node as { range?: readonly [number, number, number] | null } | null)?.range
  return range ?? undefined
}

/** The first pair of a map with the key, as the reader reads it. */
export function pairOf(map: unknown, key: string): Pair | undefined {
  return isMap(map) ? map.items.find((pair) => keyText(pair.key) === key) : undefined
}

/** The text a key of an item holds, as the reader reads it. */
export function textAt(item: unknown, key: string): string | undefined {
  const value = emptyToNull(pairOf(item, key)?.value)
  return value === null ? undefined : scalarText(value)
}

/** The list of `elements` or `connections`, when it is a list. */
export function listOf(doc: Document, key: 'elements' | 'connections'): YAMLSeq | undefined {
  const value = pairOf(doc.contents, key)?.value
  return isSeq(value) ? value : undefined
}

/** The maps of a list, in its order. */
export const mapsOf = (list: YAMLSeq | undefined): YAMLMap[] =>
  (list?.items ?? []).filter((item): item is YAMLMap => isMap(item))

/**
 * Where a line ends that holds a value ending at `end`: behind its line break, when only blanks
 * and a comment follow the value on its line; `undefined` when anything else does.
 */
export function endOfValueLine(text: string, end: number): number | undefined {
  // A block map or a block scalar ends behind the line break of its last line already.
  const lineDone = end > 0 && text[end - 1] === '\n' ? end : lineEnd(text, end)
  return /^[ \t]*(?:#[^\n]*)?\r?\n?$/.test(text.slice(end, lineDone)) ? lineDone : undefined
}

/**
 * The lines of one item of a block list: from the start of the line of its `-` to the end of
 * the line of its last key, with the comments below it that are indented as its keys are. `undefined` where they hold anything else: a comment, a tag or an
 * anchor before the item on the line of its `-`, or more than a comment behind it.
 */
export function itemLines(text: string, item: unknown): { start: number; end: number } | undefined {
  const range = rangeOf(item)
  if (!range) return undefined
  const [valueStart, valueEnd] = range
  const dash = text.lastIndexOf('-', valueStart)
  if (dash < 0) return undefined
  const start = lineStart(text, dash)
  const lead = text.slice(start, dash) + text.slice(dash + 1, valueStart)
  if (lead.trim() !== '') return undefined
  const end = endOfValueLine(text, valueEnd)
  return end === undefined ? undefined : { start, end: pastItemComments(text, end, dash - start) }
}

/**
 * Behind the comment lines at `offset` that are indented deeper than the `-` of an item at
 * `dashColumn`: they belong to the item above them, and stay with it.
 */
export function pastItemComments(text: string, offset: number, dashColumn: number): number {
  let at = offset
  while (at < text.length) {
    const end = lineEnd(text, at)
    const indent = /^([ \t]*)#/.exec(text.slice(at, end))?.[1]
    if (indent === undefined || indent.length <= dashColumn) break
    at = end
  }
  return at
}

/** The column a node starts in. */
export function columnOf(text: string, node: unknown): number | undefined {
  const range = rangeOf(node)
  return range ? range[0] - lineStart(text, range[0]) : undefined
}

/**
 * Whether a value of `text` can be replaced where it stands, and nothing else with it: written
 * on one line, so that no comment lies inside it, and without an anchor, so that no alias to it
 * changes along.
 */
export function isReplaceable(text: string, node: unknown): boolean {
  const range = rangeOf(node)
  if (!range || (node as { anchor?: string }).anchor) return false
  return !/[\r\n]/.test(text.slice(range[0], range[1]))
}

/** Whether a scalar is written on one line, plain or quoted: what can be replaced in place. */
export const isInline = (text: string, node: unknown): boolean =>
  isScalar(node) &&
  node.type !== 'BLOCK_LITERAL' &&
  node.type !== 'BLOCK_FOLDED' &&
  isReplaceable(text, node)

/**
 * A Diagram as two readings of it are compared: without lines and Problems, which move, and
 * with every map's keys in one order, so that the order in which they were made does not count.
 */
export function comparable(diagram: Diagram): string {
  const { elements, connections, title, description, level, scope } = diagram
  return canonical({
    elements: elements.map((element) => ({ ...element, line: 0 })),
    connections: connections.map((connection) => ({ ...connection, line: 0 })),
    rest: { title, description, level, scope }
  })
}

/** A value as JSON with the keys of every map sorted, and `undefined` left out. */
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_, inner: unknown) =>
    inner !== null && typeof inner === 'object' && !Array.isArray(inner)
      ? Object.fromEntries(
          Object.entries(inner)
            .filter(([, one]) => one !== undefined)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        )
      : inner
  )
}
