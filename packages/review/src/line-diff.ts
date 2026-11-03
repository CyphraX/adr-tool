/**
 * Which lines of a text are still there in another, as a diff tells it: the longest common
 * subsequence of their lines, after what they share at both ends. Each line of either side is
 * paired with its line on the other side, or with none.
 */
export interface LineMatches {
  /** For each old line, the new line it is, or -1 where it was removed. */
  readonly ofOld: Int32Array
  /** For each new line, the old line it was, or -1 where it was added. */
  readonly ofNew: Int32Array
}

/**
 * The most lines of the middle that are compared, `old × new`: beyond it the table would take
 * more memory than a read should, and the caller goes on without history.
 */
const MAX_CELLS = 12_000_000

export function matchLines(
  before: readonly string[],
  after: readonly string[]
): LineMatches | undefined {
  const ofOld = new Int32Array(before.length).fill(-1)
  const ofNew = new Int32Array(after.length).fill(-1)
  let head = 0
  while (head < before.length && head < after.length && before[head] === after[head]) {
    ofOld[head] = head
    ofNew[head] = head
    head++
  }
  let tail = 0
  while (
    tail < before.length - head &&
    tail < after.length - head &&
    before[before.length - 1 - tail] === after[after.length - 1 - tail]
  ) {
    ofOld[before.length - 1 - tail] = after.length - 1 - tail
    ofNew[after.length - 1 - tail] = before.length - 1 - tail
    tail++
  }

  const a = before.slice(head, before.length - tail)
  const b = after.slice(head, after.length - tail)
  if (a.length === 0 || b.length === 0) return { ofOld, ofNew }
  if (a.length * b.length > MAX_CELLS) return undefined

  // The same text, the same number: comparing numbers is cheaper than comparing lines.
  const numbers = new Map<string, number>()
  const number = (line: string): number => {
    let found = numbers.get(line)
    if (found === undefined) numbers.set(line, (found = numbers.size))
    return found
  }
  const x = Int32Array.from(a, number)
  const y = Int32Array.from(b, number)

  const width = y.length + 1
  const Table = Math.min(x.length, y.length) < 0xffff ? Uint16Array : Uint32Array
  const lcs = new Table((x.length + 1) * width)
  for (let i = x.length - 1; i >= 0; i--) {
    for (let j = y.length - 1; j >= 0; j--) {
      lcs[i * width + j] =
        x[i] === y[j]
          ? lcs[(i + 1) * width + j + 1]! + 1
          : Math.max(lcs[(i + 1) * width + j]!, lcs[i * width + j + 1]!)
    }
  }
  for (let i = 0, j = 0; i < x.length && j < y.length;) {
    if (x[i] === y[j]) {
      ofOld[head + i] = head + j
      ofNew[head + j] = head + i
      i++
      j++
    } else if (lcs[(i + 1) * width + j]! >= lcs[i * width + j + 1]!) i++
    else j++
  }
  return { ofOld, ofNew }
}
