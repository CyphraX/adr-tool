import { unreadableFrontmatter } from './group'
import type { Problem } from './problem'

/**
 * Every kind of Problem, which is also its code: what `adr lint` prints and a pipeline may
 * filter by (docs/cli.md, "The codes"). A code stays; a new kind of Problem gets a new one.
 * The record makes the compiler check that no kind is missing.
 */
const CODES: Record<Problem['kind'], true> = {
  'unterminated-frontmatter': true,
  'invalid-frontmatter': true,
  'invalid-metadata': true,
  'status-not-lowercase': true,
  'unknown-target': true,
  'self-reference': true,
  'unknown-component': true,
  'missing-back-reference': true,
  'unfounded-back-reference': true,
  'not-marked-superseded': true,
  'superseded-without-successor': true,
  'supersedes-cycle': true,
  'duplicate-number': true,
  'invalid-configuration': true,
  'missing-log-directory': true
}

export type ProblemCode = Problem['kind']

export const PROBLEM_CODES = Object.keys(CODES) as readonly ProblemCode[]

/**
 * What a Problem says, in one sentence: the same in the window and on the command line. It is
 * written about the ADR it is reported on — "this ADR" — and names every other ADR by its ID.
 */
export function describeProblem(problem: Problem): string {
  switch (problem.kind) {
    case 'unterminated-frontmatter':
      return 'The frontmatter opens with --- and is never closed. Metadata cannot be read or written until that is fixed.'
    case 'invalid-frontmatter':
      return `The frontmatter cannot be read: ${problem.detail}`
    case 'invalid-metadata':
      return `${problem.key}: ${problem.detail}`
    case 'status-not-lowercase':
      return `The Status is written "${problem.written}". It has to be lowercase.`
    case 'unknown-target':
      return `${problem.key} names ${problem.target}, which is not in this Decision Log.`
    case 'self-reference':
      return `${problem.key} names this ADR itself.`
    case 'unknown-component':
      return `affects names ${problem.component}, which is not a declared Component.`
    case 'missing-back-reference':
      return `${problem.source} has been accepted and points here, but ${problem.key} does not list it.`
    case 'unfounded-back-reference':
      return `${problem.key} lists ${problem.source}, which has no such Relation in effect.`
    case 'not-marked-superseded':
      return `${problem.source} has been accepted and supersedes this ADR, but its Status is not superseded.`
    case 'superseded-without-successor':
      return 'The Status is superseded, but no accepted ADR supersedes this one.'
    case 'supersedes-cycle':
      return `These ADRs supersede each other in a circle: ${problem.adrs.join(', ')}.`
    case 'duplicate-number':
      return `Number ${problem.number} is used by ${problem.adrs.join(' and ')}.`
    case 'invalid-configuration':
      return `${problem.path} cannot be used: ${problem.detail}`
    case 'missing-log-directory':
      return `The configured directory ${problem.path} does not exist.`
  }
}

/** Is the root cause the frontmatter (as against the Status)? */
const unreadable = unreadableFrontmatter

/**
 * Above the Problems that follow from `root`, a root cause of `groupProblems`, where `root`
 * itself is shown: they go away with it, and none of them is to be repaired on its own.
 */
export function describeConsequences(root: Problem): string {
  return unreadable(root)
    ? 'Reported only because this file cannot be read. Fix its frontmatter first, then look again: some of this may turn out to be real.'
    : 'Reported only because the Status of this file is none of the five values, which voids its Relations. Fix the Status first, then look again: some of this may turn out to be real.'
}

/** Next to a Problem on one ADR that is only reported because of `root` on another. */
export function describeCause(root: Problem): string {
  const adr = 'adr' in root ? root.adr : ''
  return unreadable(root)
    ? `Reported only because the frontmatter of ${adr} cannot be read.`
    : `Reported only because the Status of ${adr} is none of the five values, which voids its Relations.`
}
