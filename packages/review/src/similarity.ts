/**
 * How the quoted lines of an Anchor are compared with lines of a Source File (docs/review-format.md,
 * section 4; ADR-0019): line by line, on lines whose whitespace is normalized, by the edit
 * distance in characters.
 */

/** A block of lines is similar enough to the quoted lines from this similarity on. */
export const SIMILAR_ENOUGH = 0.5

/** A line as it is compared: without whitespace at its ends, and each run inside it one space. */
export const normalized = (line: string): string => line.trim().replace(/\s+/g, ' ')

/**
 * The Levenshtein distance of two texts, in characters (code units): Myers' bit-parallel
 * algorithm, in blocks of 32 characters of `a` as Hyyrö and Myers give it, so that a pair of
 * lines costs a few operations per character of `b` rather than one per pair of characters.
 */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  const blocks = Math.ceil(a.length / 32)
  // For each character of `a`, the positions it has, as bits.
  const positions = new Map<number, Int32Array>()
  for (let at = 0; at < a.length; at++) {
    const code = a.charCodeAt(at)
    let bits = positions.get(code)
    if (bits === undefined) positions.set(code, (bits = new Int32Array(blocks)))
    bits[at >>> 5]! |= 1 << (at & 31)
  }
  const none = new Int32Array(blocks)
  // The vertical differences of the column, +1 and -1, as bits: all +1 before the first.
  const plus = new Int32Array(blocks).fill(-1)
  const minus = new Int32Array(blocks)
  const last = 1 << ((a.length - 1) & 31)
  let distance = a.length
  for (let column = 0; column < b.length; column++) {
    const equal = positions.get(b.charCodeAt(column)) ?? none
    // The horizontal difference that enters the block from above: +1 along the first row.
    let incoming = 1
    for (let block = 0; block < blocks; block++) {
      const [pv, mv] = [plus[block]!, minus[block]!]
      let eq = equal[block]!
      const xv = eq | mv
      if (incoming < 0) eq |= 1
      const xh = (((eq & pv) + pv) ^ pv) | eq
      let ph = mv | ~(xh | pv)
      let mh = pv & xh
      const top = block === blocks - 1 ? last : 1 << 31
      const outgoing = ph & top ? 1 : mh & top ? -1 : 0
      ph = (ph << 1) | (incoming > 0 ? 1 : 0)
      mh = (mh << 1) | (incoming < 0 ? 1 : 0)
      plus[block] = mh | ~(xv | ph)
      minus[block] = ph & xv
      incoming = outgoing
    }
    distance += incoming
  }
  return distance
}

/** A block of lines, `[start, end)`, counted from 0, and its similarity to the quoted lines. */
export interface Block {
  readonly start: number
  readonly end: number
  readonly similarity: number
}

/**
 * The block of `lines[from, to)` most similar to `quote`, both normalized: the best pairing of
 * their lines, where a quoted line paired with a line of the block costs the characters that
 * differ, and one left without a partner, on either side, all its characters. The similarity is
 * one minus that cost over the characters of the longer of the two. Of equally similar blocks
 * the one that starts nearest to `near` wins, then the shorter one. `undefined` when the quoted
 * lines have no characters to compare, or the range no lines.
 *
 * `pinned` names, for a quoted line, the line of `lines` it is known to be — the diff kept it —:
 * that quoted line is paired with that line and no other, so every block holds it.
 */
export function mostSimilarBlock(
  quote: readonly string[],
  lines: readonly string[],
  from: number,
  to: number,
  near: number,
  pinned: readonly (number | undefined)[] = []
): Block | undefined {
  const n = quote.length
  const m = to - from
  const quoted = quote.reduce((sum, line) => sum + line.length, 0)
  if (quoted === 0 || m <= 0) return undefined

  // Characters of the range before each line: the size of a block is told from its two ends.
  const before = new Float64Array(m + 1)
  for (let j = 0; j < m; j++) before[j + 1] = before[j]! + lines[from + j]!.length

  // A fitting alignment: all of the quote against any block of the range. `cost[i][j]` is the
  // least cost of the quote's first i lines against a block that ends before line j; `begin`
  // where that block begins. The block may begin anywhere for nothing: row 0 costs nothing.
  const width = m + 1
  let cost = new Float64Array(width)
  let begin = new Int32Array(width)
  for (let j = 0; j <= m; j++) begin[j] = j
  for (let i = 1; i <= n; i++) {
    const next = new Float64Array(width)
    const nextBegin = new Int32Array(width)
    const line = quote[i - 1]!
    const pin = pinned[i - 1]
    if (pin !== undefined) {
      // Paired with its line, or nothing: after it, lines of the block without a partner.
      const at = pin - from + 1
      next.fill(Infinity)
      for (let j = Math.max(at, 1); j <= m; j++) {
        if (j === at) {
          next[j] = cost[j - 1]! + editDistance(line, lines[from + j - 1]!)
          nextBegin[j] = begin[j - 1]!
        } else {
          next[j] = next[j - 1]! + lines[from + j - 1]!.length
          nextBegin[j] = nextBegin[j - 1]!
        }
      }
      cost = next
      begin = nextBegin
      continue
    }
    next[0] = cost[0]! + line.length
    nextBegin[0] = begin[0]!
    for (let j = 1; j <= m; j++) {
      const candidate = lines[from + j - 1]!
      const paired = cost[j - 1]! + editDistance(line, candidate)
      const dropped = cost[j]! + line.length
      const added = next[j - 1]! + candidate.length
      if (paired <= dropped && paired <= added) {
        next[j] = paired
        nextBegin[j] = begin[j - 1]!
      } else if (dropped <= added) {
        next[j] = dropped
        nextBegin[j] = begin[j]!
      } else {
        next[j] = added
        nextBegin[j] = nextBegin[j - 1]!
      }
    }
    cost = next
    begin = nextBegin
  }

  let best: Block | undefined
  for (let j = 1; j <= m; j++) {
    const start = begin[j]!
    if (start >= j || cost[j] === Infinity) continue
    const size = Math.max(quoted, before[j]! - before[start]!)
    const block = { start: from + start, end: from + j, similarity: 1 - cost[j]! / size }
    if (!best || better(block, best, near)) best = block
  }
  return best
}

/** Whether `a` is to be taken over `b`: more similar, then nearer, then shorter. */
function better(a: Block, b: Block, near: number): boolean {
  if (a.similarity !== b.similarity) return a.similarity > b.similarity
  const [distanceA, distanceB] = [Math.abs(a.start - near), Math.abs(b.start - near)]
  if (distanceA !== distanceB) return distanceA < distanceB
  return a.end - a.start < b.end - b.start
}
