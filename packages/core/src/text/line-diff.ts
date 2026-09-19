import type { TextEdit } from './edit'
import type { Eol } from './source'

interface Line {
  /** The line without its line break. */
  readonly content: string
  /** Where the line starts in the text, and where the next one starts. */
  readonly start: number
  readonly end: number
  readonly hasBreak: boolean
}

/**
 * The edits that turn `text[offset..]` into `replacement`, line by line. Lines that are
 * the same keep the bytes they have — also their line break, whatever it is — so a file
 * with CRLF or mixed line endings stays that way. Lines that are new get `eol`.
 *
 * `replacement` may use any line break; an editor typically hands over LF.
 */
export function editsForLines(
  text: string,
  offset: number,
  replacement: string,
  eol: Eol
): TextEdit[] {
  const before = splitLines(text, offset)
  const after = splitLines(replacement, 0)
  const key = (line: Line): string => (line.hasBreak ? `${line.content}\n` : line.content)

  // Trim what is equal at both ends; the middle is what changed.
  let head = 0
  while (head < before.length && head < after.length && key(before[head]!) === key(after[head]!)) {
    head++
  }
  let tail = 0
  while (
    tail < before.length - head &&
    tail < after.length - head &&
    key(before[before.length - 1 - tail]!) === key(after[after.length - 1 - tail]!)
  ) {
    tail++
  }

  const edits: TextEdit[] = []
  const oldMiddle = before.slice(head, before.length - tail)
  const newMiddle = after.slice(head, after.length - tail)
  for (const hunk of hunks(oldMiddle.map(key), newMiddle.map(key))) {
    const removed = oldMiddle.slice(hunk.oldStart, hunk.oldEnd)
    const added = newMiddle.slice(hunk.newStart, hunk.newEnd)
    const start =
      removed[0]?.start ?? oldMiddle[hunk.oldStart]?.start ?? endOf(before, head, tail, text)
    const end = removed.at(-1)?.end ?? start
    const insert = added.map((line) => line.content + (line.hasBreak ? eol : '')).join('')
    edits.push({ start, end, insert })
  }
  return edits
}

/** Where an insertion goes when nothing is removed and no old line follows within the middle. */
function endOf(before: Line[], head: number, tail: number, text: string): number {
  return (
    before[before.length - tail]?.start ?? before.at(-1)?.end ?? before[head]?.start ?? text.length
  )
}

function splitLines(text: string, offset: number): Line[] {
  const lines: Line[] = []
  let start = offset
  while (start < text.length) {
    const lf = text.indexOf('\n', start)
    const end = lf === -1 ? text.length : lf + 1
    const contentEnd = lf === -1 ? end : lf > start && text[lf - 1] === '\r' ? lf - 1 : lf
    lines.push({ content: text.slice(start, contentEnd), start, end, hasBreak: lf !== -1 })
    start = end
  }
  return lines
}

interface Hunk {
  oldStart: number
  oldEnd: number
  newStart: number
  newEnd: number
}

/** The differing stretches of two line lists, from their longest common subsequence. */
function hunks(a: readonly string[], b: readonly string[]): Hunk[] {
  // Bodies of ADRs are short; the quadratic table is fine and keeps this free of dependencies.
  const width = b.length + 1
  const lcs = new Uint32Array((a.length + 1) * width)
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i * width + j] =
        a[i] === b[j]
          ? lcs[(i + 1) * width + j + 1]! + 1
          : Math.max(lcs[(i + 1) * width + j]!, lcs[i * width + j + 1]!)
    }
  }

  const result: Hunk[] = []
  let [i, j] = [0, 0]
  let open: Hunk | undefined
  const close = (): void => {
    if (open) result.push({ ...open, oldEnd: i, newEnd: j })
    open = undefined
  }
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      close()
      i++
      j++
      continue
    }
    open ??= { oldStart: i, oldEnd: i, newStart: j, newEnd: j }
    const dropOld =
      j >= b.length || (i < a.length && lcs[(i + 1) * width + j]! >= lcs[i * width + j + 1]!)
    if (dropOld) i++
    else j++
  }
  close()
  return result
}
