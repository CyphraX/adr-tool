/** How the ADR files of a Decision Log are named (docs/file-format.md, section 1). */
export type NamingScheme = 'sequential' | 'date'

export interface AdrFileName {
  /** The file name without `.md`. */
  readonly id: string
  /** The leading digits: a number in a `sequential` log, a date in a `date` log. */
  readonly prefix: string
  readonly slug: string
}

const ADR_FILE = /^(\d{4,})-(.+)\.md$/

/** Read a file name as that of an ADR, or `undefined` when it does not follow either scheme. */
export function parseAdrFileName(name: string): AdrFileName | undefined {
  const match = ADR_FILE.exec(name)
  if (!match) return undefined
  return { id: name.slice(0, -'.md'.length), prefix: match[1]!, slug: match[2]! }
}

/** A log is `date` when every prefix is a valid eight-digit date; an empty log is `sequential`. */
export function detectNamingScheme(names: readonly AdrFileName[]): NamingScheme {
  return names.length > 0 && names.every((name) => isCalendarDate(name.prefix))
    ? 'date'
    : 'sequential'
}

/** The number people say aloud ("ADR-3"). Only ADRs of a `sequential` log have one. */
export function numberOf(name: AdrFileName, scheme: NamingScheme): number | undefined {
  return scheme === 'sequential' ? Number(name.prefix) : undefined
}

function isCalendarDate(digits: string): boolean {
  if (digits.length !== 8) return false
  const [year, month, day] = [digits.slice(0, 4), digits.slice(4, 6), digits.slice(6)].map(Number)
  const date = new Date(Date.UTC(year!, month! - 1, day!))
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 && date.getUTCDate() === day
  )
}
