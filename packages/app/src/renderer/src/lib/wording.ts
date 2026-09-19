import type { Adr, Problem, Relation, RelationType, Status } from '@adr-tool/core'

export const STATUS_LABEL: Record<Status | 'unknown', string> = {
  proposed: 'Proposed',
  accepted: 'Accepted',
  rejected: 'Rejected',
  deprecated: 'Deprecated',
  superseded: 'Superseded',
  unknown: 'Unknown status'
}

/** How a Relation reads from the ADR that carries it, and from the ADR it points to. */
const RELATION_WORDING: Record<RelationType, { from: string; to: string }> = {
  supersedes: { from: 'Supersedes', to: 'Superseded by' },
  amends: { from: 'Amends', to: 'Amended by' },
  'depends-on': { from: 'Depends on', to: 'Needed by' },
  'relates-to': { from: 'Relates to', to: 'Related from' }
}

/** A Relation of a proposed ADR has not happened yet, and one of a rejected ADR never will. */
const PENDING_WORDING: Partial<Record<RelationType, { from: string; to: string }>> = {
  supersedes: { from: 'Proposes to supersede', to: 'Supersede proposed by' },
  amends: { from: 'Proposes to amend', to: 'Amendment proposed by' }
}

export function relationLabel(relation: Relation, side: 'from' | 'to'): string {
  const pending = relation.state === 'pending' ? PENDING_WORDING[relation.type] : undefined
  return (pending ?? RELATION_WORDING[relation.type])[side]
}

/** What the list and the header show in front of an ADR: its number as written, or its date. */
export function prefixOf(adr: Adr): string {
  const digits = /^\d+/.exec(adr.id)?.[0] ?? ''
  if (adr.number !== undefined || digits.length !== 8) return digits
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`
}

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
