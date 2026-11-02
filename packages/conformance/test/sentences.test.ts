import { describe, expect, it } from 'vitest'
import { CONFORMANCE_PROBLEM_CODES, CONFORMANCE_SENTENCES, RULE_KIND_NAMES } from '../src'

// Every Problem and every Violation has a code and an English sentence (docs/plan-roadmap.md,
// part 12): the window words the code in its own language.
describe('the sentences of conformance', () => {
  it('have one for every code of a Problem and every kind of Rule', () => {
    for (const code of [...CONFORMANCE_PROBLEM_CODES, ...RULE_KIND_NAMES]) {
      expect(CONFORMANCE_SENTENCES).toHaveProperty([code])
    }
  })
})
