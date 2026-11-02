import { englishOf, type CoreSaid } from '../sentences'

/**
 * Signs that an edit of an ADR that is no longer `proposed` may be more than a Correction.
 * A Correction never changes what a reader would understand to have been decided; the tool
 * cannot judge that, so it points at what usually gives it away and leaves the call to
 * the author. An empty result means nothing stood out.
 */
export function correctionWarnings(before: string, after: string): string[] {
  return correctionSaid(before, after).map(englishOf)
}

/** The same signs as codes, for a window in another language. */
export function correctionSaid(before: string, after: string): CoreSaid[] {
  const [removed, added] = difference(words(before), words(after))
  const warnings: CoreSaid[] = []

  const numbers = [...removed, ...added].filter((word) => /\d/.test(word))
  if (numbers.length > 0) {
    warnings.push({ code: 'number-changed', values: { numbers: [...new Set(numbers)] } })
  }
  if (removed.length + added.length > MANY_WORDS) {
    warnings.push({
      code: 'many-words-changed',
      values: { added: added.length, removed: removed.length }
    })
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
