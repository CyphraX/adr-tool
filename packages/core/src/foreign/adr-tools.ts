import { isCalendarDate, type Metadata, type MetadataReading } from '../metadata/read'
import type { BackReferenceKey, Problem } from '../problems/problem'
import type { RelationType } from '../relation'
import { STATUSES, isStatus, type Status } from '../status'
import { headingOf, proseLines } from '../text/prose'
import type { SourceView } from '../text/source'
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

/**
 * Read a file the way adr-tools wrote it (docs/file-format.md, section 8): no frontmatter,
 * the Status and the links to other ADRs in a `## Status` section, the day it was created
 * on a `Date:` line. `undefined` when the file is not one of adr-tools'.
 *
 * `defaults` is the Metadata of a file that says nothing; what is read here is laid over it.
 * Like every reader it never throws, whatever the file says.
 */
export function readAdrTools(
  view: SourceView,
  adr: string,
  defaults: Metadata
): Pick<MetadataReading, 'metadata' | 'problems'> | undefined {
  if (view.frontmatter || view.unterminatedFrontmatter) return undefined
  const lines = proseLines(view.text, view.bodyStart)
  const heading = lines.findIndex(isStatusHeading)
  if (heading === -1) return undefined

  const lists = new Map<ListKey, string[]>()
  const statusText: string[] = []
  for (const line of lines.slice(heading + 1)) {
    if (headingOf(line)) break
    const content = line.trim()
    if (!content) continue
    const link = linkLine(content)
    if (!link) {
      statusText.push(content)
      continue
    }
    const key = LINK_WORDS.get(link.words.replace(/\s+/g, ' ').toLowerCase())
    const target = targetOf(link.target)
    if (!key || !target) continue
    const list = lists.get(key) ?? []
    if (!list.includes(target)) lists.set(key, [...list, target])
  }

  const problems: Problem[] = []
  const written = statusText.join(' ')
  let status: Status | undefined = 'accepted'
  let rawStatus: string | undefined
  if (lists.has('superseded-by')) status = 'superseded'
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
        ...defaults.relations,
        supersedes: lists.get('supersedes') ?? [],
        amends: lists.get('amends') ?? []
      },
      backReferences: {
        'superseded-by': lists.get('superseded-by') ?? [],
        'amended-by': lists.get('amended-by') ?? []
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
function createdOn(lines: readonly string[]): string | undefined {
  for (const line of lines) {
    if (headingOf(line)?.level === 2) return undefined
    const date = DATE_LINE.exec(line)?.[1]
    if (date !== undefined) return isCalendarDate(date) ? date : undefined
  }
  return undefined
}
