import type { HistoryEntry } from '../../../shared/ipc'

/**
 * The entry that recorded Correction number `correction` of a file (counted from 0): the
 * oldest one at which the file records more Corrections than that. Entries are newest first.
 */
export function recordedIn(
  entries: readonly HistoryEntry[],
  correction: number
): HistoryEntry | undefined {
  return entries.findLast((entry) => entry.corrections > correction)
}

/** A commit's date as the person who looks at it reads dates: their own calendar, no seconds. */
export function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const pad = (value: number): string => String(value).padStart(2, '0')
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  return `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
