import { describe, expect, it } from 'vitest'
import { BACK_REFERENCE_KEYS, RELATION_TYPES, STATUSES, isRelationType, isStatus } from '../src'

describe('Status', () => {
  it('accepts exactly the five fixed values', () => {
    for (const status of STATUSES) expect(isStatus(status)).toBe(true)
    expect(STATUSES).toHaveLength(5)
  })

  it('rejects foreign and differently cased values', () => {
    // Foreign formats write `Accepted`, `draft` or `on hold`; reading those
    // tolerantly is the job of the foreign readers, not of the own format.
    for (const value of ['Accepted', 'draft', 'on hold', '', undefined, 3]) {
      expect(isStatus(value)).toBe(false)
    }
  })
})

describe('Relation type', () => {
  it('accepts exactly the four fixed values', () => {
    for (const type of RELATION_TYPES) expect(isRelationType(type)).toBe(true)
    expect(RELATION_TYPES).toHaveLength(4)
    expect(isRelationType('superseded-by')).toBe(false)
  })

  it('mirrors only supersedes and amends as Back-references', () => {
    expect(Object.keys(BACK_REFERENCE_KEYS).sort()).toEqual(['amends', 'supersedes'])
    for (const key of Object.values(BACK_REFERENCE_KEYS)) {
      expect(isRelationType(key)).toBe(false)
    }
  })
})
