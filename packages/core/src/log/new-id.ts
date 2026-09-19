import type { DecisionLog } from './load'

const MAX_SLUG_LENGTH = 60
const GERMAN: Readonly<Record<string, string>> = {
  ä: 'ae',
  ö: 'oe',
  ü: 'ue',
  Ä: 'Ae',
  Ö: 'Oe',
  Ü: 'Ue',
  ß: 'ss'
}

/**
 * The slug of a new ADR, made from its title: lowercase, German umlauts and `ß` written
 * out, other accents dropped, everything that is not a letter or a digit turned into a
 * dash, at most 60 characters. Empty when the title leaves nothing to build on.
 */
export function slugify(title: string): string {
  const ascii = title
    .replace(/[äöüÄÖÜß]/g, (letter) => GERMAN[letter]!)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
  const slug = ascii.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  if (slug.length <= MAX_SLUG_LENGTH) return slug
  // Cut at a word boundary when there is one, so the slug does not end in half a word.
  const cut = slug.slice(0, MAX_SLUG_LENGTH + 1)
  const boundary = cut.lastIndexOf('-')
  return (boundary > 0 ? cut.slice(0, boundary) : cut.slice(0, MAX_SLUG_LENGTH)).replace(/-+$/, '')
}

/**
 * The prefix of the next ADR of a log, as it is written in the file name: the highest
 * number plus one, padded to four digits or to the widest prefix the log already has —
 * or today's date in a `date` log.
 */
export function nextPrefix(log: Pick<DecisionLog, 'naming' | 'adrs'>, today: string): string {
  if (log.naming === 'date') return today.replaceAll('-', '')
  const prefixes = log.adrs.map((adr) => /^\d+/.exec(adr.id)?.[0] ?? '')
  const highest = Math.max(0, ...log.adrs.map((adr) => adr.number ?? 0))
  const width = Math.max(4, ...prefixes.map((prefix) => prefix.length))
  return String(highest + 1).padStart(width, '0')
}
