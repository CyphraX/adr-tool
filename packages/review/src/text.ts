/**
 * Views over the text of a file: where its frontmatter and its body are, its line ending, its
 * lines. They never hold a model that would have to be written back; every offset refers to the
 * text itself (ADR-0002). An Annotation is read as an ADR is (docs/file-format.md, section 2).
 */

export type Eol = '\n' | '\r\n'

/** Offsets `[start, end)` into a text. */
export interface Span {
  readonly start: number
  readonly end: number
}

export interface FileView {
  readonly text: string
  /** The file's line ending: that of its first line break, LF if it has none. */
  readonly eol: Eol
  /** The YAML between the two `---` lines, without them. Absent when there is no frontmatter. */
  readonly frontmatter?: Span
  /** Where the body starts. */
  readonly bodyStart: number
  /** The file opens a frontmatter with `---` and never closes it. */
  readonly unterminated: boolean
}

/** One line of a text: its content without the line break, and where the next line starts. */
export interface Line {
  readonly start: number
  readonly content: string
  /** Where the content ends: the line break, or the end of the text. */
  readonly end: number
  readonly next: number
}

const BOM = '﻿'
const FRONTMATTER_FENCE = /^---[ \t]*$/

export function lineAt(text: string, start: number): Line {
  const lf = text.indexOf('\n', start)
  const breakAt = lf === -1 ? text.length : lf
  const end = breakAt > start && text[breakAt - 1] === '\r' ? breakAt - 1 : breakAt
  return { start, content: text.slice(start, end), end, next: lf === -1 ? text.length : lf + 1 }
}

/** The lines of `text` from `from` on. A line break at the very end starts no further line. */
export function linesOf(text: string, from = 0): Line[] {
  const lines: Line[] = []
  for (let start = from; start < text.length;) {
    const line = lineAt(text, start)
    lines.push(line)
    start = line.next
  }
  return lines
}

/** The lines of a Source File as the Anchor counts them, from 1: their contents, without line breaks. */
export function sourceLines(text: string): string[] {
  return linesOf(text).map((line) => line.content)
}

export function eolOf(text: string): Eol {
  const lf = text.indexOf('\n')
  return lf > 0 && text[lf - 1] === '\r' ? '\r\n' : '\n'
}

export function viewFile(text: string): FileView {
  const contentStart = text.startsWith(BOM) ? BOM.length : 0
  const none = { text, eol: eolOf(text), bodyStart: contentStart, unterminated: false }
  const first = lineAt(text, contentStart)
  if (!FRONTMATTER_FENCE.test(first.content)) return none
  for (let at = first.next; at < text.length;) {
    const line = lineAt(text, at)
    if (FRONTMATTER_FENCE.test(line.content)) {
      return { ...none, frontmatter: { start: first.next, end: line.start }, bodyStart: line.next }
    }
    at = line.next
  }
  return { ...none, unterminated: true }
}

/** The fenced code block a body begins with: the quoted lines of an Annotation. */
export interface QuoteBlock {
  /** The opening fence's line. */
  readonly open: Line
  /** The fence: three or more backticks or tildes. */
  readonly fence: string
  /** What follows the fence on its line, as written. */
  readonly info: string
  /** The quoted lines, exactly as written, without their line breaks. */
  readonly lines: readonly Line[]
  /** The closing fence's line. */
  readonly close: Line
}

const OPENING = /^(`{3,}|~{3,})(.*)$/

/**
 * The fenced code block a body begins with (docs/review-format.md, section 2): after blank lines
 * at most, at the start of its line, and closed. `undefined` when the body begins otherwise.
 */
export function quoteBlock(text: string, bodyStart: number): QuoteBlock | undefined {
  let at = bodyStart
  let open: Line | undefined
  while (at < text.length) {
    const line = lineAt(text, at)
    if (line.content.trim() !== '') {
      open = line
      break
    }
    at = line.next
  }
  const match = open && OPENING.exec(open.content)
  if (!open || !match) return undefined
  const fence = match[1]!
  const info = match[2]!
  // CommonMark: the info string of a backtick fence holds no backtick.
  if (fence.startsWith('`') && info.includes('`')) return undefined
  const closing = new RegExp(`^ {0,3}${fence[0] === '`' ? '`' : '~'}{${fence.length},}[ \\t]*$`)
  const lines: Line[] = []
  for (at = open.next; at < text.length;) {
    const line = lineAt(text, at)
    if (closing.test(line.content)) return { open, fence, info, lines, close: line }
    lines.push(line)
    at = line.next
  }
  return undefined
}

/** The text after `from`, without the blank lines it begins with. */
export function afterBlankLines(text: string, from: number): string {
  let at = from
  while (at < text.length) {
    const line = lineAt(text, at)
    if (line.content.trim() !== '') break
    at = line.next
  }
  return text.slice(at)
}
