import { describe, expect, it } from 'vitest'
import { formatDate, recordedIn } from '../src/renderer/src/lib/history'
import type { HistoryEntry } from '../src/shared/ipc'

const entry = (id: string, corrections: number): HistoryEntry => ({ id, subject: id, corrections })

describe('the commit that recorded a Correction', () => {
  // Newest first, as git lists them.
  const entries = [entry('e', 2), entry('d', 2), entry('c', 1), entry('b', 0), entry('a', 0)]

  it('is the oldest one at which the file records that many Corrections', () => {
    expect(recordedIn(entries, 0)?.id).toBe('c')
    expect(recordedIn(entries, 1)?.id).toBe('d')
  })

  it('does not exist for a Correction no entry knows, or without git', () => {
    expect(recordedIn(entries, 2)).toBeUndefined()
    expect(recordedIn([], 0)).toBeUndefined()
  })
})

describe('a commit date', () => {
  it('is shown to the minute, and left alone when it is not a date', () => {
    expect(formatDate('2026-09-19T14:05:09')).toBe('2026-09-19 14:05')
    expect(formatDate('yesterday')).toBe('yesterday')
  })
})
