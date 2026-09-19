import type { Correction } from '@adr-tool/core'
import type { HistoryEntry } from '../../../shared/ipc'

const same = (a: Correction, b: Correction): boolean =>
  a.date === b.date && a.author === b.author && a.note === b.note

/**
 * The entry that recorded a Correction of a file: the oldest one at which the file records
 * it. Entries are newest first. `corrections` is the file's list as it is now and `index`
 * the Correction in it; of several that read the same, the n-th is looked for as the n-th.
 */
export function recordedIn(
  entries: readonly HistoryEntry[],
  corrections: readonly Correction[],
  index: number
): HistoryEntry | undefined {
  const wanted = corrections[index]
  if (!wanted) return undefined
  const nth = corrections.slice(0, index + 1).filter((other) => same(other, wanted)).length
  return entries.findLast(
    (entry) => entry.corrections.filter((other) => same(other, wanted)).length >= nth
  )
}

/** A commit's date as the person who looks at it reads dates: their own calendar, no seconds. */
export function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const pad = (value: number): string => String(value).padStart(2, '0')
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  return `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
