/**
 * Signs that an edit of an ADR that is no longer `proposed` may be more than a Correction.
 * A Correction never changes what a reader would understand to have been decided; the tool
 * cannot judge that, so it points at what usually gives it away and leaves the call to
 * the author. An empty result means nothing stood out.
 */
export function correctionWarnings(before: string, after: string): string[] {
  const [removed, added] = difference(words(before), words(after))
  const warnings: string[] = []

  const numbers = [...removed, ...added].filter((word) => /\d/.test(word))
  if (numbers.length > 0) {
    warnings.push(`A number changed: ${[...new Set(numbers)].join(', ')}.`)
  }
  if (removed.length + added.length > MANY_WORDS) {
    warnings.push(
      `More than a few words changed: ${added.length} added, ${removed.length} removed.`
    )
  }
  return warnings
}

/** A typo touches a word or two; a rewritten sentence goes past this quickly. */
const MANY_WORDS = 12

function words(text: string): string[] {
  return text.split(/[^\p{L}\p{N}.,:%-]+/u).filter((word) => /[\p{L}\p{N}]/u.test(word))
}

/** What is only in `a`, and what is only in `b`, counting repeated words. */
function difference(a: readonly string[], b: readonly string[]): [string[], string[]] {
  const counts = new Map<string, number>()
  for (const word of a) counts.set(word, (counts.get(word) ?? 0) + 1)
  const onlyB: string[] = []
  for (const word of b) {
    const left = counts.get(word) ?? 0
    if (left > 0) counts.set(word, left - 1)
    else onlyB.push(word)
  }
  const onlyA = [...counts].flatMap(([word, count]) => Array<string>(count).fill(word))
  return [onlyA, onlyB]
}
