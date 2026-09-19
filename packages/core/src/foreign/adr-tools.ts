import { isCalendarDate, type Metadata, type MetadataReading } from '../metadata/read'
import type { BackReferenceKey, Problem } from '../problems/problem'
import type { RelationType } from '../relation'
import { STATUSES, isStatus, type Status } from '../status'
import type { SourceView } from '../text/source'
import { headingOf, proseLines, type ProseLine } from '../text/prose'

/** `<words> [<label>](<target>)` and nothing else: how adr-tools writes a link to another ADR. */
const LINK_LINE = /^([^[\]]+?)[ \t]*\[.*\]\([ \t]*([^()\s]+)[ \t]*\)[ \t]*$/
/** A bare file name in the same directory. A path, a URL or an anchor names no ADR. */
const ADR_FILE = /^(?:\.\/)?([^/\\#?:]+)\.md$/
const DATE_LINE = /^Date:[ \t]*(\S+)[ \t]*$/

/** What the words of a link line mean; adr-tools itself spells both directions with a "c". */
const LINK_WORDS: Record<string, RelationType | BackReferenceKey> = {
  supersedes: 'supersedes',
  supercedes: 'supersedes',
  'superseded by': 'superseded-by',
  'superceded by': 'superseded-by',
  amends: 'amends',
  'amended by': 'amended-by'
}

/**
 * Read a file the way adr-tools wrote it (docs/file-format.md, section 8): no frontmatter,
 * the Status and the links to other ADRs in a `## Status` section, the day it was created
 * on a `Date:` line. `undefined` when the file is not one of adr-tools'.
 *
 * `defaults` is the Metadata of a file that says nothing; what is read here is laid over it.
 */
export function readAdrTools(
  view: SourceView,
  adr: string,
  defaults: Metadata
): Pick<MetadataReading, 'metadata' | 'problems'> | undefined {
  if (view.frontmatter || view.unterminatedFrontmatter) return undefined
  const lines = proseLines(view.text, view.bodyStart)
  const heading = lines.findIndex((line) => isStatusHeading(line))
  if (heading === -1) return undefined

  const lists: Record<RelationType | BackReferenceKey, string[]> = {
    supersedes: [],
    amends: [],
    'depends-on': [],
    'relates-to': [],
    'superseded-by': [],
    'amended-by': []
  }
  const statusText: string[] = []
  for (const line of lines.slice(heading + 1)) {
    if ((headingOf(line.content)?.level ?? 3) <= 2) break
    const content = line.content.trim()
    if (!content) continue
    const link = LINK_LINE.exec(content)
    if (!link) {
      statusText.push(content)
      continue
    }
    const key = LINK_WORDS[link[1]!.replace(/\s+/g, ' ').replace(/ ?:$/, '').toLowerCase()]
    const target = ADR_FILE.exec(link[2]!)?.[1]
    if (key && target && !lists[key].includes(target)) lists[key].push(target)
  }

  const problems: Problem[] = []
  const written = statusText.join(' ')
  let status: Status | undefined = 'accepted'
  let rawStatus: string | undefined
  if (lists['superseded-by'].length > 0) status = 'superseded'
  else if (isStatus(written.toLowerCase())) status = written.toLowerCase() as Status
  else if (written) {
    status = undefined
    rawStatus = written
    const detail = `"${written}" is not one of ${STATUSES.join(', ')}`
    problems.push({ kind: 'invalid-metadata', adr, key: 'status', detail })
  }

  const created = createdOn(lines.slice(0, heading))
  return {
    metadata: {
      ...defaults,
      status,
      ...(rawStatus !== undefined && { rawStatus }),
      ...(created !== undefined && { created }),
      relations: {
        supersedes: lists.supersedes,
        amends: lists.amends,
        'depends-on': [],
        'relates-to': []
      },
      backReferences: {
        'superseded-by': lists['superseded-by'],
        'amended-by': lists['amended-by']
      }
    },
    problems
  }
}

function isStatusHeading(line: ProseLine): boolean {
  const heading = headingOf(line.content)
  return heading?.level === 2 && heading.text.toLowerCase() === 'status'
}

/** `Date: 2016-02-12` on a line of its own before the first level-two heading. */
function createdOn(lines: readonly ProseLine[]): string | undefined {
  for (const line of lines) {
    if (headingOf(line.content)?.level === 2) return undefined
    const date = DATE_LINE.exec(line.content)?.[1]
    if (date !== undefined) return isCalendarDate(date) ? date : undefined
  }
  return undefined
}
