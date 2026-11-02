import { describe, expect, it } from 'vitest'
import {
  PROBLEM_CODES,
  describeCause,
  describeConsequences,
  describeProblem,
  type Problem
} from '../src'

describe('what a Problem is called and how it reads', () => {
  it('has a code for every kind, and the code is the kind', () => {
    expect(PROBLEM_CODES).toEqual([
      'unterminated-frontmatter',
      'invalid-frontmatter',
      'invalid-metadata',
      'status-not-lowercase',
      'unknown-target',
      'self-reference',
      'unknown-component',
      'missing-back-reference',
      'unfounded-back-reference',
      'not-marked-superseded',
      'superseded-without-successor',
      'supersedes-cycle',
      'duplicate-number',
      'invalid-configuration',
      'missing-log-directory',
      'other-repository'
    ])
  })

  it('reads as one sentence that names what is wrong', () => {
    const said = (problem: Problem): string => describeProblem(problem)
    expect(
      said({ kind: 'unknown-target', adr: '0003-a', key: 'depends-on', target: '0042-gone' })
    ).toBe('depends-on names 0042-gone, which is not in this Decision Log.')
    expect(said({ kind: 'status-not-lowercase', adr: '0004-b', written: 'Rejected' })).toBe(
      'The Status is written "Rejected". It has to be lowercase.'
    )
    expect(said({ kind: 'duplicate-number', number: 6, adrs: ['0006-a', '0006-b'] })).toBe(
      'Number 6 is used by 0006-a and 0006-b.'
    )
    expect(said({ kind: 'missing-log-directory', path: 'docs/decisions' })).toBe(
      'The configured directory docs/decisions does not exist.'
    )
  })

  it('says why a Problem is only reported because of another one', () => {
    const unreadable: Problem = { kind: 'invalid-frontmatter', adr: '0002-new', detail: 'x' }
    const status: Problem = {
      kind: 'invalid-metadata',
      adr: '0002-new',
      key: 'status',
      detail: '"approved" is not one of proposed, accepted, rejected, deprecated, superseded'
    }
    expect(describeCause(unreadable)).toBe(
      'Reported only because the frontmatter of 0002-new cannot be read.'
    )
    expect(describeCause(status)).toBe(
      'Reported only because the Status of 0002-new is none of the five values, which voids its Relations.'
    )
    expect(describeConsequences(unreadable)).toMatch(
      /^Reported only because this file cannot be read\./
    )
    expect(describeConsequences(status)).toMatch(
      /^Reported only because the Status of this file is none of the five values/
    )
  })
})
