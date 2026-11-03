import { describe, expect, it } from 'vitest'
import {
  CONFORMANCE_NOTE_CODES,
  CONFORMANCE_PROBLEM_CODES,
  CONFORMANCE_SENTENCES,
  RULE_KIND_NAMES
} from '../src'

// Every Problem and every Violation has a code and an English sentence (docs/plan-roadmap.md,
// part 12): the window words the code in its own language.
describe('the sentences of conformance', () => {
  it('have one for every code of a Problem and every kind of Rule', () => {
    for (const code of [
      ...CONFORMANCE_PROBLEM_CODES,
      ...CONFORMANCE_NOTE_CODES,
      ...RULE_KIND_NAMES
    ]) {
      expect(CONFORMANCE_SENTENCES).toHaveProperty([code])
    }
  })

  it('list five names, and count the rest', () => {
    const seven = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    expect(CONFORMANCE_SENTENCES['no-cycles']({ members: seven, roundTrip: seven })).toBe(
      'a, b, c, d, e and 2 more depend on each other in a Cycle, for example a -> b -> c -> d -> e -> … -> a'
    )
    expect(
      CONFORMANCE_SENTENCES['may-only-depend']({ from: 'x', to: 'y', allowed: seven.slice(0, 5) })
    ).toBe('x may only depend on a, b, c, d and e, and depends on y')
  })

  it('word the Source Files of no Component as such', () => {
    expect(
      CONFORMANCE_SENTENCES['may-only-depend']({ from: 'x', to: '(unassigned)', allowed: [] })
    ).toBe(
      'x may depend on no other Component, and depends on Source Files that belong to no Component'
    )
  })
})
