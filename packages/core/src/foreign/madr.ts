import { isMap, isScalar, isSeq, parseDocument } from 'yaml'
import type { Adr } from '../adr/adr'
import type { Metadata, MetadataReading } from '../metadata/read'
import { scalarText } from '../metadata/scalar'
import type { Problem } from '../problems/problem'
import { STATUSES, isStatus, type Status } from '../status'
import { headingOf, proseLines } from '../text/prose'
import type { SourceView } from '../text/source'
import { linkLine, targetOf } from './links'

type Reading = Pick<MetadataReading, 'metadata' | 'problems'>

/** The ID of the one ADR of the Decision Log that has this number, if there is exactly one. */
export type ByNumber = (number: number) => string | undefined

const SUPERSEDED_BY = /^super[sc]eded[ \t]+by(?![^\s:])/i
const STATUS_ITEM = /^ {0,3}[*+-][ \t]+status[ \t]*:/i
const LIST_ITEM = /^ {0,3}[*+-](?:[ \t]|$)/
const THEMATIC_BREAK = /^(?:\*{3,}|-{3,}|_{3,})$/

/**
 * Read a file the way MADR wrote it (docs/file-format.md, section 8), laid over what the
 * tool's own reader made of it. `undefined` when the file says nothing that the own format
 * cannot say: most of MADR 3 and 4 is valid as it stands.
 */
export function readMadr(
  view: SourceView,
  adr: string,
  own: Reading,
  byNumber: ByNumber
): { reading: Reading; successor?: string } | undefined {
  const keys = frontmatterOf(view)
  const written = keys.get('status')
  const inFrontmatter = written !== undefined && SUPERSEDED_BY.test(written.text)
  const listed = keys.has('status') ? undefined : listedStatus(view)
  const named = keys.has('decision-makers') ? [] : (keys.get('deciders')?.items ?? [])
  const deciders = named.length > 0 ? named : undefined
  if (!inFrontmatter && listed === undefined && !deciders) return undefined

  let { metadata } = own
  let problems = own.problems
  if (deciders) metadata = { ...metadata, decisionMakers: deciders }

  let successor: string | undefined

  const text = inFrontmatter ? written.text : listed
  if (text !== undefined) {
    const status = readStatus(text, byNumber)
    successor = status.supersededBy[0]
    // What the own reader said about a Status it could not know is said again here, or not at all.
    problems = problems.filter(
      (problem) => !(problem.kind === 'invalid-metadata' && problem.key === 'status')
    )
    metadata = {
      ...withoutRawStatus(metadata),
      status: status.status,
      ...(status.rawStatus !== undefined && { rawStatus: status.rawStatus }),
      backReferences: {
        ...metadata.backReferences,
        'superseded-by': [
          ...metadata.backReferences['superseded-by'],
          ...status.supersededBy.filter(
            (id) => !metadata.backReferences['superseded-by'].includes(id)
          )
        ]
      }
    }
    if (status.rawStatus !== undefined) {
      const detail = `"${status.rawStatus}" is not one of ${STATUSES.join(', ')}`
      problems = [...problems, { kind: 'invalid-metadata', adr, key: 'status', detail } as Problem]
    }
  }
  return { reading: { metadata, problems }, ...(successor !== undefined && { successor }) }
}

function withoutRawStatus(metadata: Metadata): Omit<Metadata, 'rawStatus'> {
  const copy: { -readonly [K in keyof Metadata]: Metadata[K] } = { ...metadata }
  delete copy.rawStatus
  return copy
}

/** The number an identifier names: `ADR-0005`, `ADR 5`, `0005`, `5`, `#5`. */
export function numberNamedBy(identifier: string): number | undefined {
  const match = /^(?:adr[ \t-]?|#)?(\d{1,9})$/i.exec(identifier.trim())
  return match ? Number(match[1]) : undefined
}

function readStatus(
  text: string,
  byNumber: ByNumber
): { status: Status | undefined; rawStatus?: string; supersededBy: string[] } {
  const lowered = text.toLowerCase()
  if (isStatus(lowered)) return { status: lowered, supersededBy: [] }
  const phrase = SUPERSEDED_BY.exec(text)
  if (!phrase) return { status: undefined, rawStatus: text, supersededBy: [] }

  // A value of several lines is one text, as YAML folds it.
  let target = text.slice(phrase[0].length).replace(/\s+/g, ' ').trim()
  if (target.startsWith(':')) target = target.slice(1).trim()
  if (!target) return { status: 'superseded', supersededBy: [] }
  const link = linkLine(`superseded by ${target}`)
  const linked = link && targetOf(link.target)
  const number = numberNamedBy(target)
  const named = number === undefined ? undefined : byNumber(number)
  return { status: 'superseded', supersededBy: [linked ?? named ?? target] }
}

interface Key {
  /** The value as a single text; empty for a list. */
  readonly text: string
  /** The value as a list: a single value is a list of one. */
  readonly items: readonly string[]
}

/** The keys of the frontmatter this reader looks at. Nothing when the frontmatter cannot be read. */
function frontmatterOf(view: SourceView): Map<string, Key> {
  const keys = new Map<string, Key>()
  if (!view.frontmatter) return keys
  const doc = parseDocument(view.text.slice(view.frontmatter.start, view.frontmatter.end))
  if (doc.errors.length > 0 || !isMap(doc.contents)) return keys
  for (const pair of doc.contents.items) {
    const key = scalarText(pair.key)
    if (key !== 'status' && key !== 'deciders' && key !== 'decision-makers') continue
    const value = pair.value
    const items = isSeq(value) ? value.items.map((item) => scalarText(item)) : [scalarText(value)]
    keys.set(key, {
      text: isScalar(value) ? (scalarText(value) ?? '') : '',
      items: [...new Set(items.filter((item) => item !== undefined))]
    })
  }
  return keys
}

/**
 * MADR 2 and log4brains: `* Status: …` in the first list of the body, before the first
 * level-two heading. A comment behind the value is the template's, not the author's.
 */
function listedStatus(view: SourceView): string | undefined {
  let inList = false
  for (const line of proseLines(view.text, view.bodyStart)) {
    if (headingOf(line)?.level === 2) return undefined
    if (LIST_ITEM.test(line) && !THEMATIC_BREAK.test(line.replace(/[ \t]/g, ''))) {
      inList = true
      if (!STATUS_ITEM.test(line)) continue
      return withoutComments(line.slice(line.indexOf(':') + 1)).trim() || undefined
    }
    // A list ends with the first line that is neither an item, nor blank, nor indented under one.
    if (inList && line.trim() !== '' && !/^[ \t]/.test(line)) return undefined
  }
  return undefined
}

/** `<!-- optional -->`: what the template says about a value is not the value. */
function withoutComments(value: string): string {
  let rest = value
  for (let open = rest.indexOf('<!--'); open !== -1; open = rest.indexOf('<!--')) {
    const close = rest.indexOf('-->', open + 4)
    rest = rest.slice(0, open) + (close === -1 ? '' : rest.slice(close + 3))
  }
  return rest
}

/** Whether a file of MADR names this number as its successor without naming an ADR by it (yet). */
export function namesNumber(adr: Adr, number: number | undefined): boolean {
  if (adr.foreign !== 'madr' || number === undefined) return false
  return adr.metadata.backReferences['superseded-by'].some(
    (written) => numberNamedBy(written) === number
  )
}
