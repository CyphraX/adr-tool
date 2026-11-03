/**
 * Library patterns (docs/conformance-format.md, section 2, "library"): matched against the
 * name the code uses a Library by — an npm package (`@codemirror/state`), a Java package
 * (`org.slf4j`), a Python top-level package (`yaml`), a Go module (`github.com/google/uuid`) —
 * segment by segment, where `/` and `.` both separate. `*` matches within one segment, `**` as
 * a whole segment any number of segments, none included. A pattern without a wildcard is a name,
 * matched exactly.
 *
 * Matched without regular expressions, segment by segment with each step remembered: the
 * patterns come from a file of the repository, which is not trusted, and no pattern makes the
 * time more than the product of its length and the name's.
 */

const segmentsOf = (text: string): string[] => text.split(/[/.]/)

/** Whether a segment matches a segment pattern with `*` in it: the classic two-pointer walk. */
function segmentMatches(pattern: string, text: string): boolean {
  let p = 0
  let t = 0
  let star = -1
  let resume = 0
  while (t < text.length) {
    if (p < pattern.length && pattern[p] !== '*' && pattern[p] === text[t]) {
      p++
      t++
    } else if (p < pattern.length && pattern[p] === '*') {
      star = p++
      resume = t
    } else if (star !== -1) {
      p = star + 1
      t = ++resume
    } else {
      return false
    }
  }
  while (pattern[p] === '*') p++
  return p === pattern.length
}

/** Whether the segments of a name match the segments of a pattern, `**` taking any number. */
function segmentsMatch(pattern: readonly string[], name: readonly string[]): boolean {
  const known = new Map<number, boolean>()
  const match = (p: number, n: number): boolean => {
    const key = p * (name.length + 1) + n
    const remembered = known.get(key)
    if (remembered !== undefined) return remembered
    let result: boolean
    if (p === pattern.length) result = n === name.length
    else if (pattern[p] === '**') result = match(p + 1, n) || (n < name.length && match(p, n + 1))
    else result = n < name.length && segmentMatches(pattern[p]!, name[n]!) && match(p + 1, n + 1)
    known.set(key, result)
    return result
  }
  return match(0, 0)
}

/** Whether a list of Library patterns matches a name: one of them does. */
export function libraryMatcher(patterns: readonly string[]): (name: string) => boolean {
  const exact = new Set(patterns.filter((pattern) => !pattern.includes('*')))
  const wild = patterns
    .filter((pattern) => pattern.includes('*'))
    // `**/**` says no more than `**`.
    .map((pattern) =>
      segmentsOf(pattern).filter((part, index, all) => !(part === '**' && all[index - 1] === '**'))
    )
  return (name) => {
    if (exact.has(name)) return true
    if (wild.length === 0) return false
    const segments = segmentsOf(name)
    return wild.some((pattern) => segmentsMatch(pattern, segments))
  }
}
