import type { Adr } from '@adr-tool/core'

/** A piece of an excerpt; `match` marks what was searched for. */
export interface ExcerptPart {
  readonly text: string
  readonly match: boolean
}

export interface SearchHit {
  readonly adr: Adr
  /** Where in the text the search matched. Empty when the title or the Metadata already say why. */
  readonly excerpt: readonly ExcerptPart[]
}

/** How much a word counts, by where it is found. The title is what people remember an ADR by. */
const WEIGHT = {
  number: 100,
  title: 50,
  titleStart: 10,
  id: 40,
  tag: 30,
  person: 25,
  status: 20,
  body: 10
}

/** How much of a line is shown in front of a match. */
const LEAD = 40

/**
 * Full-text search over the ADRs that are loaded: every word of the query has to be
 * somewhere in the ADR — its number, title, ID, tags, decision-makers, Status or text.
 * Best first; ADRs that match equally well stay in the order they came in.
 */
export function search(adrs: readonly Adr[], query: string): SearchHit[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return []

  const hits: { hit: SearchHit; score: number }[] = []
  for (const adr of adrs) {
    const title = (adr.title ?? '').toLowerCase()
    const body = adr.body.toLowerCase()
    let score = 0
    let inTextOnly: string | undefined

    for (const word of words) {
      const outside = scoreOutsideText(adr, title, word)
      const found = outside > 0 ? outside : body.includes(word) ? WEIGHT.body : 0
      if (found === 0) {
        score = 0
        break
      }
      if (outside === 0) inTextOnly ??= word
      score += found
    }
    if (score === 0) continue
    hits.push({
      hit: { adr, excerpt: inTextOnly === undefined ? [] : excerptOf(adr.body, inTextOnly) },
      score
    })
  }
  // `sort` is stable: equal scores keep the order of the log.
  return hits.sort((a, b) => b.score - a.score).map(({ hit }) => hit)
}

function scoreOutsideText(adr: Adr, title: string, word: string): number {
  // "4", "0004" and "adr-4" all mean ADR 4.
  const number = /^(?:adr[-\s]?)?(\d+)$/.exec(word)?.[1]
  if (number !== undefined && adr.number === Number(number)) return WEIGHT.number

  const at = title.indexOf(word)
  if (at !== -1) {
    const startsWord = at === 0 || /[^\p{L}\p{N}]/u.test(title[at - 1]!)
    return WEIGHT.title + (startsWord ? WEIGHT.titleStart : 0)
  }
  if (adr.id.toLowerCase().includes(word)) return WEIGHT.id
  const { tags, decisionMakers, status, rawStatus } = adr.metadata
  if (tags.some((tag) => tag.toLowerCase().includes(word))) return WEIGHT.tag
  if (decisionMakers.some((person) => person.toLowerCase().includes(word))) return WEIGHT.person
  if ((rawStatus ?? status ?? '').toLowerCase() === word) return WEIGHT.status
  return 0
}

/** The line of the text in which the word first occurs, from a little before the match. */
function excerptOf(body: string, word: string): ExcerptPart[] {
  const at = body.toLowerCase().indexOf(word)
  if (at === -1) return []
  const lineStart = body.lastIndexOf('\n', at) + 1
  const lineEnd = body.indexOf('\n', at)
  const line = body.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).replace(/\r$/, '')
  const inLine = at - lineStart

  // Start at a word, not in the middle of one.
  const cut = inLine > LEAD ? line.indexOf(' ', inLine - LEAD) + 1 : 0
  const from = cut > 0 && cut <= inLine ? cut : 0
  return [
    { text: (from > 0 ? '… ' : '') + line.slice(from, inLine), match: false },
    { text: line.slice(inLine, inLine + word.length), match: true },
    { text: line.slice(inLine + word.length), match: false }
  ].filter((part) => part.text !== '')
}
