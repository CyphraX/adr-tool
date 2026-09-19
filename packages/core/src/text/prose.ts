const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*))?$/

/** A line of Markdown with its place in the text it was taken from. */
export interface ProseLine {
  /** The line without its line break. */
  readonly content: string
  /** Offsets into the text: where the line starts, and where the next one does. */
  readonly start: number
  readonly next: number
}

/**
 * The lines of `text` from `from` on, without their line breaks, that are not part of a
 * fenced code block: what stands in a code block is an example, never a heading or a Status.
 */
export function proseLines(text: string, from = 0): string[] {
  return proseLinesIn(text, from).map((line) => line.content)
}

/** The same lines with their offsets, for an edit that takes lines out where they stand. */
export function proseLinesIn(text: string, from = 0): ProseLine[] {
  const lines: ProseLine[] = []
  let fence: string | undefined
  for (let start = from; start < text.length;) {
    const lf = text.indexOf('\n', start)
    const end = lf === -1 ? text.length : lf
    const line = text.slice(start, end > start && text[end - 1] === '\r' ? end - 1 : end)
    const open = FENCE_OPEN.exec(line)?.[1]
    if (fence) {
      // A fence closes with the same character, at least as long, and nothing else on the line.
      const closes = open !== undefined && open[0] === fence[0] && open.length >= fence.length
      if (closes && line.trim() === open) fence = undefined
    } else if (open) fence = open
    else lines.push({ content: line, start, next: Math.min(end + 1, text.length) })
    start = end + 1
  }
  return lines
}

/**
 * An ATX heading: its level and its text, without the closing `#`s some people write.
 * A repository is untrusted input: nothing here backtracks over a long line.
 */
export function headingOf(line: string): { level: number; text: string } | undefined {
  const match = HEADING.exec(line)
  if (!match) return undefined
  let text = (match[2] ?? '').trimEnd()
  let end = text.length
  while (end > 0 && text[end - 1] === '#') end--
  const closing = end < text.length && end > 0 && (text[end - 1] === ' ' || text[end - 1] === '\t')
  if (closing) text = text.slice(0, end).trimEnd()
  return { level: match[1]!.length, text: text.trimStart() }
}
