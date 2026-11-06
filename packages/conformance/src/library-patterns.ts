/**
 * Library patterns (docs/conformance-format.md, section 2, "library"): matched against the
 * name the code uses a Library by — an npm package (`@codemirror/state`), a Java package
 * (`org.slf4j`), a Python top-level package (`yaml`), a Go module (`github.com/google/uuid`) —
 * segment by segment. An npm name has its segments between `/` alone — `lodash.get` and
 * `socket.io` are one segment each —; the others between `/` and `.` both. `*` matches within
 * one segment, `**` as a whole segment any number of segments, none included. A pattern without
 * a wildcard is a name, matched exactly; for Java and Python, whose packages hold packages, it
 * matches the packages below it as well: `org.slf4j` matches `org.slf4j.event`.
 *
 * Matched without regular expressions and without recursion, one row of segments at a time: the
 * patterns come from a file of the repository, which is not trusted, and no pattern makes the
 * time more than the product of its length and the name's, nor the memory more than the name's.
 */
import type { Ecosystem } from '@adr-tool/structure/model'

/** The segments of a name or a pattern, as the ecosystem separates them. */
const segmentsOf = (text: string, ecosystem: Ecosystem | undefined): string[] =>
  text.split(ecosystem === 'npm' ? '/' : /[/.]/)

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

/**
 * Whether the segments of a name match the segments of a pattern, `**` taking any number: row
 * `p` says, for each `n`, whether the first `p` segments of the pattern match the first `n` of
 * the name. Two rows are kept.
 */
function segmentsMatch(pattern: readonly string[], name: readonly string[]): boolean {
  let row = new Uint8Array(name.length + 1)
  let next = new Uint8Array(name.length + 1)
  row[0] = 1
  for (const part of pattern) {
    if (part === '**') {
      next[0] = row[0]!
      for (let n = 1; n <= name.length; n++) next[n] = row[n]! | next[n - 1]!
    } else {
      next[0] = 0
      for (let n = 1; n <= name.length; n++) {
        next[n] = row[n - 1]! && segmentMatches(part, name[n - 1]!) ? 1 : 0
      }
    }
    ;[row, next] = [next, row]
  }
  return row[name.length] === 1
}

/** Whether `name` is a package below one of `exact`: `org.slf4j.event` of `org.slf4j`. */
const isBelow = (name: string, exact: readonly string[]): boolean =>
  exact.some((pattern) => name.length > pattern.length && name.startsWith(`${pattern}.`))

/**
 * Whether a list of Library patterns matches a name: one of them does. The ecosystem of the
 * file that uses it says how the name is separated; without one, by `/` and `.`.
 */
export function libraryMatcher(
  patterns: readonly string[]
): (name: string, ecosystem?: Ecosystem) => boolean {
  const names = patterns.filter((pattern) => !pattern.includes('*'))
  const exact = new Set(names)
  const wild = patterns.filter((pattern) => pattern.includes('*'))
  const compiled = new Map<string, string[][]>()
  /** The wild patterns in segments, as the ecosystem separates them; `**` once where it repeats. */
  const wildIn = (ecosystem: Ecosystem | undefined): string[][] => {
    const key = ecosystem === 'npm' ? 'npm' : 'other'
    let found = compiled.get(key)
    if (found === undefined) {
      found = wild.map((pattern) =>
        segmentsOf(pattern, ecosystem).filter(
          (part, index, all) => !(part === '**' && all[index - 1] === '**')
        )
      )
      compiled.set(key, found)
    }
    return found
  }
  return (name, ecosystem) => {
    if (exact.has(name)) return true
    if ((ecosystem === 'maven' || ecosystem === 'python') && isBelow(name, names)) return true
    if (wild.length === 0) return false
    const segments = segmentsOf(name, ecosystem)
    return wildIn(ecosystem).some((pattern) => segmentsMatch(pattern, segments))
  }
}
