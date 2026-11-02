import { FOREIGN_FORMAT_NAMES, type Adr, type GuestAdr } from '../adr/adr'
import type { DecisionLog } from '../log/load'
import { isQualified, normalReference } from '../relations/reference'
import type { Status } from '../status'
import { Refusal } from './pending'

/** The ADR `id` of the log, if the tool may write its Metadata. `because` says who is asking for it. */
export function writable(log: DecisionLog, id: string, because?: string): Adr {
  const adr = log.adrs.find((candidate) => candidate.id === id)
  if (!adr) {
    throw new Refusal(
      because
        ? `${because}, which is not in this Decision Log.`
        : `There is no ADR ${id} in this Decision Log.`
    )
  }
  if (!adr.metadataWritable) {
    throw new Refusal(
      `The frontmatter of ${id} cannot be read. Fix it before the tool writes to it.`
    )
  }
  requireOwnFormat(adr)
  return adr
}

/** An ADR of the log, or of another log of the repository: what an operation may write to. */
export type AnyAdr = Adr | GuestAdr

/** How the log names an ADR: its ID, or `<log>/<ID>` for one of another log. */
export const nameOf = (adr: Named): string => adr.reference ?? adr.id

/** What an ADR is named by: its ID, and its reference when it is one of another log. */
type Named = Pick<Adr, 'id'> & { readonly reference?: string }

/** The directory of the Decision Log `adr` belongs to, seen from `log`. */
export const logOf = (log: DecisionLog, adr: AnyAdr): string =>
  'reference' in adr ? adr.log : log.path

/** The ADR a reference written in `log` names: one of its own, or one of another log. */
export function named(log: DecisionLog, reference: string): AnyAdr | undefined {
  const normal = normalReference(log.path, reference)
  return isQualified(normal)
    ? (log.guests ?? []).find((guest) => guest.reference === normal)
    : log.adrs.find((candidate) => candidate.id === normal)
}

/**
 * The ADR a reference of the log names, if the tool may write its Metadata: the target of a
 * Relation, which may lie in another log. `because` says who is asking for it.
 */
export function writableTarget(log: DecisionLog, reference: string, because: string): AnyAdr {
  const adr = named(log, reference)
  if (!adr) {
    throw new Refusal(
      `${because}, which is not ${isQualified(normalReference(log.path, reference)) ? 'an ADR of this repository' : 'in this Decision Log'}.`
    )
  }
  if (!adr.metadataWritable) {
    throw new Refusal(
      `The frontmatter of ${nameOf(adr)} cannot be read. Fix it before the tool writes to it.`
    )
  }
  requireOwnFormat(adr)
  return adr
}

/** The tool reads a foreign format and never writes it (docs/file-format.md, section 8). */
export function requireOwnFormat(
  adr: Pick<AnyAdr, 'id' | 'foreign' | 'noMigration'> & Partial<Pick<GuestAdr, 'reference'>>,
  and = ' Migrate it first.'
): void {
  if (!adr.foreign) return
  throw new Refusal(
    `${adr.reference ?? adr.id} is written in the format of ${FOREIGN_FORMAT_NAMES[adr.foreign]}. The tool reads that format and never writes it.${adr.noMigration === undefined ? and : ` It ${adr.noMigration}`}`
  )
}

export function requireStatus(
  adr: Named & Pick<Adr, 'metadata'>,
  allowed: readonly Status[],
  rule: string
): void {
  const status = adr.metadata.status
  if (status !== undefined && allowed.includes(status)) return
  const is = adr.metadata.rawStatus ? `"${adr.metadata.rawStatus}"` : status
  throw new Refusal(`${rule} ${nameOf(adr)} is ${is}.`)
}

const TARGET_STATUS: Record<'supersedes' | 'amends', { allowed: Status[]; rule: string }> = {
  supersedes: {
    allowed: ['accepted', 'deprecated'],
    rule: 'Only an accepted or deprecated ADR can be superseded.'
  },
  amends: { allowed: ['accepted'], rule: 'Only an accepted ADR can be amended.' }
}

/** Supersede targets an ADR that is accepted or deprecated, Amend one that is accepted (docs/file-format.md, section 5). */
export function requireTarget(type: 'supersedes' | 'amends', target: AnyAdr): void {
  // Accepting the Relation would write to the target: no use proposing what cannot be accepted.
  requireOwnFormat(target)
  const { allowed, rule } = TARGET_STATUS[type]
  requireStatus(target, allowed, rule)
}
