import { isCalendarDate, type Metadata, type MetadataReading } from '../metadata/read'
import type { BackReferenceKey, Problem } from '../problems/problem'
import type { RelationType } from '../relation'
import { STATUSES, isStatus, type Status } from '../status'
import { headingOf, proseLinesIn, type ProseLine } from '../text/prose'
import type { SourceView, Span } from '../text/source'
import { linkLine, targetOf } from './links'

const DATE_LINE = /^Date:[ \t]*(\S+)[ \t]*$/

type ListKey = RelationType | BackReferenceKey

/** What the words of a link line mean; adr-tools itself spells both directions with a "c". */
const LINK_WORDS = new Map<string, ListKey>([
  ['supersedes', 'supersedes'],
  ['supercedes', 'supersedes'],
  ['superseded by', 'superseded-by'],
  ['superceded by', 'superseded-by'],
  ['amends', 'amends'],
  ['amended by', 'amended-by']
])

/** A file of adr-tools taken apart: what its Status section and its `Date:` line say. */
export interface AdrToolsFile {
  readonly status: Status | undefined
  /** The Status text as written, when it is none of the five values. */
  readonly rawStatus?: string
  readonly created?: string
  readonly lists: ReadonlyMap<ListKey, readonly string[]>
  /** The Status section, from its heading to the next heading or the end of the file. */
  readonly section: Span
  /**
   * The first thing in the section that the Metadata does not hold, as it is written.
   * `undefined`: the Metadata holds all of it, and Migration takes the section out.
   */
  readonly keeps?: string
}

/**
 * Take a file apart the way adr-tools wrote it (docs/file-format.md, section 8): no
 * frontmatter, the Status and the links to other ADRs in a `## Status` section, the day it
 * was created on a `Date:` line. `undefined` when the file is not one of adr-tools'.
 * Like every reader it never throws, whatever the file says.
 */
export function parseAdrTools(view: SourceView): AdrToolsFile | undefined {
  if (view.frontmatter || view.unterminatedFrontmatter) return undefined
  const lines = proseLinesIn(view.text, view.bodyStart)
  const heading = lines.findIndex((line) => isStatusHeading(line.content))
  if (heading === -1) return undefined

  const lists = new Map<ListKey, string[]>()
  const statusText: ProseLine[] = []
  // What the Metadata does not hold, with where it stands: the first of them is named.
  const kept: { at: number; what: string }[] = []
  let end = view.text.length
  let previous = lines[heading]!
  const rest = lines.slice(heading + 1)
  for (const line of rest) {
    // Lines that are missing between two prose lines are a code block.
    if (line.start !== previous.next) kept.push({ at: previous.next, what: 'a code block' })
    const next = headingOf(line.content)
    if (next) {
      end = line.start
      // What stands under a deeper heading would change its place in the document.
      if (next.level > 2) kept.push({ at: line.start, what: line.content.trim() })
      break
    }
    previous = line

    const content = line.content.trim()
    if (!content) continue
    const link = linkLine(content)
    if (!link) {
      statusText.push(line)
      continue
    }
    const key = LINK_WORDS.get(link.words.replace(/\s+/g, ' ').toLowerCase())
    const target = targetOf(link.target)
    if (!key || !target) {
      kept.push({ at: line.start, what: content })
      continue
    }
    const list = lists.get(key) ?? []
    if (!list.includes(target)) lists.set(key, [...list, target])
  }
  if (end === view.text.length && previous.next !== end) {
    kept.push({ at: previous.next, what: 'a code block' })
  }
  // Only the first Status section is read. With a second one left in the text, the file
  // would say two things about its Status after Migration.
  const second = rest.find((line) => line.start >= end && isStatusHeading(line.content))
  if (second) kept.push({ at: second.start, what: 'a second Status section' })

  const written = statusText.map((line) => line.content.trim()).join(' ')
  const known = isStatus(written.toLowerCase()) ? (written.toLowerCase() as Status) : undefined
  const status: Status | undefined = lists.has('superseded-by')
    ? 'superseded'
    : (known ?? (written ? undefined : 'accepted'))
  const rawStatus = status === undefined ? written : undefined
  // Status text that a "superseded by" line overruled, or that the tool does not know, stays.
  if (written && (known === undefined || known !== status)) {
    kept.push({ at: statusText[0]!.start, what: statusText[0]!.content.trim() })
  }
  const uncaptured = kept.sort((one, other) => one.at - other.at)[0]?.what

  const created = createdOn(lines.slice(0, heading))
  return {
    status,
    ...(rawStatus !== undefined && { rawStatus }),
    ...(created !== undefined && { created }),
    lists,
    section: { start: lines[heading]!.start, end },
    ...(uncaptured !== undefined && { keeps: uncaptured })
  }
}

/**
 * The Metadata of a file of adr-tools. `defaults` is the Metadata of a file that says
 * nothing; what is read here is laid over it.
 */
export function readAdrTools(
  view: SourceView,
  adr: string,
  defaults: Metadata
): Pick<MetadataReading, 'metadata' | 'problems'> | undefined {
  const file = parseAdrTools(view)
  if (!file) return undefined

  const problems: Problem[] = []
  if (file.rawStatus !== undefined) {
    const detail = `"${file.rawStatus}" is not one of ${STATUSES.join(', ')}`
    problems.push({ kind: 'invalid-metadata', adr, key: 'status', detail })
  }
  return {
    metadata: {
      ...defaults,
      status: file.status,
      ...(file.rawStatus !== undefined && { rawStatus: file.rawStatus }),
      ...(file.created !== undefined && { created: file.created }),
      relations: {
        ...defaults.relations,
        supersedes: file.lists.get('supersedes') ?? [],
        amends: file.lists.get('amends') ?? []
      },
      backReferences: {
        'superseded-by': file.lists.get('superseded-by') ?? [],
        'amended-by': file.lists.get('amended-by') ?? []
      }
    },
    problems
  }
}

function isStatusHeading(line: string): boolean {
  const heading = headingOf(line)
  return heading?.level === 2 && heading.text.toLowerCase() === 'status'
}

/** The first `Date: 2016-02-12` on a line of its own before the first level-two heading. */
function createdOn(lines: readonly ProseLine[]): string | undefined {
  for (const line of lines) {
    if (headingOf(line.content)?.level === 2) return undefined
    const date = DATE_LINE.exec(line.content)?.[1]
    if (date !== undefined) return isCalendarDate(date) ? date : undefined
  }
  return undefined
}
