import { describe, expect, it } from 'vitest'
import type { ProblemGroup } from '@adr-tool/core'
import { adrsOf, problemsOf } from '../src/renderer/src/lib/problems'

const groups: ProblemGroup[] = [
  {
    problem: { kind: 'invalid-frontmatter', adr: '0002-new', detail: 'broken' },
    consequences: [
      { kind: 'missing-back-reference', adr: '0002-new', key: 'amended-by', source: '0003-more' },
      {
        kind: 'unfounded-back-reference',
        adr: '0001-old',
        key: 'superseded-by',
        source: '0002-new'
      }
    ]
  },
  {
    problem: { kind: 'duplicate-number', number: 3, adrs: ['0003-more', '0003-other'] },
    consequences: []
  },
  { problem: { kind: 'missing-log-directory', path: 'docs/decisions' }, consequences: [] }
]

describe('the Problems one ADR shows', () => {
  it('are those reported on it, whichever of several ADRs it is', () => {
    expect(problemsOf(groups, '0003-other')).toEqual([{ problem: groups[1]!.problem }])
    expect(adrsOf(groups[2]!.problem)).toEqual([])
  })

  it('name the broken file that a Problem merely follows from', () => {
    expect(problemsOf(groups, '0001-old')).toEqual([
      { problem: groups[0]!.consequences[1], cause: '0002-new' }
    ])
  })

  it('leave out what follows from the ADR’s own broken frontmatter', () => {
    expect(problemsOf(groups, '0002-new')).toEqual([{ problem: groups[0]!.problem }])
  })
})
