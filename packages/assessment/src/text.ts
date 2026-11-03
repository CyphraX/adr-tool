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
}

const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/
const OPENING = /^( {0,3})(`{3,}|~{3,})(.*)$/

/** A heading's text without its closing sequence of `#`s. */
function headingText(raw: string | undefined): string {
  if (raw === undefined) return ''
  const closed = raw.replace(/(?:^|[ \t]+)#+$/, '')
  return closed.trim()
}

/**
 * The headings and fenced code blocks of a body, in their order (CommonMark, ATX headings and
 * fences only): a heading inside a code block is none, and a block that is never closed runs to
 * the end of the text.
 */
export function outlineOf(text: string, bodyStart: number): (Heading | Fence)[] {
  const items: (Heading | Fence)[] = []
  const lines = linesOf(text, bodyStart)
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!
    const opening = OPENING.exec(line.content)
    if (opening) {
      const fence = opening[2]!
      const info = opening[3]!
      // CommonMark: the info string of a backtick fence holds no backtick.
      if (!(fence.startsWith('`') && info.includes('`'))) {
        const closing = new RegExp(
          `^ {0,3}${fence[0] === '`' ? '`' : '~'}{${fence.length},}[ \\t]*$`
        )
        let end = index + 1
        while (end < lines.length && !closing.test(lines[end]!.content)) end++
        const close = lines[end]
        items.push({
          kind: 'fence',
          open: line,
          language: info.trim().split(/[ \t]+/)[0] ?? '',
          content: { start: line.next, end: close ? close.start : text.length },
          ...(close && { close })
        })
        index = end
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
