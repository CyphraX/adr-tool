import { isMap, isScalar, isSeq, parseDocument } from 'yaml'
import type { Pair, Scalar, YAMLMap, YAMLSeq } from 'yaml'
import { Refusal, type TextEdit } from '@adr-tool/kernel'
import type { SourceView } from '../text/source'
import { METADATA_KEYS, type MetadataKey } from './keys'
import { scalarText } from './scalar'

/** The file's Metadata is in a state the tool must not write into; a person has to fix it first. */
export class MetadataNotWritableError extends Refusal {}

/**
 * Set a scalar Metadata key. Returns the edits; nothing outside them changes.
 * An existing value keeps its quoting, spacing and trailing comment.
 */
export function setScalar(view: SourceView, key: MetadataKey, value: string): TextEdit[] {
  const fm = readFrontmatter(view)
  const pair = fm.find(key)
  if (!pair) return [fm.insertKey(key, formatScalar(value))]

  const node = pair.value
  if (node === null || scalarText(node) === undefined) {
    if (node !== null && !isScalar(node)) {
      throw new MetadataNotWritableError(`"${key}" is not a single value`)
    }
    return [fillEmptyValue(view, fm, pair, formatScalar(value))]
  }
  requireInline(key, node as Scalar)
  const [start, end] = [fm.abs(node.range![0]), fm.abs(node.range![1])]
  return [{ start, end, insert: formatScalar(value, (node as Scalar).type) }]
}

/**
 * A block scalar (`key: |`) reaches over its own line break and says with its indentation
 * where it ends: nothing the tool could replace where it stands.
 */
function requireInline(key: string, node: Scalar): void {
  if (node.type === 'BLOCK_LITERAL' || node.type === 'BLOCK_FOLDED') {
    throw new MetadataNotWritableError(
      `"${key}" is written as a block of several lines, which the tool cannot change where it stands. Write it on one line in an editor.`
    )
  }
}

/**
 * Add an item, or several, to a list-valued Metadata key, keeping the style the list
 * already has. What is in the list already is not added again.
 */
export function addToList(
  view: SourceView,
  key: MetadataKey,
  item: string | readonly string[]
): TextEdit[] {
  const fm = readFrontmatter(view)
  const pair = fm.find(key)
  const node = pair?.value ?? null
  if (node !== null && !isScalar(node) && !isSeq(node)) {
    throw new MetadataNotWritableError(`"${key}" is not a list`)
  }

  const there = isSeq(node)
    ? node.items.map((existing) => scalarText(existing))
    : [scalarText(node)]
  const added = [...new Set([item].flat())].filter((one) => !there.includes(one))
  if (added.length === 0) return []
  const formatted = added.map((one) => formatScalar(one))

  if (!pair) return [fm.insertKey(key, `[${formatted.join(', ')}]`)]
  if (node === null || isScalar(node)) {
    if (node === null || scalarText(node) === undefined) {
      return [fillEmptyValue(view, fm, pair, `[${formatted.join(', ')}]`)]
    }
    // A single value where a list is expected reads as a list of one; appending makes it a real list.
    requireInline(key, node)
    const [start, end] = [fm.abs(node.range![0]), fm.abs(node.range![1])]
    const existing = view.text.slice(start, end)
    return [{ start, end, insert: `[${existing}, ${formatted.join(', ')}]` }]
  }

  const last = (node as YAMLSeq<Scalar>).items.at(-1)
  if (node.flow) {
    if (!last) {
      const open = fm.abs(node.range![0]) + 1
      return [{ start: open, end: open, insert: formatted.join(', ') }]
    }
    const end = fm.abs(last.range![1])
    return [{ start: end, end, insert: formatted.map((one) => `, ${one}`).join('') }]
  }

  if (!last) throw new MetadataNotWritableError(`"${key}" is an empty block list`)
  const dash = view.text.lastIndexOf('-', fm.abs(last.range![0]))
  const indent = view.text.slice(lineStart(view.text, dash), dash)
  const at = fm.abs(last.range![2])
  const lead = view.text[at - 1] === '\n' ? '' : view.eol
  const lines = formatted.map((one) => `${indent}- ${one}${view.eol}`).join('')
  return [{ start: at, end: at, insert: lead + lines }]
}

/**
 * Take an item out of a list-valued Metadata key, where it stands; the other items do not
 * move. The last item takes the key with it: the tool never leaves an empty list behind.
 */
export function removeFromList(view: SourceView, key: MetadataKey, item: string): TextEdit[] {
  const fm = readFrontmatter(view)
  const pair = fm.find(key)
  const node = pair?.value ?? null
  if (!pair || node === null) return []
  if (isScalar(node)) return scalarText(node) === item ? removeKey(view, key) : []
  if (!isSeq(node)) throw new MetadataNotWritableError(`"${key}" is not a list`)

  const items = node.items as (Scalar | YAMLMap | YAMLSeq)[]
  const leaves = (existing: Scalar | YAMLMap | YAMLSeq): boolean => scalarText(existing) === item
  if (!items.some(leaves)) return []
  if (items.every(leaves)) return removeKey(view, key)

  const byHand = new MetadataNotWritableError(
    `"${key}" is written in a way the tool cannot take an item out of. Remove "${item}" in an editor.`
  )
  const span = (
    existing: Scalar | YAMLMap | YAMLSeq
  ): [start: number, end: number, next: number] => {
    if (!existing.range) throw byHand
    return [fm.abs(existing.range[0]), fm.abs(existing.range[1]), fm.abs(existing.range[2])]
  }

  if (!node.flow) {
    // One line per item: the line goes, from its indentation to its line break.
    return items.filter(leaves).map((existing) => {
      const [valueStart, , next] = span(existing)
      const dash = view.text.lastIndexOf('-', valueStart)
      const start = lineStart(view.text, dash)
      const lead = view.text.slice(start, dash) + view.text.slice(dash + 1, valueStart)
      if (dash < start || lead.trim() !== '' || view.text[next - 1] !== '\n') throw byHand
      return { start, end: next, insert: '' }
    })
  }

  // In a flow list an item leaves together with one comma: the one behind it, or, at the end
  // of the list, the one in front. Anything else between two items, a comment say, is
  // nothing the tool could assign to either of them.
  const separator = (left: number, right: number): void => {
    const between = view.text.slice(span(items[left]!)[1], span(items[right]!)[0])
    if (!/^\s*,\s*$/.test(between)) throw byHand
  }
  const lastStaying = items.findLastIndex((existing) => !leaves(existing))
  const edits: TextEdit[] = []
  items.forEach((existing, position) => {
    if (!leaves(existing) || position > lastStaying) return
    separator(position, position + 1)
    edits.push({ start: span(existing)[0], end: span(items[position + 1]!)[0], insert: '' })
  })
  if (lastStaying < items.length - 1) {
    for (let left = lastStaying; left < items.length - 1; left++) separator(left, left + 1)
    edits.push({ start: span(items[lastStaying]!)[1], end: span(items.at(-1)!)[1], insert: '' })
  }
  return edits
}

/**
 * Put one item of a list-valued Metadata key in the place of another: same position, same
 * quoting. When the new item is in the list already, the old one just leaves.
 */
export function replaceInList(
  view: SourceView,
  key: MetadataKey,
  item: string,
  replacement: string
): TextEdit[] {
  const fm = readFrontmatter(view)
  const node = fm.find(key)?.value ?? null
  if (node === null) return []
  const items = isScalar(node) ? [node] : isSeq(node) ? (node.items as unknown[]) : undefined
  if (!items) throw new MetadataNotWritableError(`"${key}" is not a list`)
  if (items.some((existing) => scalarText(existing) === replacement)) {
    return removeFromList(view, key, item)
  }
  return items
    .filter((existing): existing is Scalar => isScalar(existing) && scalarText(existing) === item)
    .map((existing) => ({
      start: fm.abs(existing.range![0]),
      end: fm.abs(existing.range![1]),
      insert: formatScalar(replacement, existing.type)
    }))
}

/**
 * Give a key its first value. `key:` with nothing after it gets the value right behind the
 * colon; an empty value that was spelled out (`key: ~`, `key: null`) is replaced.
 */
function fillEmptyValue(
  view: SourceView,
  fm: Frontmatter,
  pair: KeyedPair,
  formattedValue: string
): TextEdit {
  const range = pair.value?.range
  if (range && range[1] > range[0]) {
    return { start: fm.abs(range[0]), end: fm.abs(range[1]), insert: formattedValue }
  }
  const colon = view.text.indexOf(':', fm.abs(pair.key.range![1]))
  return { start: colon + 1, end: colon + 1, insert: ` ${formattedValue}` }
}

export interface CorrectionEntry {
  readonly date: string
  readonly author?: string
  readonly note?: string
}

/**
 * Append an entry to `corrections`. The tool writes this list in block style; a list that
 * is already there keeps the style and the indentation it has.
 */
export function appendCorrection(view: SourceView, entry: CorrectionEntry): TextEdit[] {
  const fm = readFrontmatter(view)
  const fields = (
    [
      ['date', entry.date],
      ['author', entry.author],
      ['note', entry.note]
    ] as const
  ).flatMap(([name, value]) => (value ? [`${name}: ${formatScalar(value)}`] : []))
  const asBlock = (indent: string): string[] =>
    fields.map((field, position) => indent + (position === 0 ? '- ' : '  ') + field)

  const pair = fm.find('corrections')
  const node = pair?.value ?? null
  if (!pair) return [fm.insertKey('corrections', '', asBlock('  '))]
  if (node === null || (isScalar(node) && scalarText(node) === undefined)) {
    return [...removeKey(view, 'corrections'), fm.insertKey('corrections', '', asBlock('  '))]
  }
  if (!isSeq(node)) throw new MetadataNotWritableError('"corrections" is not a list')

  const last = node.items.at(-1) as Scalar | YAMLMap | undefined
  if (node.flow) {
    const at = last ? fm.abs(last.range![1]) : fm.abs(node.range![0]) + 1
    return [{ start: at, end: at, insert: `${last ? ', ' : ''}{${fields.join(', ')}}` }]
  }
  if (!last) throw new MetadataNotWritableError('"corrections" is an empty block list')

  const dash = view.text.lastIndexOf('-', fm.abs(last.range![0]))
  const indent = view.text.slice(lineStart(view.text, dash), dash)
  const at = fm.abs(last.range![2])
  const lead = view.text[at - 1] === '\n' ? '' : view.eol
  return [
    {
      start: at,
      end: at,
      insert:
        lead +
        asBlock(indent)
          .map((line) => line + view.eol)
          .join('')
    }
  ]
}

/**
 * Give a key of somebody else's the name of one of the tool's keys, where it stands: the
 * value, its style and everything around it stay. Migration does this to MADR 3's `deciders`.
 */
export function renameKey(view: SourceView, from: string, to: MetadataKey): TextEdit[] {
  const fm = readFrontmatter(view)
  if (fm.find(to)) throw new MetadataNotWritableError(`"${to}" is there already`)
  const pair = fm.find(from)
  if (!pair) return []
  return [{ start: fm.abs(pair.key.range![0]), end: fm.abs(pair.key.range![1]), insert: to }]
}

/** Remove a Metadata key with its value. Comments above it belong to the author and stay. */
export function removeKey(view: SourceView, key: MetadataKey): TextEdit[] {
  const fm = readFrontmatter(view)
  const pair = fm.find(key)
  if (!pair) return []
  const start = lineStart(view.text, fm.abs(pair.key.range![0]))
  const end = fm.abs((pair.value ?? pair.key).range![2])
  return [{ start, end, insert: '' }]
}

type KeyedPair = Pair<Scalar, Scalar | YAMLSeq | YAMLMap | null>

interface Frontmatter {
  /** Translate an offset inside the YAML text into an offset inside the file. */
  abs(offset: number): number
  find(key: string): KeyedPair | undefined
  /** Insert `key: value`, or `key:` followed by the lines of a block when `block` is given. */
  insertKey(key: MetadataKey, formattedValue: string, block?: readonly string[]): TextEdit
}

/** The lines a new key takes up in the file. */
function keyLines(
  key: MetadataKey,
  value: string,
  block: readonly string[] | undefined,
  eol: string
): string {
  if (!block) return `${key}: ${value}${eol}`
  return [`${key}:`, ...block].map((line) => line + eol).join('')
}

function readFrontmatter(view: SourceView): Frontmatter {
  if (view.unterminatedFrontmatter) {
    throw new MetadataNotWritableError('The frontmatter is never closed')
  }
  const { text, eol } = view

  if (!view.frontmatter) {
    // No frontmatter yet: the first key brings the two fence lines with it.
    const at = view.bodyStart
    return {
      abs: (offset) => offset,
      find: () => undefined,
      insertKey: (key, value, block) => ({
        start: at,
        end: at,
        insert: `---${eol}${keyLines(key, value, block, eol)}---${eol}`
      })
    }
  }

  const span = view.frontmatter
  const doc = parseDocument(text.slice(span.start, span.end))
  if (doc.errors.length > 0) {
    throw new MetadataNotWritableError(
      `The frontmatter is not valid YAML: ${doc.errors[0]!.message}`
    )
  }
  if (doc.contents !== null && !isMap(doc.contents)) {
    throw new MetadataNotWritableError('The frontmatter is not a mapping')
  }
  const pairs = ((doc.contents?.items ?? []) as KeyedPair[]).filter((pair) => isScalar(pair.key))
  const abs = (offset: number): number => span.start + offset
  const find = (key: string): KeyedPair | undefined => pairs.find((pair) => pair.key.value === key)

  return {
    abs,
    find,
    insertKey(key, value, block) {
      // After the last of the tool's keys that precedes this one in canonical order,
      // or at the top when there is none. Existing keys never move.
      const rank = METADATA_KEYS.indexOf(key)
      const before = pairs.filter((pair) => {
        const other = METADATA_KEYS.indexOf(pair.key.value as MetadataKey)
        return other !== -1 && other < rank
      })
      const anchor = before.at(-1)
      const at = anchor ? abs((anchor.value ?? anchor.key).range![2]) : span.start
      const lead = at > span.start && text[at - 1] !== '\n' ? eol : ''
      return { start: at, end: at, insert: lead + keyLines(key, value, block, eol) }
    }
  }
}

function lineStart(text: string, offset: number): number {
  return text.lastIndexOf('\n', offset - 1) + 1
}

/**
 * Render a string as a YAML scalar: plain when that reads back as the same string,
 * double-quoted otherwise. `like` carries over the quoting of the value being replaced.
 */
function formatScalar(value: string, like?: Scalar['type']): string {
  if (like === 'QUOTE_SINGLE') return `'${value.replaceAll("'", "''")}'`
  if (like === 'QUOTE_DOUBLE') return JSON.stringify(value)
  const plain = parseDocument(`[${value}]`)
  const readBack = plain.errors.length === 0 && isSeq(plain.contents) ? plain.contents.items : []
  const first = readBack[0]
  const safe = readBack.length === 1 && isScalar(first) && first.value === value
  return safe && value === value.trim() && !YAML_1_1_BOOLEAN.test(value)
    ? value
    : JSON.stringify(value)
}

/** Other tools that read the frontmatter, Jekyll for one, still take these words for booleans. */
const YAML_1_1_BOOLEAN = /^(y|n|yes|no|on|off)$/i
