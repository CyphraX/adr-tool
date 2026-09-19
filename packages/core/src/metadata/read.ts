import { isMap, isScalar, isSeq, parseDocument } from 'yaml'
import type { YAMLMap } from 'yaml'
import type { BackReferenceKey, Problem } from '../problems/problem'
import { RELATION_TYPES, type RelationType } from '../relation'
import { STATUSES, isStatus, type Status } from '../status'
import type { SourceView } from '../text/source'
import { METADATA_KEYS, type MetadataKey } from './keys'
import { scalarText } from './scalar'

export interface Correction {
  readonly date: string
  readonly author?: string
  readonly note?: string
}

/** The Metadata of an ADR as read from its file, with every default applied. */
export interface Metadata {
  /** `accepted` when the key is absent; `undefined` when the value is none of the five. */
  readonly status: Status | undefined
  /** The Status exactly as written, when it is none of the five values. */
  readonly rawStatus?: string
  readonly created?: string
  readonly decided?: string
  readonly decisionMakers: readonly string[]
  readonly tags: readonly string[]
  readonly relations: Readonly<Record<RelationType, readonly string[]>>
  readonly backReferences: Readonly<Record<BackReferenceKey, readonly string[]>>
  readonly corrections: readonly Correction[]
  /** Which of the tool's keys the file actually contains, in the order of `METADATA_KEYS`. */
  readonly present: readonly MetadataKey[]
}

export interface MetadataReading {
  readonly metadata: Metadata
  readonly problems: readonly Problem[]
  /** `false` when the tool must not write Metadata into this file until a person has fixed it. */
  readonly writable: boolean
}

/** Read the Metadata of the ADR `adr` tolerantly. Never throws: what cannot be read becomes a Problem. */
export function readMetadata(view: SourceView, adr: string): MetadataReading {
  if (view.unterminatedFrontmatter) return unreadable({ kind: 'unterminated-frontmatter', adr })
  if (!view.frontmatter)
    return { metadata: metadataFrom(undefined, adr, []), problems: [], writable: true }

  const doc = parseDocument(view.text.slice(view.frontmatter.start, view.frontmatter.end))
  if (doc.errors.length > 0) {
    const detail = doc.errors[0]!.message.split('\n')[0]!
    return unreadable({ kind: 'invalid-frontmatter', adr, detail })
  }
  if (doc.contents !== null && !isMap(doc.contents)) {
    return unreadable({
      kind: 'invalid-frontmatter',
      adr,
      detail: 'The frontmatter is not a mapping'
    })
  }
  const problems: Problem[] = []
  const metadata = metadataFrom(doc.contents ?? undefined, adr, problems)
  return { metadata, problems, writable: true }
}

function unreadable(problem: Problem): MetadataReading {
  return { metadata: metadataFrom(undefined, '', []), problems: [problem], writable: false }
}

function metadataFrom(map: YAMLMap | undefined, adr: string, problems: Problem[]): Metadata {
  const nodes = new Map<MetadataKey, unknown>()
  const present = new Set<MetadataKey>()
  for (const pair of map?.items ?? []) {
    const key = scalarText(pair.key) as MetadataKey | undefined
    if (!key || !METADATA_KEYS.includes(key)) continue
    present.add(key)
    if (pair.value !== null) nodes.set(key, pair.value)
  }
  const invalid = (key: MetadataKey, detail: string): void => {
    problems.push({ kind: 'invalid-metadata', adr, key, detail })
  }

  const text = (key: MetadataKey): string | undefined => {
    const node = nodes.get(key)
    if (node !== undefined && !isScalar(node)) invalid(key, 'Expected a single value')
    return scalarText(node)
  }

  const date = (key: MetadataKey): string | undefined => {
    const value = text(key)
    if (value === undefined || isCalendarDate(value)) return value
    invalid(key, `"${value}" is not a date of the form YYYY-MM-DD`)
    return undefined
  }

  const list = (key: MetadataKey): string[] => {
    const node = nodes.get(key)
    if (node === undefined) return []
    // A single value where a list is expected reads as a list of one.
    if (isScalar(node)) {
      const only = scalarText(node)
      return only === undefined ? [] : [only]
    }
    if (!isSeq(node)) {
      invalid(key, 'Expected a list')
      return []
    }
    const items: string[] = []
    for (const item of node.items) {
      const value = scalarText(item)
      if (value === undefined) invalid(key, 'Expected a list of single values')
      else if (!items.includes(value)) items.push(value)
    }
    return items
  }

  const corrections = (): Correction[] => {
    const node = nodes.get('corrections')
    if (node === undefined) return []
    if (!isSeq(node)) {
      invalid('corrections', 'Expected a list of corrections')
      return []
    }
    const entries: Correction[] = []
    for (const item of node.items) {
      const when = isMap(item) ? scalarText(item.get('date', true)) : undefined
      if (!isMap(item) || when === undefined || !isCalendarDate(when)) {
        invalid('corrections', 'Every correction needs a date of the form YYYY-MM-DD')
        continue
      }
      const author = scalarText(item.get('author', true))
      const note = scalarText(item.get('note', true))
      entries.push({ date: when, ...(author && { author }), ...(note && { note }) })
    }
    return entries
  }

  const written = text('status')
  let status: Status | undefined = 'accepted'
  let rawStatus: string | undefined
  if (written !== undefined && isStatus(written)) {
    status = written
  } else if (written !== undefined) {
    const lowered = written.toLowerCase()
    if (isStatus(lowered)) {
      status = lowered
      problems.push({ kind: 'status-not-lowercase', adr, written })
    } else {
      status = undefined
      rawStatus = written
      invalid('status', `"${written}" is not one of ${STATUSES.join(', ')}`)
    }
  }

  const created = date('created')
  const decided = date('decided')
  if (decided !== undefined && status === 'proposed') {
    invalid('decided', 'A proposed ADR has not been decided yet')
  }

  return {
    status,
    ...(rawStatus !== undefined && { rawStatus }),
    ...(created !== undefined && { created }),
    ...(decided !== undefined && { decided }),
    decisionMakers: list('decision-makers'),
    tags: list('tags'),
    relations: Object.fromEntries(RELATION_TYPES.map((type) => [type, list(type)])) as Record<
      RelationType,
      string[]
    >,
    backReferences: {
      'superseded-by': list('superseded-by'),
      'amended-by': list('amended-by')
    },
    corrections: corrections(),
    present: METADATA_KEYS.filter((key) => present.has(key))
  }
}

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  )
}
