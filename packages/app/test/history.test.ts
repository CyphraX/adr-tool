import { describe, expect, it } from 'vitest'
import type { Correction } from '@adr-tool/core'
import { formatDate, recordedIn } from '../src/renderer/src/lib/history'
import type { HistoryEntry } from '../src/shared/ipc'

const spelling: Correction = { date: '2025-06-02', author: 'Alex Roth', note: 'Spelling' }
const link: Correction = { date: '2025-09-30', note: 'Dead link' }

const entry = (id: string, ...corrections: Correction[]): HistoryEntry => ({
  id,
  subject: id,
  corrections
})

describe('the commit that recorded a Correction', () => {
  it('is the oldest one at which the file records it', () => {
    // Newest first, as git lists them.
    const entries = [
      entry('e', spelling, link),
      entry('d', spelling, link),
      entry('c', spelling),
      entry('b'),
      entry('a')
    ]
    expect(recordedIn(entries, [spelling, link], 0)?.id).toBe('c')
    expect(recordedIn(entries, [spelling, link], 1)?.id).toBe('d')
  })

  it('is found by what the Correction says, so two branches that each recorded one do not mix', () => {
    // git lists both sides of a merge, and not the merge.
    const entries = [entry('trunk', spelling), entry('side', link), entry('base')]
    expect(recordedIn(entries, [spelling, link], 0)?.id).toBe('trunk')
    expect(recordedIn(entries, [spelling, link], 1)?.id).toBe('side')
  })

  it('tells two Corrections that read the same apart by their order', () => {
    const entries = [entry('c', link, link), entry('b', link), entry('a')]
    expect(recordedIn(entries, [link, link], 0)?.id).toBe('b')
    expect(recordedIn(entries, [link, link], 1)?.id).toBe('c')
  })

  it('does not exist for a Correction no entry knows, or without git', () => {
    expect(recordedIn([entry('a')], [spelling], 0)).toBeUndefined()
    expect(recordedIn([], [spelling], 0)).toBeUndefined()
    expect(recordedIn([entry('a', spelling)], [spelling], 3)).toBeUndefined()
  })
})

describe('a commit date', () => {
  it('is shown to the minute, and left alone when it is not a date', () => {
    expect(formatDate('2026-09-19T14:05:09')).toBe('2026-09-19 14:05')
    expect(formatDate('yesterday')).toBe('yesterday')
  })
})
