import type { Correction } from '@adr-tool/core'
import { WORKING_TREE, type HistoryEntry } from '../../../shared/ipc'

/**
 * Where the history dialog stays when it reads the history again, because the file or git
 * moved while it was open: at the entry that was selected while that is still there, and
 * otherwise at the newest — a change that was not committed and now is, is the commit on top.
 * `reread`: whether what the entry did has to be read again. What a commit did stays what it
 * was; what is on disk and not committed changes with the file.
 */
export function followHistory(
  entries: readonly HistoryEntry[],
  selectedId: string | undefined
): { selectedId: string | undefined; reread: boolean } {
  const stays = entries.some((entry) => entry.id === selectedId)
  const next = stays ? selectedId : entries[0]?.id
  return { selectedId: next, reread: next !== undefined && (!stays || next === WORKING_TREE) }
}

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
