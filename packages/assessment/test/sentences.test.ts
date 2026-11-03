import { describe, expect, it } from 'vitest'
import { KERNEL_SENTENCES } from '@adr-tool/kernel'
import {
  ASSESSMENT_PROBLEM_CODES,
  ASSESSMENT_SENTENCES,
  assessmentEnglishOf,
  EVIDENCE_KINDS
} from '../src'

// Every Problem and every refusal has a code and an English sentence (docs/plan-roadmap.md,
// part 12): the window words the code in its own language.
describe('the sentences of assessment', () => {
  it('have one for every code of a Problem', () => {
    for (const code of ASSESSMENT_PROBLEM_CODES) expect(ASSESSMENT_SENTENCES).toHaveProperty([code])
  })

  it('say every sentence with whatever values it is given, and the kernel’s too', () => {
    const values = new Proxy(
      {},
      { get: (_target, key) => (key === 'candidates' ? ['a', 'b', 'c'] : key === 'line' ? 7 : String(key)) }
    )
    for (const [code, sentence] of Object.entries(ASSESSMENT_SENTENCES)) {
      if (code in KERNEL_SENTENCES) continue
      const said = (sentence as (v: unknown) => string)(values)
      expect(said, code).not.toMatch(/undefined|\[object/)
    }
    for (const code of Object.keys(KERNEL_SENTENCES)) expect(ASSESSMENT_SENTENCES).toHaveProperty([code])
  })

  it('name each kind of evidence, and list names as a sentence does', () => {
    expect(
      EVIDENCE_KINDS.map((kind) =>
        assessmentEnglishOf({ code: 'evidence-not-there', values: { kind, name: 'x' } })
      )
    ).toEqual(
      [
        'the Violation',
        'the metric',
        'the Annotation',
        'the ADR',
        'the Risk',
        'the Technical Debt Item'
      ].map((what) => `${what} x is not there, so a Finding cannot cite it.`)
    )
    expect(
      assessmentEnglishOf({
        code: 'evidence-ambiguous-adr',
        values: { adr: '0004-events', candidates: ['docs/adr/0004-events', 'billing/0004-events'] }
      })
    ).toBe(
      '0004-events is in several Decision Logs: docs/adr/0004-events and billing/0004-events. Name it with its log.'
    )
    expect(
      assessmentEnglishOf({
        code: 'unreadable-entry',
        values: { path: 'a.md', line: 3, detail: { code: 'block-never-closed', values: {} } }
      })
    ).toBe('a.md, line 3: the block of an entry cannot be read: its fence is never closed.')
  })
})
