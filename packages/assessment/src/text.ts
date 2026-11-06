/**
 * Views over the text of a file: where its frontmatter and its body are, its line ending, its
 * lines, and the headings and fenced code blocks of its body. They never hold a model that would
 * have to be written back; every offset refers to the text itself (ADR-0002). A file is read as
 * an ADR is (docs/file-format.md, section 2); this mirrors what `review` does, and the two
 * cores do not share code (ADR-0006).
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
  /** Where the body starts: after the frontmatter, or after a byte order mark. */
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
  /** Counted from 1. */
  readonly number: number
}

const BOM = '﻿'
const FRONTMATTER_FENCE = /^---[ \t]*$/

/** The number of the line that `offset` lies on, from 1. */
export function lineNumberAt(text: string, offset: number): number {
  let count = 1
  for (let at = text.indexOf('\n'); at !== -1 && at < offset; at = text.indexOf('\n', at + 1)) {
    count++
  }
  return count
}

function lineFrom(text: string, start: number, number: number): Line {
  const lf = text.indexOf('\n', start)
  const breakAt = lf === -1 ? text.length : lf
  const end = breakAt > start && text[breakAt - 1] === '\r' ? breakAt - 1 : breakAt
  return {
    start,
    content: text.slice(start, end),
    end,
    next: lf === -1 ? text.length : lf + 1,
    number
  }
}

/** The line that begins at `start`. */
export function lineAt(text: string, start: number): Line {
  return lineFrom(text, start, lineNumberAt(text, start))
}

/** The lines of `text` from `from` up to `to`. A line break at the very end starts no further line. */
export function linesOf(text: string, from = 0, to = text.length): Line[] {
  const lines: Line[] = []
  let number = lineNumberAt(text, from)
  for (let start = from; start < to;) {
    const line = lineFrom(text, start, number++)
    lines.push(line)
    start = line.next
  }
  return lines
}

export function eolOf(text: string): Eol {
  const lf = text.indexOf('\n')
  return lf > 0 && text[lf - 1] === '\r' ? '\r\n' : '\n'
}

export function viewFile(text: string): FileView {
  const contentStart = text.startsWith(BOM) ? BOM.length : 0
  const none = { text, eol: eolOf(text), bodyStart: contentStart, unterminated: false }
  const first = lineFrom(text, contentStart, 1)
  if (!FRONTMATTER_FENCE.test(first.content)) return none
  for (let at = first.next, number = 2; at < text.length; number++) {
    const line = lineFrom(text, at, number)
    if (FRONTMATTER_FENCE.test(line.content)) {
      return { ...none, frontmatter: { start: first.next, end: line.start }, bodyStart: line.next }
    }
    at = line.next
  }
  return { ...none, unterminated: true }
}

/** An ATX heading of the body, outside every code block. */
export interface Heading {
  readonly kind: 'heading'
  readonly line: Line
  /** 1 to 6: the number of `#`. */
  readonly level: number
  /** Its text, without the `#`s before and after it and the blanks around it. */
  readonly text: string
}

/** A fenced code block of the body. */
export interface Fence {
  readonly kind: 'fence'
  /** The opening fence's line. */
  readonly open: Line
  /** The first word after the fence: `yaml`, say; empty when there is none. */
  readonly language: string
  /** What stands between the fences, as offsets into the text: from the line after the opening one. */
  readonly content: Span
  /** The closing fence's line; absent when the block is never closed and runs to the end. */
  readonly close?: Line
  /**
   * Whether it is opened inside a list item or a block quote, after a list marker or a `>`:
   * then it ends with its container, and its lines carry the container's indentation.
   */
  readonly contained: boolean
}

/** An HTML comment of the body: what lies in it is no heading and no code block. */
export interface Comment {
  readonly kind: 'comment'
  /** The line it begins on. */
  readonly open: Line
  /** The line that holds its `-->`; absent when it is never closed and runs to the end. */
  readonly close?: Line
}

// A repository is untrusted input: nothing here backtracks over a long line (as core's headingOf).
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*))?$/
const OPENING = /^( {0,3})(`{3,}|~{3,})(.*)$/

/**
 * Where the closing sequence of `#`s at the end of a heading's text starts (CommonMark): a run
 * after a blank, or the whole text; its length where there is none. Counted by hand.
 */
export function closingSequenceAt(text: string): number {
  let end = text.length
  while (end > 0 && text[end - 1] === '#') end--
  const closes = end < text.length && (end === 0 || text[end - 1] === ' ' || text[end - 1] === '\t')
  return closes ? end : text.length
}

/** A heading's text without its closing sequence of `#`s. */
function headingText(raw: string | undefined): string {
  if (raw === undefined) return ''
  const text = raw.trimEnd()
  return text.slice(0, closingSequenceAt(text)).trim()
}

// A list marker or a `>` at the start of a line, read one after another without backtracking.
const CONTAINER = / {0,3}(?:>[ \t]?|(?:[-+*]|\d{1,9}[.)])[ \t]+)/y
const QUOTE = / {0,3}>[ \t]?/y
const COMMENT = /^ {0,3}<!--/

/** How much of a line's start is made of the markers of the regex, one after another. */
function prefixOf(content: string, markers: RegExp): number {
  let at = 0
  for (;;) {
    markers.lastIndex = at
    const match = markers.exec(content)
    if (!match || match[0].length === 0) return at
    at += match[0].length
  }
}

/** The blanks a line begins with. */
const indentOf = (content: string): number => content.length - content.trimStart().length

/**
 * The headings, fenced code blocks and HTML comments of a body, in their order (CommonMark:
 * ATX headings, fences — at the start of a line, or after the markers of a list item or a block
 * quote —, and comments): a heading inside a code block or a comment is none; a block that is
 * never closed runs to the end of the text, or of its container; so does a comment.
 */
export function outlineOf(text: string, bodyStart: number): (Heading | Fence | Comment)[] {
  const items: (Heading | Fence | Comment)[] = []
  const lines = linesOf(text, bodyStart)
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!
    if (COMMENT.test(line.content)) {
      // It ends on the line that holds `-->`: `<!-->` and `<!--->` are whole comments.
      const ends = text.indexOf('-->', line.start + line.content.indexOf('<!--') + 2)
      let end = index
      while (ends !== -1 && end < lines.length && lines[end]!.next <= ends) end++
      const close = ends === -1 ? undefined : lines[end]
      items.push({ kind: 'comment', open: line, ...(close && { close }) })
      if (!close) break
      index = end
      continue
    }
    const prefix = prefixOf(line.content, CONTAINER)
    const opening = OPENING.exec(line.content.slice(prefix))
    if (opening) {
      const fence = opening[2]!
      const info = opening[3]!
      // CommonMark: the info string of a backtick fence holds no backtick.
      if (!(fence.startsWith('`') && info.includes('`'))) {
        const closing = new RegExp(
          `^ {0,3}${fence[0] === '`' ? '`' : '~'}{${fence.length},}[ \\t]*$`
        )
        const contained = prefix > 0
        const quoted = contained && line.content.slice(0, prefix).includes('>')
        // Inside a list item, a line belongs to it while it is blank or indented as far as the
        // item's text; inside a block quote, while it begins with a `>`.
        const inside = (content: string): string | undefined => {
          if (!contained) return content
          if (quoted) {
            const marks = prefixOf(content, QUOTE)
            return marks === 0 ? undefined : content.slice(marks)
          }
          if (isBlank(content)) return content
          const indent = indentOf(content)
          return indent < prefix ? undefined : content.slice(prefix)
        }
        let end = index + 1
        let close: Line | undefined
        for (; end < lines.length; end++) {
          const content = inside(lines[end]!.content)
          if (content === undefined) break
          if (closing.test(content)) {
            close = lines[end]
            break
          }
        }
        items.push({
          kind: 'fence',
          open: line,
          language: info.trim().split(/[ \t]+/)[0] ?? '',
          content: {
            start: line.next,
            end: close ? close.start : (lines[end]?.start ?? text.length)
          },
          ...(close && { close }),
          contained
        })
        // A block that ends with its container leaves the line that ends it to be read.
        index = close ? end : end - 1
        continue
      }
    }
    const heading = HEADING.exec(line.content)
    if (heading) {
      items.push({
        kind: 'heading',
        line,
        level: heading[1]!.length,
        text: headingText(heading[2])
      })
    }
  }
  return items
}

/** Whether a line is blank: nothing but blanks and tabs. */
export const isBlank = (content: string): boolean => content.trim() === ''

/** The text between two offsets without the blank lines around it, and without trailing blanks. */
export function trimmedText(text: string, from: number, to: number): string {
  const lines = linesOf(text, from, to)
  let first = 0
  let last = lines.length - 1
  while (first <= last && isBlank(lines[first]!.content)) first++
  while (last >= first && isBlank(lines[last]!.content)) last--
  if (first > last) return ''
  return text.slice(lines[first]!.start, lines[last]!.end)
}
