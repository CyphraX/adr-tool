export type Eol = '\n' | '\r\n'

/** Offsets `[start, end)` into the source text. */
export interface Span {
  readonly start: number
  readonly end: number
}

/**
 * A view over the text of an ADR file: where the frontmatter and the body are, and
 * which line ending the file uses. It never holds a model that would have to be
 * serialized back; all offsets refer to `text` itself (see docs/file-format.md).
 */
export interface SourceView {
  readonly text: string
  readonly hasBom: boolean
  /** The file's line ending: that of its first line break, LF if it has none. */
  readonly eol: Eol
  /** The YAML between the two `---` lines, without them. Absent when there is no frontmatter. */
  readonly frontmatter?: Span
  /** Where the body starts. Equals `text.length` for a file without a body. */
  readonly bodyStart: number
  /** The file opens frontmatter with `---` and never closes it. */
  readonly unterminatedFrontmatter: boolean
}

const BOM = '\uFEFF'
const FENCE = /^---[ \t]*$/

export function viewSource(text: string): SourceView {
  const hasBom = text.startsWith(BOM)
  const contentStart = hasBom ? BOM.length : 0
  const eol = detectEol(text)
  const none = { text, hasBom, eol, bodyStart: contentStart, unterminatedFrontmatter: false }

  const first = lineAt(text, contentStart)
  if (!FENCE.test(first.content)) return none

  for (let line = lineAt(text, first.next); ; line = lineAt(text, line.next)) {
    if (line.start >= text.length) break
    if (FENCE.test(line.content)) {
      return { ...none, frontmatter: { start: first.next, end: line.start }, bodyStart: line.next }
    }
    if (line.next >= text.length) break
  }
  return { ...none, unterminatedFrontmatter: true }
}

function detectEol(text: string): Eol {
  const lf = text.indexOf('\n')
  return lf > 0 && text[lf - 1] === '\r' ? '\r\n' : '\n'
}

/** The line starting at `start`: its content without the line break, and where the next line starts. */
function lineAt(text: string, start: number): { start: number; content: string; next: number } {
  const lf = text.indexOf('\n', start)
  const end = lf === -1 ? text.length : lf
  const contentEnd = end > start && text[end - 1] === '\r' ? end - 1 : end
  return { start, content: text.slice(start, contentEnd), next: lf === -1 ? text.length : lf + 1 }
}
