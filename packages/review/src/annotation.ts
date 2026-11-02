import { isMap, isScalar, isSeq, parseDocument, type YAMLMap } from 'yaml'
import { isDay, isObjectName, normalizePath } from '@adr-tool/kernel'
import type { ReviewProblem } from './problems'
import type { ReviewSaid } from './sentences'
import { afterBlankLines, quoteBlock, viewFile } from './text'

export const ANNOTATION_TYPES = ['note', 'question', 'concern'] as const
export type AnnotationType = (typeof ANNOTATION_TYPES)[number]

export const ANNOTATION_STATES = ['open', 'resolved'] as const
export type AnnotationState = (typeof ANNOTATION_STATES)[number]

/** What ties an Annotation to its place (docs/review-format.md, section 2). */
export interface Anchor {
  /** The Source File, relative to the repository root. */
  readonly path: string
  /** The first and the last line, counted from 1, both included. */
  readonly start: number
  readonly end: number
  /** The quoted lines, one per line of the range, without line breaks. */
  readonly quote: readonly string[]
  /** The commit HEAD pointed at when the lines were read; absent when there was none. */
  readonly commit?: string
}

export interface Reply {
  /** The Reply's file. */
  readonly path: string
  readonly author?: string
  readonly date?: string
  /** Markdown, the author's own. */
  readonly text: string
}

export interface Annotation {
  /** The file name without `.md`, frozen when the Annotation is created. */
  readonly id: string
  /** The Annotation's file. */
  readonly path: string
  /** `note` when the file does not say; `undefined` when it says something else, or cannot be read. */
  readonly type: AnnotationType | undefined
  /** `open` when the file does not say; `undefined` when it says something else, or cannot be read. */
  readonly state: AnnotationState | undefined
  readonly author?: string
  readonly date?: string
  /** `undefined` when the file has none that can be read: a Problem says why. */
  readonly anchor?: Anchor
  /** The ADRs it cites, as written: a Trace. */
  readonly cites: readonly string[]
  /** Markdown, the author's own: what follows the quoted lines. */
  readonly text: string
  /** In the order of their file names. */
  readonly replies: readonly Reply[]
  /** Whether the suite may write into the file: its frontmatter can be read. */
  readonly writable: boolean
}

/** The lines of an Anchor as the file writes them: `12-14`, or `12` for one. */
export const linesText = (anchor: Pick<Anchor, 'start' | 'end'>): string =>
  anchor.start === anchor.end ? String(anchor.start) : `${anchor.start}-${anchor.end}`

/**
 * The text of a YAML scalar as its author wrote it, or `undefined` for an empty value: `12` is
 * the text "12", whatever type YAML would give it.
 */
export function scalarText(node: unknown): string | undefined {
  if (!isScalar(node) || node.value === null) return undefined
  return node.source ?? String(node.value)
}

/** What the frontmatter of an Annotation or a Reply holds, once it can be read. */
type Frontmatter =
  | { readonly map: YAMLMap | undefined; readonly body: number }
  | { readonly unreadable: ReviewSaid; readonly body: number }

function frontmatterOf(text: string): Frontmatter {
  const view = viewFile(text)
  if (view.unterminated) return { unreadable: { code: 'frontmatter-open', values: {} }, body: 0 }
  if (!view.frontmatter) return { unreadable: { code: 'no-frontmatter', values: {} }, body: 0 }
  const doc = parseDocument(text.slice(view.frontmatter.start, view.frontmatter.end))
  if (doc.errors.length > 0) {
    const message = doc.errors[0]!.message.split('\n')[0]!.replace(/:$/, '')
    return { unreadable: { code: 'frontmatter-yaml', values: { message } }, body: view.bodyStart }
  }
  if (doc.contents !== null && !isMap(doc.contents)) {
    return { unreadable: { code: 'frontmatter-mapping', values: {} }, body: view.bodyStart }
  }
  return { map: (doc.contents as YAMLMap | null) ?? undefined, body: view.bodyStart }
}

/** How the values of a frontmatter are read. */
interface Reader {
  /** The value of a key, as YAML has it. */
  node(key: string): unknown
  /** A text, or nothing; a value that is no text is a Problem. */
  text(key: string): string | undefined
  /** A day, `YYYY-MM-DD`, or nothing; a value that is no day is a Problem. */
  day(key: string): string | undefined
}

/** The values of a frontmatter, read tolerantly: what is wrong becomes a Problem. */
function reader(
  map: YAMLMap | undefined,
  path: string,
  annotation: string,
  problems: ReviewProblem[]
): Reader {
  const node = (key: string): unknown => {
    const pair = map?.items.find((item) => scalarText(item.key) === key)
    return pair?.value ?? undefined
  }
  const text = (key: string): string | undefined => {
    const value = node(key)
    if (value === undefined || value === null) return undefined
    if (!isScalar(value)) {
      problems.push({
        kind: 'invalid-key',
        path,
        annotation,
        key,
        detail: { code: 'needs-text', values: {} }
      })
      return undefined
    }
    return scalarText(value)
  }
  const day = (key: string): string | undefined => {
    const value = text(key)
    if (value === undefined || isDay(value)) return value
    problems.push({
      kind: 'invalid-key',
      path,
      annotation,
      key,
      detail: { code: 'needs-day', values: {} }
    })
    return undefined
  }
  return { node, text, day }
}

/** Read an Annotation file tolerantly. Never throws: what cannot be read becomes a Problem. */
export function readAnnotation(
  id: string,
  path: string,
  text: string,
  replies: readonly Reply[]
): { annotation: Annotation; problems: ReviewProblem[] } {
  const problems: ReviewProblem[] = []
  const frontmatter = frontmatterOf(text)
  const quote = quoteBlock(text, frontmatter.body)
  const body = quote
    ? afterBlankLines(text, quote.close.next)
    : afterBlankLines(text, frontmatter.body)
  const base = { id, path, cites: [], replies }

  if ('unreadable' in frontmatter) {
    problems.push({
      kind: 'unreadable-annotation',
      path,
      annotation: id,
      detail: frontmatter.unreadable
    })
    return {
      annotation: { ...base, type: undefined, state: undefined, text: body, writable: false },
      problems
    }
  }

  const { node, text: textOf, day } = reader(frontmatter.map, path, id, problems)
  const oneOf = <T extends string>(
    key: 'type' | 'state',
    values: readonly T[],
    absent: T
  ): T | undefined => {
    const value = textOf(key)
    if (value === undefined)
      return node(key) === undefined || node(key) === null ? absent : undefined
    if ((values as readonly string[]).includes(value)) return value as T
    problems.push({
      kind: key === 'type' ? 'invalid-type' : 'invalid-state',
      path,
      annotation: id,
      value
    })
    return undefined
  }
  const type = oneOf('type', ANNOTATION_TYPES, 'note')
  const state = oneOf('state', ANNOTATION_STATES, 'open')
  const author = textOf('author')
  const date = day('date')

  const cited = node('cites')
  const cites: string[] = []
  if (isScalar(cited) && scalarText(cited) !== undefined) cites.push(scalarText(cited)!)
  else if (isSeq(cited)) {
    for (const item of cited.items) {
      const value = isScalar(item) ? scalarText(item) : undefined
      if (value === undefined) {
        problems.push({
          kind: 'invalid-key',
          path,
          annotation: id,
          key: 'cites',
          detail: { code: 'needs-adr-list', values: {} }
        })
        break
      }
      if (!cites.includes(value)) cites.push(value)
    }
  } else if (cited !== undefined && cited !== null && !isScalar(cited)) {
    problems.push({
      kind: 'invalid-key',
      path,
      annotation: id,
      key: 'cites',
      detail: { code: 'needs-adr-list', values: {} }
    })
  }

  const anchor = anchorOf(
    node('anchor'),
    quote?.lines.map((line) => line.content),
    path,
    id,
    problems
  )
  return {
    annotation: {
      ...base,
      type,
      state,
      ...(author !== undefined && { author }),
      ...(date !== undefined && { date }),
      ...(anchor && { anchor }),
      cites,
      text: body,
      writable: true
    },
    problems
  }
}

function anchorOf(
  value: unknown,
  quote: readonly string[] | undefined,
  path: string,
  annotation: string,
  problems: ReviewProblem[]
): Anchor | undefined {
  const map = isMap(value) ? value : undefined
  const get = (key: string): string | undefined => {
    const item = map?.items.find((pair) => scalarText(pair.key) === key)?.value
    return isScalar(item) ? scalarText(item) : item === undefined || item === null ? undefined : ''
  }
  const [source, lines, commit] = [get('path'), get('lines'), get('commit')]
  if (source === undefined || lines === undefined) {
    problems.push({ kind: 'no-anchor', path, annotation })
    return undefined
  }
  const invalid = (code: 'anchor-path' | 'anchor-lines' | 'anchor-commit'): undefined => {
    problems.push({ kind: 'invalid-anchor', path, annotation, detail: { code, values: {} } })
    return undefined
  }
  const normalized = normalizePath(source)
  if (normalized === undefined || normalized === '') return invalid('anchor-path')
  const range = /^(\d+)(?:[ \t]*-[ \t]*(\d+))?$/.exec(lines)
  const [start, end] = range ? [Number(range[1]), Number(range[2] ?? range[1])] : [0, 0]
  if (!range || start < 1 || end < start) return invalid('anchor-lines')
  if (commit !== undefined && !isObjectName(commit)) return invalid('anchor-commit')
  if (quote === undefined) {
    problems.push({ kind: 'no-quote', path, annotation })
    return undefined
  }
  if (quote.length !== end - start + 1) {
    problems.push({
      kind: 'quote-does-not-match-lines',
      path,
      annotation,
      quoted: quote.length,
      lines: linesText({ start, end }),
      count: end - start + 1
    })
    return undefined
  }
  return { path: normalized, start, end, quote, ...(commit !== undefined && { commit }) }
}

/** Read a Reply file tolerantly. */
export function readReply(
  path: string,
  annotation: string,
  text: string
): { reply: Reply; problems: ReviewProblem[] } {
  const problems: ReviewProblem[] = []
  const frontmatter = frontmatterOf(text)
  const body = afterBlankLines(text, frontmatter.body)
  if ('unreadable' in frontmatter) {
    problems.push({ kind: 'unreadable-reply', path, annotation, detail: frontmatter.unreadable })
    return { reply: { path, text: body }, problems }
  }
  const { text: textOf, day } = reader(frontmatter.map, path, annotation, problems)
  const author = textOf('author')
  const date = day('date')
  return {
    reply: {
      path,
      ...(author !== undefined && { author }),
      ...(date !== undefined && { date }),
      text: body
    },
    problems
  }
}
