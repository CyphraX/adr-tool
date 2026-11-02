import { isMap, isScalar, isSeq, parseDocument, type Pair, type Scalar, type YAMLMap } from 'yaml'
import type { TextEdit } from '@adr-tool/kernel'
import { scalarText } from './annotation'
import { refuse } from './sentences'
import type { FileView } from './text'

/**
 * Splice edits into the frontmatter of an Annotation: a value replaced where it stands, a key
 * inserted in the order of the format, an item added to or taken out of a list. Nothing outside
 * the edits changes (ADR-0002). This mirrors what `core` does for an ADR's Metadata; the two
 * cores do not share code (ADR-0006).
 */

/** The suite's keys, in the order it writes them (docs/review-format.md, section 2). */
export const KEY_ORDER = ['type', 'state', 'author', 'date', 'anchor', 'cites'] as const
export const ANCHOR_ORDER = ['path', 'lines', 'commit'] as const

type AnyPair = Pair<unknown, unknown>

export interface Frontmatter {
  readonly view: FileView
  readonly path: string
  /** An offset in the YAML text, as an offset in the file. */
  abs(offset: number): number
  pair(key: string, within?: YAMLMap): AnyPair | undefined
  /** The `anchor` mapping, when there is one. */
  anchor(): YAMLMap | undefined
}

export function frontmatterIn(view: FileView, path: string): Frontmatter {
  if (!view.frontmatter) refuse({ code: 'annotation-unreadable', values: { path } })
  const span = view.frontmatter
  const doc = parseDocument(view.text.slice(span.start, span.end))
  if (doc.errors.length > 0 || (doc.contents !== null && !isMap(doc.contents))) {
    refuse({ code: 'annotation-unreadable', values: { path } })
  }
  const top = (doc.contents as YAMLMap | null) ?? undefined
  const pair = (key: string, within: YAMLMap | undefined = top): AnyPair | undefined =>
    (within?.items as AnyPair[] | undefined)?.find((item) => scalarText(item.key) === key)
  return {
    view,
    path,
    abs: (offset) => span.start + offset,
    pair,
    anchor: () => {
      const value = pair('anchor')?.value
      return isMap(value) ? value : undefined
    }
  }
}

const lineStart = (text: string, offset: number): number => text.lastIndexOf('\n', offset - 1) + 1

/** Where a pair's last line ends: after its line break. */
function pairEnd(fm: Frontmatter, pair: AnyPair): number {
  const node = (pair.value ?? pair.key) as { range?: [number, number, number] }
  const at = fm.abs(node.range![2])
  const text = fm.view.text
  // The node ends at its value; the line goes on to its break.
  const lf = text.indexOf('\n', at - (text[at - 1] === '\n' ? 1 : 0))
  return lf === -1 ? text.length : lf + 1
}

/**
 * Replace the value of `key` where it stands — inside `anchor` when `within` is given — or
 * insert the key in the order of the format. An existing value keeps its quoting.
 */
export function setValue(
  fm: Frontmatter,
  key: string,
  value: string,
  within?: 'anchor'
): TextEdit[] {
  const map = within ? fm.anchor() : undefined
  if (within && !map) refuse({ code: 'key-by-hand', values: { path: fm.path, key: within } })
  const pair = fm.pair(key, map ?? undefined)
  const shownKey = within ? `${within}.${key}` : key
  if (pair) {
    const node = pair.value as Scalar | null
    if (node === null || !isScalar(node) || !node.range) {
      if (node === null) return [fillEmpty(fm, pair, formatScalar(value))]
      refuse({ code: 'key-by-hand', values: { path: fm.path, key: shownKey } })
    }
    if (node.type === 'BLOCK_LITERAL' || node.type === 'BLOCK_FOLDED') {
      refuse({ code: 'key-by-hand', values: { path: fm.path, key: shownKey } })
    }
    if (node.value === null) return [fillEmpty(fm, pair, formatScalar(value))]
    return [
      {
        start: fm.abs(node.range[0]),
        end: fm.abs(node.range[1]),
        insert: formatScalar(value, node.type)
      }
    ]
  }
  return [insertKey(fm, key, `${key}: ${formatScalar(value)}`, within)]
}

/** `key:` with nothing after it gets the value behind the colon; a spelled-out `null` is replaced. */
function fillEmpty(fm: Frontmatter, pair: AnyPair, formatted: string): TextEdit {
  const range = (pair.value as { range?: [number, number, number] } | null)?.range
  if (range && range[1] > range[0]) {
    return { start: fm.abs(range[0]), end: fm.abs(range[1]), insert: formatted }
  }
  const keyEnd = fm.abs((pair.key as Scalar).range![1])
  const colon = fm.view.text.indexOf(':', keyEnd)
  return { start: colon + 1, end: colon + 1, insert: ` ${formatted}` }
}

/**
 * Insert whole lines — `lines`, without their indentation and line breaks — for `key`: after
 * the last key of the format that comes before it, or at the top of the frontmatter (or of the
 * anchor mapping). Existing keys never move.
 */
export function insertKey(
  fm: Frontmatter,
  key: string,
  lines: string | readonly string[],
  within?: 'anchor'
): TextEdit {
  const { text, eol } = fm.view
  const order: readonly string[] = within ? ANCHOR_ORDER : KEY_ORDER
  const map = within ? fm.anchor() : undefined
  const pairs: AnyPair[] = within ? ((map?.items ?? []) as AnyPair[]) : topPairs(fm)
  let indent = ''
  let start = fm.view.frontmatter!.start
  if (within) {
    if (!map || map.flow || pairs.length === 0) {
      refuse({ code: 'key-by-hand', values: { path: fm.path, key: within } })
    }
    const first = fm.abs((pairs[0]!.key as Scalar).range![0])
    indent = text.slice(lineStart(text, first), first)
    if (indent.trim() !== '')
      refuse({ code: 'key-by-hand', values: { path: fm.path, key: within } })
    start = lineStart(text, first)
  }
  const rank = order.indexOf(key)
  const before = pairs.filter((pair) => {
    const other = order.indexOf(scalarText(pair.key) ?? '')
    return other !== -1 && other < rank
  })
  const after = before.at(-1)
  const at = after ? pairEnd(fm, after) : start
  const lead = at > 0 && text[at - 1] !== '\n' ? eol : ''
  const insert = [lines]
    .flat()
    .map((line) => indent + line + eol)
    .join('')
  return { start: at, end: at, insert: lead + insert }
}

function topPairs(fm: Frontmatter): AnyPair[] {
  const span = fm.view.frontmatter!
  const doc = parseDocument(fm.view.text.slice(span.start, span.end))
  return ((doc.contents as YAMLMap | null)?.items ?? []) as AnyPair[]
}

/** Remove a key with its value, inside `anchor` when `within` is given. */
export function removeKey(fm: Frontmatter, key: string, within?: 'anchor'): TextEdit[] {
  const map = within ? fm.anchor() : undefined
  const pair = fm.pair(key, map)
  if (!pair) return []
  if (map?.flow) refuse({ code: 'key-by-hand', values: { path: fm.path, key: within! } })
  const start = lineStart(fm.view.text, fm.abs((pair.key as Scalar).range![0]))
  return [{ start, end: pairEnd(fm, pair), insert: '' }]
}

/** Add an item to the list of `key`, in the style the list has; a new list is written in flow style. */
export function addToList(fm: Frontmatter, key: string, item: string): TextEdit[] {
  const pair = fm.pair(key)
  const node = pair?.value ?? null
  const formatted = formatScalar(item)
  const byHand = (): never => refuse({ code: 'key-by-hand', values: { path: fm.path, key } })
  if (!pair) return [insertKey(fm, key, `${key}: [${formatted}]`)]
  if (node === null || (isScalar(node) && scalarText(node) === undefined)) {
    return [fillEmpty(fm, pair, `[${formatted}]`)]
  }
  if (isScalar(node)) {
    // A single value is a list of one; appending makes it a list.
    const scalar = node as Scalar
    if (scalar.type === 'BLOCK_LITERAL' || scalar.type === 'BLOCK_FOLDED') byHand()
    const [start, end] = [fm.abs(scalar.range![0]), fm.abs(scalar.range![1])]
    return [{ start, end, insert: `[${formatScalar(scalarText(scalar)!)}, ${formatted}]` }]
  }
  if (!isSeq(node)) return byHand()
  const last = node.items.at(-1) as Scalar | undefined
  if (node.flow) {
    if (!last) {
      const open = fm.abs(node.range![0]) + 1
      return [{ start: open, end: open, insert: formatted }]
    }
    const end = fm.abs(last.range![1])
    return [{ start: end, end, insert: `, ${formatted}` }]
  }
  if (!last?.range) return byHand()
  const text = fm.view.text
  const dash = text.lastIndexOf('-', fm.abs(last.range[0]))
  const indent = text.slice(lineStart(text, dash), dash)
  if (indent.trim() !== '') byHand()
  const at = pairEnd(fm, { key: null, value: last } as unknown as AnyPair)
  const lead = text[at - 1] === '\n' ? '' : fm.view.eol
  return [{ start: at, end: at, insert: `${lead}${indent}- ${formatted}${fm.view.eol}` }]
}

/** Take an item out of the list of `key`, where it stands; the last item takes the key with it. */
export function removeFromList(fm: Frontmatter, key: string, item: string): TextEdit[] {
  const pair = fm.pair(key)
  const node = pair?.value ?? null
  const byHand = (): never => refuse({ code: 'key-by-hand', values: { path: fm.path, key } })
  if (!pair || node === null) return []
  if (isScalar(node)) return scalarText(node) === item ? removeKey(fm, key) : []
  if (!isSeq(node)) return byHand()
  const items = node.items as Scalar[]
  const leaves = (one: Scalar): boolean => scalarText(one) === item
  if (!items.some(leaves)) return []
  if (items.every(leaves)) return removeKey(fm, key)
  const text = fm.view.text
  const span = (one: Scalar): [number, number] => {
    if (!isScalar(one) || !one.range) byHand()
    return [fm.abs(one.range![0]), fm.abs(one.range![1])]
  }

  if (!node.flow) {
    return items.filter(leaves).map((one) => {
      const [valueStart] = span(one)
      const dash = text.lastIndexOf('-', valueStart)
      const start = lineStart(text, dash)
      if (text.slice(start, dash).trim() !== '' || text.slice(dash + 1, valueStart).trim() !== '') {
        byHand()
      }
      return {
        start,
        end: pairEnd(fm, { key: null, value: one } as unknown as AnyPair),
        insert: ''
      }
    })
  }
  // In a flow list an item leaves with one comma: the one behind it, or at the end the one before.
  const separator = (left: number, right: number): void => {
    if (!/^\s*,\s*$/.test(text.slice(span(items[left]!)[1], span(items[right]!)[0]))) byHand()
  }
  const lastStaying = items.findLastIndex((one) => !leaves(one))
  const edits: TextEdit[] = []
  items.forEach((one, position) => {
    if (!leaves(one) || position > lastStaying) return
    separator(position, position + 1)
    edits.push({ start: span(one)[0], end: span(items[position + 1]!)[0], insert: '' })
  })
  if (lastStaying < items.length - 1) {
    for (let left = lastStaying; left < items.length - 1; left++) separator(left, left + 1)
    edits.push({ start: span(items[lastStaying]!)[1], end: span(items.at(-1)!)[1], insert: '' })
  }
  return edits
}

/** Other tools that read the frontmatter, Jekyll for one, still take these words for booleans. */
const YAML_1_1_BOOLEAN = /^(y|n|yes|no|on|off)$/i

/**
 * A string as a YAML scalar: plain when that reads back as the same string, double-quoted
 * otherwise. `like` keeps the quoting of the value it replaces.
 */
export function formatScalar(value: string, like?: Scalar['type']): string {
  if (like === 'QUOTE_SINGLE') return `'${value.replaceAll("'", "''")}'`
  if (like === 'QUOTE_DOUBLE') return JSON.stringify(value)
  const doc = parseDocument(`[${value}]`)
  const items = doc.errors.length === 0 && isSeq(doc.contents) ? doc.contents.items : []
  const first = items[0]
  const safe = items.length === 1 && isScalar(first) && first.value === value
  return safe && value === value.trim() && value !== '' && !YAML_1_1_BOOLEAN.test(value)
    ? value
    : JSON.stringify(value)
}
