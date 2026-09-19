import type { Adr } from '../adr/adr'
import type { Problem } from '../problems/problem'
import { RELATION_TYPES, type RelationType } from '../relation'
import type { Status } from '../status'

/**
 * Whether a Relation counts, judged by the Status of the ADR that carries it
 * (docs/file-format.md, section 5):
 * - `in-effect`: the ADR has been accepted — it is `accepted`, `deprecated` or `superseded`.
 * - `pending`: the ADR is still `proposed`. Nothing is written to the target yet.
 * - `void`: the ADR was `rejected`, or its Status cannot be read.
 */
export type RelationState = 'in-effect' | 'pending' | 'void'

/** A Relation between two ADRs of one Decision Log, both of which exist. */
export interface Relation {
  readonly type: RelationType
  /** The ID of the ADR that carries the Relation. */
  readonly from: string
  readonly to: string
  readonly state: RelationState
}

export function hasBeenAccepted(status: Status | undefined): boolean {
  return status === 'accepted' || status === 'deprecated' || status === 'superseded'
}

function stateOf(status: Status | undefined): RelationState {
  if (hasBeenAccepted(status)) return 'in-effect'
  return status === 'proposed' ? 'pending' : 'void'
}

/** The Relations of a Decision Log. A Relation to itself or to an unknown ID becomes a Problem instead. */
export function relationsOf(adrs: readonly Adr[]): {
  relations: Relation[]
  problems: Problem[]
} {
  const ids = new Set(adrs.map((adr) => adr.id))
  const relations: Relation[] = []
  const problems: Problem[] = []
  for (const adr of adrs) {
    const state = stateOf(adr.metadata.status)
    for (const type of RELATION_TYPES) {
      for (const target of adr.metadata.relations[type]) {
        if (target === adr.id) problems.push({ kind: 'self-reference', adr: adr.id, key: type })
        else if (!ids.has(target)) {
          problems.push({ kind: 'unknown-target', adr: adr.id, key: type, target })
        } else relations.push({ type, from: adr.id, to: target, state })
      }
    }
  }
  return { relations, problems }
}
