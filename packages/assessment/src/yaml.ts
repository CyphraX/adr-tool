/**
 * YAML in a region of a file — the frontmatter, or the block of an entry — read with the ranges
 * of the `yaml` library and written by splicing: a value replaced where it stands, a key
 * inserted in the order of the format, an item added to or taken out of a list. Nothing outside
 * the edits changes (ADR-0002). This mirrors what `review` does for an Annotation's frontmatter;
 * the two cores do not share code (ADR-0006).
 */
import {
  isMap,
  isScalar,
  isSeq,
  LineCounter,
  parseDocument,
  type Document,
  type Pair,
  type Scalar,
  type YAMLMap,
  type YAMLSeq
} from 'yaml'
import type { TextEdit } from '@adr-tool/kernel'
import { refuse } from './sentences'
import { lineNumberAt, type Eol, type Span } from './text'

export type AnyPair = Pair<unknown, unknown>

/**
 * The text of a YAML scalar as its author wrote it, or `undefined` for an empty value: `12` is
 * the text "12", `H` the text "H", whatever type YAML would give it.
 */
export function scalarText(node: unknown): string | undefined {
  if (!isScalar(node) || node.value === null) return undefined
  if (node.type === 'PLAIN' && node.source !== undefined) return node.source
  return String(node.value)
}

/** Other tools that read YAML, Jekyll for one, still take these words for booleans. */
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

/** A value the suite reads by its text, as it is: `H`, `S1`. Its quoting is kept where it had one. */
export const asText = (value: string, like?: Scalar['type']): string =>
  like === 'QUOTE_SINGLE' || like === 'QUOTE_DOUBLE'
    ? formatScalar(value, like)
    : formatScalar(value)

/** YAML in a region of a file, parsed, with offsets into the file. */
export interface Region {
  /** The whole text of the file. */
  readonly text: string
  /** Where the YAML is in it. */
  readonly span: Span
  readonly eol: Eol
  /** The file, for what a refusal says. */
  readonly path: string
  readonly doc: Document.Parsed
  /** The mapping at its top; absent for an empty region. */
  readonly map: YAMLMap | undefined
  /** An offset in the YAML, as an offset in the file. */
  abs(offset: number): number
  /** The line in the file of an offset in the YAML, from 1. */
  lineOf(offset: number): number
}

/**
 * Parse YAML in a region. `errors` says what the parser found wrong — a key written twice among
 * it —, or that its top is not a mapping; it is empty for an empty region.
 */
export function parseRegion(
  text: string,
  span: Span,
  eol: Eol,
  path: string
): Region & { readonly errors: readonly string[] } {
  const lineCounter = new LineCounter()
  const doc = parseDocument(text.slice(span.start, span.end), { lineCounter })
  // Where in the region the parser found it says nothing of where it is in the file.
  const errors = doc.errors.map((error) =>
    error.message
      .split('\n')[0]!
      .replace(/ at line \d+, column \d+:?$/, '')
      .replace(/[:.]$/, '')
  )
  const contents = doc.contents
  const empty = contents === null || (isScalar(contents) && contents.value === null)
  const firstLine = lineNumberAt(text, span.start)
  return {
    text,
    span,
    eol,
    path,
    doc,
    map: isMap(contents) ? contents : undefined,
    errors: empty || isMap(contents) || errors.length > 0 ? errors : ['not a mapping'],
    abs: (offset) => span.start + offset,
    lineOf: (offset) => firstLine + lineCounter.linePos(offset).line - 1
  }
}

/** The region of a file the suite writes into, or the refusal that it cannot be read. */
export function regionFor(text: string, span: Span, eol: Eol, path: string): Region {
  const region = parseRegion(text, span, eol, path)
  if (region.errors.length > 0) refuse({ code: 'file-needs-fixing', values: { path } })
  return region
}

/** The pair of a key in a mapping. */
export function pairOf(map: YAMLMap | undefined, key: string): AnyPair | undefined {
  return (map?.items as AnyPair[] | undefined)?.find((item) => scalarText(item.key) === key)
}

const lineStart = (text: string, offset: number): number => text.lastIndexOf('\n', offset - 1) + 1

/** Where a node's last line ends: after its line break. */
export function nodeEnd(region: Region, node: unknown): number {
  const at = region.abs((node as { range: [number, number, number] }).range[2])
  const text = region.text
  // A collection's range may end after its line break, or after the indentation of the line
  // that follows it, which is not its own; a scalar's ends at its value.
  const start = lineStart(text, at)
  if (text.slice(start, at).trim() === '') return Math.min(start, region.span.end)
  const lf = text.indexOf('\n', at)
  return Math.min(lf === -1 ? text.length : lf + 1, region.span.end)
}

/** Where a pair's last line ends. */
export const pairEnd = (region: Region, pair: AnyPair): number =>
  nodeEnd(region, pair.value ?? pair.key)

/** Where a pair's first line starts. */
export const pairStart = (region: Region, pair: AnyPair): number =>
  lineStart(region.text, region.abs((pair.key as Scalar).range![0]))

const byHand = (region: Region, key: string): never =>
  refuse({ code: 'value-by-hand', values: { path: region.path, key } })

/** The indentation of the keys of the top mapping, which must be blanks: what new lines take. */
function keyIndent(region: Region): string {
  const first = (region.map?.items as AnyPair[] | undefined)?.[0]
  if (!first) return ''
  const at = region.abs((first.key as Scalar).range![0])
  const indent = region.text.slice(lineStart(region.text, at), at)
  if (indent.trim() !== '') byHand(region, scalarText(first.key) ?? '')
  return indent
}

/**
 * Insert whole lines — `lines`, without their indentation and line breaks — for `key`: after the
 * last key of `order` that comes before it, or at the top of the region. Existing keys never move.
 */
export function insertKey(
  region: Region,
  key: string,
  lines: readonly string[],
  order: readonly string[]
): TextEdit {
  if (region.map?.flow) byHand(region, key)
  const indent = keyIndent(region)
  const rank = order.indexOf(key)
  const before = ((region.map?.items ?? []) as AnyPair[]).filter((pair) => {
    const other = order.indexOf(scalarText(pair.key) ?? '')
    return other !== -1 && other < rank
  })
  const after = before.at(-1)
  const at = after ? pairEnd(region, after) : region.span.start
  const lead = at > 0 && region.text[at - 1] !== '\n' ? region.eol : ''
  return {
    start: at,
    end: at,
    insert: lead + lines.map((line) => indent + line + region.eol).join('')
  }
}

/**
 * Set a key of the top mapping to a text: the value replaced where it stands, its quoting kept,
 * or the key inserted in the order of the format.
 */
export function setScalar(
  region: Region,
  key: string,
  value: string,
  order: readonly string[],
  format: (value: string, like?: Scalar['type']) => string = formatScalar
): TextEdit[] {
  const pair = pairOf(region.map, key)
  if (!pair) return [insertKey(region, key, [`${key}: ${format(value)}`], order)]
  const node = pair.value as Scalar | null
  if (node === null || (isScalar(node) && node.value === null)) {
    // `key:` with nothing after it gets the value behind the colon; `~` or `null` is replaced.
    if (node?.range && node.range[1] > node.range[0]) {
      return [
        { start: region.abs(node.range[0]), end: region.abs(node.range[1]), insert: format(value) }
      ]
    }
    const keyEnd = region.abs((pair.key as Scalar).range![1])
    const colon = region.text.indexOf(':', keyEnd)
    return [{ start: colon + 1, end: colon + 1, insert: ` ${format(value)}` }]
  }
  if (
    !isScalar(node) ||
    !node.range ||
    node.type === 'BLOCK_LITERAL' ||
    node.type === 'BLOCK_FOLDED'
  ) {
    return byHand(region, key)
  }
  const start = region.abs(node.range[0])
  const end = region.abs(node.range[1])
  return [{ start, end, insert: format(value, node.type) }]
}

/** Remove a key of the top mapping with its value: all its lines. */
export function removeKey(region: Region, key: string): TextEdit[] {
  const pair = pairOf(region.map, key)
  if (!pair) return []
  if (region.map?.flow) byHand(region, key)
  return [{ start: pairStart(region, pair), end: pairEnd(region, pair), insert: '' }]
}

/**
 * Add a text to the list of `key`, in the style the list has; a new list is written in flow
 * style, inserted in the order of the format.
 */
export function addToList(
  region: Region,
  key: string,
  item: string,
  order: readonly string[]
): TextEdit[] {
  const pair = pairOf(region.map, key)
  const formatted = formatScalar(item)
  if (!pair) return [insertKey(region, key, [`${key}: [${formatted}]`], order)]
  const node = pair.value ?? null
  if (node === null || (isScalar(node) && scalarText(node) === undefined)) {
    return setScalar(region, key, `[${formatted}]`, order, (value) => value)
  }
  if (isScalar(node)) {
    // A single value is a list of one; appending makes it a list.
    if (node.type === 'BLOCK_LITERAL' || node.type === 'BLOCK_FOLDED' || !node.range) {
      return byHand(region, key)
    }
    const [start, end] = [region.abs(node.range[0]), region.abs(node.range[1])]
    return [{ start, end, insert: `[${formatScalar(scalarText(node)!)}, ${formatted}]` }]
  }
  if (!isSeq(node)) return byHand(region, key)
  const last = node.items.at(-1) as Scalar | undefined
  if (node.flow) {
    if (!last) {
      const open = region.abs(node.range![0]) + 1
      return [{ start: open, end: open, insert: formatted }]
    }
    if (!isScalar(last) || !last.range) return byHand(region, key)
    const end = region.abs(last.range[1])
    return [{ start: end, end, insert: `, ${formatted}` }]
  }
  if (!last || !isScalar(last) || !last.range) return byHand(region, key)
  const dash = region.text.lastIndexOf('-', region.abs(last.range[0]))
  const indent = region.text.slice(lineStart(region.text, dash), dash)
  if (indent.trim() !== '') byHand(region, key)
  const at = nodeEnd(region, last)
  const lead = region.text[at - 1] === '\n' ? '' : region.eol
  return [{ start: at, end: at, insert: `${lead}${indent}- ${formatted}${region.eol}` }]
}

/**
 * Take the texts that `leaves` says out of the list of `key`, where they stand; the last item
 * takes the key with it. A list in braces or with a comment between two items is refused.
 */
export function removeFromList(
  region: Region,
  key: string,
  leaves: (item: string) => boolean
): TextEdit[] {
  const pair = pairOf(region.map, key)
  const node = pair?.value ?? null
  if (!pair || node === null) return []
  if (isScalar(node)) {
    const value = scalarText(node)
    return value !== undefined && leaves(value) ? removeKey(region, key) : []
  }
  if (!isSeq(node)) return byHand(region, key)
  const items = node.items as Scalar[]
  const goes = (one: Scalar): boolean => {
    const value = scalarText(one)
    return value !== undefined && leaves(value)
  }
  if (!items.some(goes)) return []
  if (items.every(goes)) return removeKey(region, key)
  const text = region.text
  const span = (one: Scalar): [number, number] => {
    if (!isScalar(one) || !one.range) byHand(region, key)
    return [region.abs(one.range![0]), region.abs(one.range![1])]
  }
  if (!node.flow) {
    return items.filter(goes).map((one) => {
      const [valueStart] = span(one)
      const dash = text.lastIndexOf('-', valueStart)
      const start = lineStart(text, dash)
      if (text.slice(start, dash).trim() !== '' || text.slice(dash + 1, valueStart).trim() !== '') {
        byHand(region, key)
      }
      return { start, end: nodeEnd(region, one), insert: '' }
    })
  }
  // In a flow list an item leaves with one comma: the one behind it, or at the end the one before.
  const separator = (left: number, right: number): void => {
    if (!/^\s*,\s*$/.test(text.slice(span(items[left]!)[1], span(items[right]!)[0]))) {
      byHand(region, key)
    }
  }
  const lastStaying = items.findLastIndex((one) => !goes(one))
  const edits: TextEdit[] = []
  items.forEach((one, position) => {
    if (!goes(one) || position > lastStaying) return
    separator(position, position + 1)
    edits.push({ start: span(one)[0], end: span(items[position + 1]!)[0], insert: '' })
  })
  if (lastStaying < items.length - 1) {
    for (let left = lastStaying; left < items.length - 1; left++) separator(left, left + 1)
    edits.push({ start: span(items[lastStaying]!)[1], end: span(items.at(-1)!)[1], insert: '' })
  }
  return edits
}

/**
 * Append an item of several lines — a mapping, given as its lines without indentation — to the
 * block list of `key`; the key is inserted with a block list where it is not there.
 */
export function appendBlockItem(
  region: Region,
  key: string,
  lines: readonly string[],
  order: readonly string[]
): TextEdit[] {
  const pair = pairOf(region.map, key)
  const item = (indent: string): string =>
    lines.map((line, index) => `${indent}${index === 0 ? '- ' : '  '}${line}${region.eol}`).join('')
  if (!pair) {
    const edit = insertKey(region, key, [`${key}:`], order)
    return [{ ...edit, insert: edit.insert + item(keyIndent(region) + '  ') }]
  }
  const node = pair.value ?? null
  if (node === null || (isScalar(node) && scalarText(node) === undefined)) {
    const at = pairEnd(region, pair)
    const keyStart = region.abs((pair.key as Scalar).range![0])
    const indent = region.text.slice(lineStart(region.text, keyStart), keyStart)
    if (isScalar(node) && node.range && node.range[1] > node.range[0]) {
      // `~` or `null` goes; the list stands below the key.
      return [
        { start: region.abs(node.range[0]) - 1, end: region.abs(node.range[1]), insert: '' },
        { start: at, end: at, insert: item(indent + '  ') }
      ]
    }
    const lead = region.text[at - 1] === '\n' ? '' : region.eol
    return [{ start: at, end: at, insert: lead + item(indent + '  ') }]
  }
  if (!isSeq(node) || node.flow) return byHand(region, key)
  const last = (node as YAMLSeq).items.at(-1) as { range?: [number, number, number] } | undefined
  if (!last?.range) return byHand(region, key)
  const dash = region.text.lastIndexOf('-', region.abs(last.range[0]))
  const indent = region.text.slice(lineStart(region.text, dash), dash)
  if (indent.trim() !== '') byHand(region, key)
  const at = nodeEnd(region, last)
  const lead = region.text[at - 1] === '\n' ? '' : region.eol
  return [{ start: at, end: at, insert: lead + item(indent) }]
}

/**
 * Where the lines of an item of a block list end, its dash at `column`: a comment indented
 * deeper than the dash is the item's own; a blank line, or a comment at the dash or before it,
 * belongs to what follows.
 */
function itemEnd(
  region: Region,
  item: { range?: [number, number, number] },
  column: number
): number {
  const text = region.text
  let end = nodeEnd(region, item)
  // A collection's range runs on over the comments and blank lines after it.
  for (;;) {
    const start = lineStart(text, end - 1)
    const line = text.slice(start, end)
    const content = line.trim()
    const indent = line.length - line.trimStart().length
    if (start <= region.abs(item.range![0])) return end
    if (content !== '' && (!content.startsWith('#') || indent > column)) return end
    end = start
  }
}

/** Take an item of the block list of `key` out, with all its lines. */
export function removeBlockItem(region: Region, key: string, index: number): TextEdit[] {
  const pair = pairOf(region.map, key)
  const node = pair?.value
  if (!pair || !isSeq(node)) return []
  if (node.items.length === 1) return removeKey(region, key)
  if (node.flow) return byHand(region, key)
  const item = node.items[index] as { range?: [number, number, number] } | undefined
  if (!item?.range) return byHand(region, key)
  const dash = region.text.lastIndexOf('-', region.abs(item.range[0]))
  const start = lineStart(region.text, dash)
  if (region.text.slice(start, dash).trim() !== '') byHand(region, key)
  // Its own lines only: a comment or a blank line below it belongs to what follows.
  return [{ start, end: itemEnd(region, item, dash - start), insert: '' }]
}

/** Rewrite a scalar where it stands, its quoting kept; `undefined` where a splice cannot serve. */
export function rewriteScalar(region: Region, node: Scalar, value: string): TextEdit | undefined {
  if (!node.range) return undefined
  const written =
    node.type === 'QUOTE_DOUBLE'
      ? JSON.stringify(value)
      : node.type === 'QUOTE_SINGLE'
        ? `'${value.replaceAll("'", "''")}'`
        : node.type === 'PLAIN'
          ? formatScalar(value)
          : undefined
  if (written === undefined) return undefined
  return { start: region.abs(node.range[0]), end: region.abs(node.range[1]), insert: written }
}
