import { isMap, isScalar, isSeq, parseDocument } from 'yaml'
import type { Pair, Scalar, YAMLMap, YAMLSeq } from 'yaml'
import type { TextEdit } from '../text/edit'
import type { SourceView } from '../text/source'
import { METADATA_KEYS, type MetadataKey } from './keys'

/** The file's Metadata is in a state the tool must not write into; a person has to fix it first. */
export class MetadataNotWritableError extends Error {}

/**
 * Set a scalar Metadata key. Returns the edits; nothing outside them changes.
 * An existing value keeps its quoting, spacing and trailing comment.
 */
export function setScalar(view: SourceView, key: MetadataKey, value: string): TextEdit[] {
  const fm = readFrontmatter(view)
  const pair = fm.find(key)
  if (!pair) return [fm.insertKey(key, formatScalar(value))]

  const node = pair.value
  if (node === null) {
    const colon = view.text.indexOf(':', fm.abs(pair.key.range![1]))
    return [{ start: colon + 1, end: colon + 1, insert: ' ' + formatScalar(value) }]
  }
  if (!isScalar(node)) throw new MetadataNotWritableError(`"${key}" is not a single value`)

  const [start, end] = [fm.abs(node.range![0]), fm.abs(node.range![1])]
  if (start === end) {
    // `key:` with nothing after it: the empty value sits right behind the colon.
    const gap = view.text[start - 1] === ':' ? ' ' : ''
    return [{ start, end, insert: gap + formatScalar(value) }]
  }
  return [{ start, end, insert: formatScalar(value, node.type) }]
}

/** Add an item to a list-valued Metadata key, keeping the style the list already has. */
export function addToList(view: SourceView, key: MetadataKey, item: string): TextEdit[] {
  const fm = readFrontmatter(view)
  const pair = fm.find(key)
  if (!pair || pair.value === null) {
    const edits = pair ? removeKey(view, key) : []
    return [...edits, fm.insertKey(key, `[${formatScalar(item)}]`)]
  }

  const node = pair.value
  if (isScalar(node)) {
    if (node.value === item) return []
    if (node.value === null)
      return [...removeKey(view, key), fm.insertKey(key, `[${formatScalar(item)}]`)]
    // A single value where a list is expected reads as a list of one; appending makes it a real list.
    const [start, end] = [fm.abs(node.range![0]), fm.abs(node.range![1])]
    const existing = view.text.slice(start, end)
    return [{ start, end, insert: `[${existing}, ${formatScalar(item)}]` }]
  }
  if (!isSeq(node)) throw new MetadataNotWritableError(`"${key}" is not a list`)

  const items = (node as YAMLSeq<Scalar>).items
  if (items.some((existing) => isScalar(existing) && existing.value === item)) return []
  const last = items.at(-1)

  if (node.flow) {
    if (!last) {
      const open = fm.abs(node.range![0]) + 1
      return [{ start: open, end: open, insert: formatScalar(item) }]
    }
    const end = fm.abs(last.range![1])
    return [{ start: end, end, insert: `, ${formatScalar(item)}` }]
  }

  if (!last) throw new MetadataNotWritableError(`"${key}" is an empty block list`)
  const dash = view.text.lastIndexOf('-', fm.abs(last.range![0]))
  const indent = view.text.slice(lineStart(view.text, dash), dash)
  const at = fm.abs(last.range![2])
  const lead = view.text[at - 1] === '\n' ? '' : view.eol
  return [{ start: at, end: at, insert: `${lead}${indent}- ${formatScalar(item)}${view.eol}` }]
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
  find(key: MetadataKey): KeyedPair | undefined
  insertKey(key: MetadataKey, formattedValue: string): TextEdit
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
      insertKey: (key, value) => ({
        start: at,
        end: at,
        insert: `---${eol}${key}: ${value}${eol}---${eol}`
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
  const find = (key: MetadataKey): KeyedPair | undefined =>
    pairs.find((pair) => pair.key.value === key)

  return {
    abs,
    find,
    insertKey(key, value) {
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
      return { start: at, end: at, insert: `${lead}${key}: ${value}${eol}` }
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
  return safe && value === value.trim() ? value : JSON.stringify(value)
}
