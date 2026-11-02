import type { MetadataReading } from '../metadata/read'
import type { Problem } from '../problems/problem'
import { RELATION_TYPES, type RelationType } from '../relation'
import { STATUSES, type Status } from '../status'
import { headingOf, proseLinesIn, type ProseLine } from '../text/prose'
import type { SourceView, Span } from '../text/source'
import { LINK_WORDS, type ListKey } from './adr-tools'
import { linkLine, namesAdr, targetOf } from './links'
import {
  decidersOf,
  frontmatterOf,
  readStatus,
  withoutComments,
  type ByNumber,
  type ForeignSign
} from './madr'

/**
 * MADR 2 and log4brains (docs/file-format.md, section 8): the Metadata in the first list under
 * the title — `* Status: accepted`, `* Deciders: …`, log4brains' `- Tags: …` — and the links to
 * other ADRs in a `## Links` section.
 */

const ITEM = /^ {0,3}[*+-](?:[ \t]|$)/
const NAMED_ITEM = /^ {0,3}[*+-][ \t]+([A-Za-z]+)[ \t]*:(.*)$/
const THEMATIC_BREAK = /^(?:\*{3,}|-{3,}|_{3,})$/

/** An item of the list under the title that the reader looks at. */
export interface ListedItem {
  /** Without the comments behind it; never empty. */
  readonly value: string
  /** The whole line, with its line break. */
  readonly line: Span
  /**
   * The item runs on over more lines — indented ones, nested items, a code block, a line right
   * under it —: only its first is read, and it is never taken out.
   */
  readonly continued: boolean
  /** The list has another item of this name: only the first is read, and neither is taken out. */
  readonly repeated: boolean
}

/** A file of MADR 2 or log4brains taken apart, before anything in it is resolved. */
export interface MadrListFile {
  readonly status?: ListedItem
  readonly deciders?: ListedItem
  readonly tags?: ListedItem
  /** The list under the title: how many items it has, and what goes when all of them go. */
  readonly list: { readonly items: number; readonly whole: Span }
  readonly links?: {
    readonly lists: ReadonlyMap<ListKey, readonly string[]>
    /** From its heading to the next heading, or the end of the file. */
    readonly section: Span
    /** What in it the Metadata does not hold, as it is written. Empty: it can go. */
    readonly keeps: readonly string[]
  }
}

/** A Deciders or Tags value in square brackets as a whole is the template's placeholder. */
const placeholder = (value: string): boolean => /^\[[^\]]*\]$/.test(value)

/**
 * Take a file apart the way MADR 2 and log4brains write it. `undefined` when it is not one of
 * theirs: it has a `status` key, or its first list has neither a Status nor Deciders.
 */
export function parseMadrList(view: SourceView): MadrListFile | undefined {
  if (view.unterminatedFrontmatter) return undefined
  if (frontmatterOf(view).has('status')) return undefined
  const lines = proseLinesIn(view.text, view.bodyStart)
  const list = firstList(view, lines)
  if (!list) return undefined
  const { status, deciders } = list.named
  if (!status && !(deciders && !placeholder(deciders.value))) return undefined
  const links = linksOf(view, lines)
  return {
    ...list.named,
    list: { items: list.items, whole: list.whole },
    ...(links && { links })
  }
}

/**
 * The Metadata of a file of MADR 2 or log4brains, laid over what the own reader made of its
 * frontmatter, if it has one. `undefined` when the file is not one of theirs.
 */
export function readMadrList(
  view: SourceView,
  adr: string,
  own: Pick<MetadataReading, 'metadata' | 'problems'>,
  byNumber: ByNumber
):
  | {
      reading: Pick<MetadataReading, 'metadata' | 'problems'>
      successor?: string
      signs: ForeignSign[]
    }
  | undefined {
  const file = parseMadrList(view)
  if (!file) return undefined
  const read = readOf(view, file, byNumber)
  const { metadata } = own
  const problems: Problem[] = [...own.problems]
  if (read.rawStatus !== undefined) {
    const detail = `"${read.rawStatus}" is not one of ${STATUSES.join(', ')}`
    problems.push({ kind: 'invalid-metadata', adr, key: 'status', detail })
  }
  // What the own reader checks against the Status, it could not check without one.
  if (metadata.decided !== undefined && read.status === 'proposed') {
    const detail = 'A proposed ADR has not been decided yet'
    problems.push({ kind: 'invalid-metadata', adr, key: 'decided', detail })
  }
  const merged = (key: ListKey, written: readonly string[]): string[] => [
    ...new Set([...written, ...(read.lists.get(key) ?? [])])
  ]
  return {
    reading: {
      metadata: {
        ...metadata,
        status: read.status,
        ...(read.rawStatus !== undefined && { rawStatus: read.rawStatus }),
        decisionMakers: read.decisionMakers ?? metadata.decisionMakers,
        tags: read.tags ?? metadata.tags,
        relations: Object.fromEntries(
          RELATION_TYPES.map((type) => [type, merged(type, metadata.relations[type])])
        ) as Record<RelationType, string[]>,
        backReferences: {
          'superseded-by': merged('superseded-by', metadata.backReferences['superseded-by']),
          'amended-by': merged('amended-by', metadata.backReferences['amended-by'])
        }
      },
      problems
    },
    ...(read.successor !== undefined && { successor: read.successor }),
    signs: [
      ...(file.status ? (['listed-status'] as const) : []),
      ...(file.deciders && !placeholder(file.deciders.value) ? (['listed-deciders'] as const) : []),
      ...(read.renamesDeciders ? (['deciders'] as const) : [])
    ]
  }
}

/** What a file of MADR 2 or log4brains says, resolved; and which items of its list say it. */
export function readOf(
  view: SourceView,
  file: MadrListFile,
  byNumber: ByNumber
): {
  status: Status | undefined
  rawStatus?: string
  successor?: string
  decisionMakers?: string[]
  /** MADR 3's `deciders` in the frontmatter, which Migration renames. */
  renamesDeciders: boolean
  tags?: string[]
  lists: ReadonlyMap<ListKey, readonly string[]>
  /** The items whose value the Metadata holds afterwards. */
  read: readonly ListedItem[]
} {
  const keys = frontmatterOf(view)
  const read: ListedItem[] = []
  const lists = new Map<ListKey, readonly string[]>(file.links?.lists ?? [])

  let status: Status | undefined = 'accepted'
  let rawStatus: string | undefined
  let successor: string | undefined
  if (file.status) {
    const value = file.status.value
    const reading =
      value.toLowerCase() === 'draft'
        ? { status: 'proposed' as const, supersededBy: [] }
        : readStatus(value, byNumber)
    status = reading.status
    if (reading.rawStatus !== undefined) rawStatus = reading.rawStatus
    else read.push(file.status)
    successor = reading.supersededBy[0]
    if (successor !== undefined) {
      const written = lists.get('superseded-by') ?? []
      if (!written.includes(successor)) lists.set('superseded-by', [...written, successor])
    }
  }

  // What the frontmatter says comes first: the item is not read then, and stays.
  const deciders = decidersOf(keys)
  let decisionMakers: string[] | undefined = deciders && [...deciders]
  if (!keys.has('decision-makers') && !keys.has('deciders') && file.deciders) {
    if (!placeholder(file.deciders.value)) {
      decisionMakers = [file.deciders.value]
      read.push(file.deciders)
    }
  }
  let tags: string[] | undefined
  if (!keys.has('tags') && file.tags && !placeholder(file.tags.value)) {
    tags = [...new Set(file.tags.value.split(/[\s,]+/).filter(Boolean))]
    read.push(file.tags)
  }
  return {
    status,
    ...(rawStatus !== undefined && { rawStatus }),
    ...(successor !== undefined && { successor }),
    ...(decisionMakers && { decisionMakers }),
    renamesDeciders: deciders !== undefined,
    ...(tags && { tags }),
    lists,
    read
  }
}

type Name = 'status' | 'deciders' | 'tags'
const NAMES: readonly string[] = ['status', 'deciders', 'tags']

/** How far a line is indented, in spaces. */
const indentOf = (content: string): number => /^ */.exec(content)![0].length

const isMarker = (content: string): boolean =>
  ITEM.test(content) && !THEMATIC_BREAK.test(content.replace(/[ \t]/g, ''))

/**
 * The first list of the body, before the first level-two heading: the first run of bullet
 * items outside a code block. An item runs on over the lines indented under it — nested
 * items and code blocks among them — and over a line of text right under it, as Markdown
 * reads it. The list ends at the first line that is none of these, nor an item, nor blank.
 */
function firstList(
  view: SourceView,
  lines: readonly ProseLine[]
):
  | {
      named: { [name in Name]?: ListedItem }
      items: number
      whole: Span
    }
  | undefined {
  const named: { [name in Name]?: ListedItem } = {}
  let items = 0
  let first: ProseLine | undefined
  let last: ProseLine | undefined
  let indent = 0
  let blankBefore = false
  let current: Name | undefined
  let after = view.text.length
  const runsOn = (): void => {
    const item = current && named[current]
    if (item) named[current!] = { ...item, continued: true }
  }
  for (const line of lines) {
    const { content } = line
    const heading = headingOf(content)
    if (heading?.level === 2 && !first) return undefined
    if (!first) {
      if (!isMarker(content)) continue
      first = line
      indent = indentOf(content)
    } else if (last && line.start !== last.next) {
      // Lines missing in between are a code block. Indented, it is part of the item above it;
      // otherwise the list ended before it.
      if (!/^[ \t]/.test(view.text.slice(last.next, last.next + 1))) {
        after = last.next
        break
      }
      runsOn()
      blankBefore = false
    }
    if (isMarker(content) && indentOf(content) <= indent) {
      items++
      last = line
      blankBefore = false
      current = undefined
      const match = NAMED_ITEM.exec(content)
      const name = match?.[1]!.toLowerCase()
      const value = match ? withoutComments(match[2]!).trim() : ''
      if (name !== undefined && NAMES.includes(name) && value !== '') {
        const known = name as Name
        const before = named[known]
        if (before) named[known] = { ...before, repeated: true }
        else {
          named[known] = {
            value,
            line: { start: line.start, end: line.next },
            continued: false,
            repeated: false
          }
          current = known
        }
      }
      continue
    }
    if (content.trim() === '') {
      last = line
      blankBefore = true
      continue
    }
    const indented = /^[ \t]/.test(content) && !heading
    const lazy = !blankBefore && !heading && !isMarker(content)
    if (indented || lazy) {
      runsOn()
      last = line
      blankBefore = false
      continue
    }
    after = line.start
    break
  }
  if (!first) return undefined
  return { named, items, whole: wholeList(view, first.start, after) }
}

/**
 * What goes when every item of the list goes: from its first item to the next text, with the
 * blank lines in between — but one, when there is text right above the list, so that the two
 * paragraphs stay apart. At the end of the file the blank lines in front of it go as well.
 */
function wholeList(view: SourceView, start: number, after: number): Span {
  const { text, bodyStart } = view
  // `after` may lie behind blank lines that belong to the list already.
  if (after < text.length) {
    const above = start > bodyStart ? text.slice(text.lastIndexOf('\n', start - 2) + 1, start) : ''
    const blank = text.lastIndexOf('\n', after - 2) + 1
    const textAbove = above.trim() !== '' && !headingOf(above.replace(/\r?\n$/, ''))
    if (textAbove && blank > start && text.slice(blank, after).trim() === '') {
      return { start, end: blank }
    }
    return { start, end: after }
  }
  let from = start
  while (from > bodyStart) {
    const before = from < 2 ? -1 : text.lastIndexOf('\n', from - 2)
    const line = Math.max(before + 1, bodyStart)
    if (text.slice(line, from).trim() !== '') break
    from = line
  }
  return { start: from, end: text.length }
}

/** The `## Links` section of MADR 2 and log4brains: one link to another ADR per item. */
function linksOf(view: SourceView, lines: readonly ProseLine[]): MadrListFile['links'] {
  const heading = lines.findIndex((line) => {
    const found = headingOf(line.content)
    return found?.level === 2 && withoutComments(found.text).trim().toLowerCase() === 'links'
  })
  if (heading === -1) return undefined
  const lists = new Map<ListKey, Set<string>>()
  const kept: string[] = []
  let end = view.text.length
  let previous = lines[heading]!
  for (const line of lines.slice(heading + 1)) {
    if (line.start !== previous.next) kept.push('a code block')
    const next = headingOf(line.content)
    if (next) {
      end = line.start
      // What stands under a deeper heading would change its place in the document.
      if (next.level > 2) kept.push(line.content.trim())
      break
    }
    previous = line
    const content = line.content.trim()
    if (!content) continue
    const item = ITEM.exec(line.content)
    const said = withoutComments(item ? line.content.slice(item[0].length) : content).trim()
    const link = item ? linkLine(said) : undefined
    const target = link && targetOf(link.target)
    const words = link && LINK_WORDS.get(link.words.replace(/\s+/g, ' ').toLowerCase())
    // Other words relate the two ADRs; what they say is not in the Metadata.
    if (!words || !target) kept.push(said)
    // Without words of the format, only a link to an ADR is a Relation: `See [the guide](guide.md)` is none.
    if (!target || (!words && !namesAdr(target))) continue
    const key = words ?? 'relates-to'
    const list = lists.get(key) ?? new Set<string>()
    lists.set(key, list.add(target))
  }
  if (end === view.text.length && previous.next !== end) kept.push('a code block')
  return {
    lists: new Map([...lists].map(([key, targets]) => [key, [...targets]])),
    section: { start: lines[heading]!.start, end },
    keeps: kept
  }
}
