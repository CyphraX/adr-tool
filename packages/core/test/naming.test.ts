import { describe, expect, it } from 'vitest'
import { detectNamingScheme, numberOf, parseAdrFileName } from '../src/log/naming'

const parsed = (...names: string[]) => names.map((name) => parseAdrFileName(name)!)

describe('parseAdrFileName', () => {
  it('reads ID, prefix and slug', () => {
    expect(parseAdrFileName('0003-postgres-write-model.md')).toEqual({
      id: '0003-postgres-write-model',
      prefix: '0003',
      slug: 'postgres-write-model'
    })
  })

  it('reads any slug, also the mixed case that MADR itself uses', () => {
    expect(parseAdrFileName('0001-use-CC0-or-MIT-as-license.md')?.slug).toBe(
      'use-CC0-or-MIT-as-license'
    )
  })

  it('ignores files that are not ADRs', () => {
    for (const name of ['README.md', 'template.md', 'index.md', '003-short.md', '0003-notes.txt']) {
      expect(parseAdrFileName(name), name).toBeUndefined()
    }
  })
})

describe('detectNamingScheme', () => {
  it('is sequential for numbered files and for an empty log', () => {
    expect(detectNamingScheme(parsed('0001-a.md', '0002-b.md'))).toBe('sequential')
    expect(detectNamingScheme([])).toBe('sequential')
  })

  it('is date only when every prefix is a calendar date', () => {
    expect(detectNamingScheme(parsed('20260919-a.md', '20240229-b.md'))).toBe('date')
    expect(detectNamingScheme(parsed('20260919-a.md', '0002-b.md'))).toBe('sequential')
    // 30 February does not exist, so these are just large numbers.
    expect(detectNamingScheme(parsed('20260230-a.md'))).toBe('sequential')
  })
})

describe('numberOf', () => {
  it('is the prefix as a number in a sequential log, and absent in a date log', () => {
    const [name] = parsed('0012-a.md')
    expect(numberOf(name!, 'sequential')).toBe(12)
    expect(numberOf(name!, 'date')).toBeUndefined()
  })
})
