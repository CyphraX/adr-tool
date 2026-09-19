const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/

/** A line of Markdown with its place in the text it was taken from. */
export interface ProseLine {
  /** The line without its line break. */
  readonly content: string
  /** Offsets into the text: where the line starts, and where the next one does. */
  readonly start: number
  readonly next: number
}

/**
 * The lines of `text` from `from` on that are not part of a fenced code block: what stands
 * in a code block is an example, never a heading or a Status.
 */
export function proseLines(text: string, from = 0): ProseLine[] {
  const lines: ProseLine[] = []
  let fence: string | undefined
  for (let start = from; start < text.length;) {
    const lf = text.indexOf('\n', start)
    const next = lf === -1 ? text.length : lf + 1
    const end = lf === -1 ? text.length : lf
    const content = text.slice(start, end > start && text[end - 1] === '\r' ? end - 1 : end)
    const open = FENCE_OPEN.exec(content)?.[1]
    if (fence) {
      // A fence closes with the same character, at least as long, and nothing else on the line.
      const closes = open !== undefined && open[0] === fence[0] && open.length >= fence.length
      if (closes && content.trim() === open) fence = undefined
    } else if (open) fence = open
    else lines.push({ content, start, next })
    start = next
  }
  return lines
}

/** An ATX heading: its level and its text, without the closing `#`s some people write. */
export function headingOf(line: string): { level: number; text: string } | undefined {
  const match = HEADING.exec(line)
  return match ? { level: match[1]!.length, text: (match[2] ?? '').trim() } : undefined
}
