import type { Adr } from '@adr-tool/core'

/** A piece of an excerpt; `match` marks what was searched for. */
export interface ExcerptPart {
  readonly text: string
  readonly match: boolean
}

export interface SearchHit {
  readonly adr: Adr
  /** How well the ADR matches; only good for comparing hits of one query. */
  readonly score: number
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
  date: 15,
  correction: 15,
  body: 10
}

/** How much of a line is shown in front of a match. */
const LEAD = 40

/** Text as it is compared, and where in the original each of its characters came from. */
export interface FoldedText {
  readonly text: string
  /**
   * For each character of `text`, where the character it came from starts and ends in the
   * original. Both characters of an "ss" from "ß" have the range of the "ß"; a mark that
   * folds to nothing belongs to the range of the letter before it.
   */
  readonly from: readonly number[]
  readonly to: readonly number[]
}

/** One character as it is compared: lowercase, without accents, "ß" and "ẞ" as "ss". */
function foldCharacter(character: string): string {
  const lower = character.toLowerCase()
  return lower === 'ß' ? 'ss' : lower.normalize('NFD').replace(/\p{M}/gu, '')
}

/**
 * Text as it is compared: lowercase and without accents — "fur" finds "für" — with "ß" as
 * "ss", so that "strasse" finds "Straße" and "Straße" finds "Strasse". That changes the
 * length, so the folded text keeps where each of its characters came from: a match is
 * marked in the original, whatever stands before it.
 */
export function foldWithPlaces(text: string): FoldedText {
  let folded = ''
  const from: number[] = []
  const to: number[] = []
  let last = 0
  let position = 0
  for (const character of text) {
    const end = position + character.length
    const bare = foldCharacter(character)
    if (bare === '') {
      // A mark of its own, as in text written decomposed: part of the letter before it.
      for (let place = last; place < to.length; place++) to[place] = end
    } else {
      last = folded.length
      folded += bare
      for (let count = 0; count < bare.length; count++) {
        from.push(position)
        to.push(end)
      }
    }
    position = end
  }
  return { text: folded, from, to }
}

export function fold(text: string): string {
  return foldWithPlaces(text).text
}

/** "adr-4", "adr 4", "ADR4" and "#4" are how people say "ADR 4": one word, the number. */
function wordsOf(query: string): string[] {
  return fold(query)
    .replace(/(?:\badr[-\s]*|#)(\d+)\b/g, ' #$1 ')
    .split(/\s+/)
    .filter(Boolean)
}

interface Folded {
  readonly title: string
  readonly id: string
  readonly body: FoldedText
  readonly tags: readonly string[]
  readonly people: readonly string[]
  readonly status: string
  readonly dates: readonly string[]
  readonly corrections: readonly string[]
}

/** Folding every text on every keystroke would be the slow part; an ADR that was not reloaded is folded once. */
const foldedAdrs = new WeakMap<Adr, Folded>()

function foldedOf(adr: Adr): Folded {
  let folded = foldedAdrs.get(adr)
  if (!folded) {
    const { tags, decisionMakers, status, rawStatus, created, decided, corrections } = adr.metadata
    folded = {
      title: fold(adr.title ?? ''),
      id: fold(adr.id),
      body: foldWithPlaces(adr.body),
      tags: tags.map(fold),
      people: decisionMakers.map(fold),
      status: fold(rawStatus ?? status ?? ''),
      dates: [created, decided, ...corrections.map(({ date }) => date)].flatMap(
        (date) => date ?? []
      ),
      corrections: corrections.map(({ author, note }) => fold(`${author ?? ''} ${note ?? ''}`))
    }
    foldedAdrs.set(adr, folded)
  }
  return folded
}

/**
 * Full-text search over the ADRs that are loaded: every word of the query has to be
 * somewhere in the ADR — its number, title, ID, tags, decision-makers, Status, dates,
 * Corrections or text. Best first; ADRs that match equally well stay in the order they came in.
 */
export function search(adrs: readonly Adr[], query: string): SearchHit[] {
  const words = wordsOf(query)
  if (words.length === 0) return []

  const hits: SearchHit[] = []
  for (const adr of adrs) {
    const folded = foldedOf(adr)
    let score = 0
    let inTextOnly: string | undefined

    for (const word of words) {
      const outside = scoreOutsideText(adr, folded, word)
      const found = outside > 0 ? outside : folded.body.text.includes(word) ? WEIGHT.body : 0
      if (found === 0) {
        score = 0
        break
      }
      if (outside === 0) inTextOnly ??= word
      score += found
    }
    if (score === 0) continue
    const excerpt = inTextOnly === undefined ? [] : excerptOf(adr.body, folded.body, inTextOnly)
    hits.push({ adr, score, excerpt })
  }
  // `sort` is stable: equal scores keep the order of the log.
  return hits.sort((a, b) => b.score - a.score)
}

function scoreOutsideText(adr: Adr, folded: Folded, word: string): number {
  const number = /^#?(\d+)$/.exec(word)?.[1]
  if (number !== undefined && adr.number === Number(number)) return WEIGHT.number
  if (word.startsWith('#')) return 0

  const at = folded.title.indexOf(word)
  if (at !== -1) {
    const startsWord = at === 0 || /[^\p{L}\p{N}]/u.test(folded.title[at - 1]!)
    return WEIGHT.title + (startsWord ? WEIGHT.titleStart : 0)
  }
  if (folded.id.includes(word)) return WEIGHT.id
  if (folded.tags.some((tag) => tag.includes(word))) return WEIGHT.tag
  if (folded.people.some((person) => person.includes(word))) return WEIGHT.person
  if (folded.status.includes(word)) return WEIGHT.status
  // A date is found from its start: "2025-05" is a month, "05" is nothing.
  if (folded.dates.some((date) => date.startsWith(word))) return WEIGHT.date
  if (folded.corrections.some((correction) => correction.includes(word))) return WEIGHT.correction
  return 0
}

/**
 * The line of the text in which the word first occurs, from a little before the match.
 * `folded` says where each of its characters is in `body`, so the match is marked in the
 * original: all of a "ß" that "ss" or half of it matched, a letter with its accent.
 */
function excerptOf(body: string, folded: FoldedText, word: string): ExcerptPart[] {
  const found = folded.text.indexOf(word)
  if (found === -1) return []
  const at = folded.from[found]!
  const length = folded.to[found + word.length - 1]! - at
  const lineStart = body.lastIndexOf('\n', at) + 1
  const lineEnd = body.indexOf('\n', at)
  const line = body.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).replace(/\r$/, '')
  const inLine = at - lineStart

  // Start at a word if there is one to start at, and never so early that the match is out of sight.
  let from = 0
  if (inLine > LEAD) {
    const afterSpace = line.indexOf(' ', inLine - LEAD) + 1
    from = afterSpace > 0 && afterSpace <= inLine ? afterSpace : inLine - LEAD
  }
  return [
    { text: (from > 0 ? '… ' : '') + line.slice(from, inLine), match: false },
    { text: line.slice(inLine, inLine + length), match: true },
    { text: line.slice(inLine + length), match: false }
  ].filter((part) => part.text !== '')
}

export interface LogHit extends SearchHit {
  readonly logPath: string
}

/**
 * The search over every Decision Log of a repository: best first, whichever log a hit is
 * in. Of hits that match equally well, those of the log in view come first — that is
 * where the person is looking.
 */
export function searchLogs(
  logs: readonly { readonly path: string; readonly adrs: readonly Adr[] }[],
  query: string,
  inView?: string
): LogHit[] {
  const ordered = [...logs].sort((a, b) => Number(b.path === inView) - Number(a.path === inView))
  return ordered
    .flatMap((log) => search(log.adrs, query).map((hit) => ({ ...hit, logPath: log.path })))
    .sort((a, b) => b.score - a.score)
}
