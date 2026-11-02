import type { Adr, GuestAdr } from '../adr/adr'
import type { Problem } from '../problems/problem'
import { RELATION_TYPES, type RelationType } from '../relation'
import type { Status } from '../status'
import { normalReference, parseReference } from './reference'

/**
 * Whether a Relation counts, judged by the Status of the ADR that carries it
 * (docs/file-format.md, section 5):
 * - `in-effect`: the ADR has been accepted — it is `accepted`, `deprecated` or `superseded`.
 * - `pending`: the ADR is still `proposed`. Nothing is written to the target yet.
 * - `void`: the ADR was `rejected`, or its Status cannot be read.
 */
export type RelationState = 'in-effect' | 'pending' | 'void'

/**
 * A Relation that an ADR of a Decision Log carries, or that an ADR of another log carries to
 * one of its ADRs; both ADRs exist. `from` and `to` are references as the log writes them: a
 * bare ID for its own ADRs, `<log>/<ID>` for one of another log.
 */
export interface Relation {
  readonly type: RelationType
  /** The ADR that carries the Relation. */
  readonly from: string
  readonly to: string
  readonly state: RelationState
}

/** The log the Relations are read for: its directory, and the ADRs of the other logs. */
export interface LogContext {
  readonly path: string
  readonly guests: readonly GuestAdr[]
}

const ALONE: LogContext = { path: '', guests: [] }

export function hasBeenAccepted(status: Status | undefined): boolean {
  return status === 'accepted' || status === 'deprecated' || status === 'superseded'
}

function stateOf(status: Status | undefined): RelationState {
  if (hasBeenAccepted(status)) return 'in-effect'
  return status === 'proposed' ? 'pending' : 'void'
}

/**
 * The Relations of a Decision Log: those its ADRs carry, and those ADRs of other logs carry to
 * them. A Relation of its own to itself or to an ADR that does not exist becomes a Problem
 * instead; what another log's ADR names wrongly is that log's Problem.
 */
export function relationsOf(
  adrs: readonly Adr[],
  log: LogContext = ALONE
): {
  relations: Relation[]
  problems: Problem[]
} {
  const ids = new Set(adrs.map((adr) => adr.id))
  const guests = new Set(log.guests.map((guest) => guest.reference))
  const relations: Relation[] = []
  const seen = new Set<string>()
  const add = (relation: Relation): void => {
    const key = `${relation.type} ${relation.from} ${relation.to}`
    if (seen.has(key)) return
    seen.add(key)
    relations.push(relation)
  }
  const problems: Problem[] = []
  for (const adr of adrs) {
    const state = stateOf(adr.metadata.status)
    for (const type of RELATION_TYPES) {
      // What another file says this ADR supersedes counts like what its own file says.
      const implied = type === 'supersedes' ? (adr.impliedSupersedes ?? []) : []
      for (const written of [...adr.metadata.relations[type], ...implied]) {
        const target = normalReference(log.path, written)
        if (target === adr.id) problems.push({ kind: 'self-reference', adr: adr.id, key: type })
        else if (!ids.has(target) && !guests.has(target)) {
          problems.push({ kind: 'unknown-target', adr: adr.id, key: type, target: written })
        } else add({ type, from: adr.id, to: target, state })
      }
    }
  }
  // What the ADRs of other logs say about this log's ADRs.
  for (const guest of log.guests) {
    const state = stateOf(guest.metadata.status)
    for (const type of RELATION_TYPES) {
      for (const written of guest.metadata.relations[type]) {
        const { log: to, id } = parseReference(written)
        if (to === log.path && ids.has(id)) add({ type, from: guest.reference, to: id, state })
      }
    }
  }
  return { relations, problems }
}
