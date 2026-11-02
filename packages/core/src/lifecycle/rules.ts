import type { Adr, ForeignFormat, GuestAdr } from '../adr/adr'
import type { DecisionLog } from '../log/load'
import { isQualified, normalReference } from '../relations/reference'
import { refuse, type CoreSaid } from '../sentences'
import type { Status } from '../status'

/** The ADR `id` of the log, if the tool may write its Metadata. */
export function writable(log: DecisionLog, id: string): Adr {
  const adr = log.adrs.find((candidate) => candidate.id === id)
  if (!adr) refuse({ code: 'no-adr', values: { id } })
  if (!adr.metadataWritable) refuse({ code: 'frontmatter-unreadable', values: { adr: id } })
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
 * Relation, which may lie in another log. `asker` is the ADR whose Relation it is.
 */
export function writableTarget(
  log: DecisionLog,
  reference: string,
  asker: { readonly adr: string; readonly type: 'supersedes' | 'amends' }
): AnyAdr {
  const adr = named(log, reference)
  if (!adr) {
    const elsewhere = isQualified(normalReference(log.path, reference))
    refuse({
      code: elsewhere ? 'target-not-in-repository' : 'target-not-in-log',
      values: { ...asker, target: reference }
    })
  }
  if (!adr.metadataWritable) {
    refuse({ code: 'frontmatter-unreadable', values: { adr: nameOf(adr) } })
  }
  requireOwnFormat(adr)
  return adr
}

/** An ADR in a foreign format, as a refusal names it. */
type Foreign = { readonly adr: string; readonly format: ForeignFormat }

/** The tool reads a foreign format and never writes it (docs/file-format.md, section 8). */
export function requireOwnFormat(
  adr: Pick<AnyAdr, 'id' | 'foreign' | 'noMigrationSaid'> & Partial<Pick<GuestAdr, 'reference'>>,
  /** What to do about it, when the ADR can be migrated: migrate it first, unless this says more. */
  and: (foreign: Foreign) => CoreSaid = (values) => ({ code: 'foreign-format', values })
): void {
  if (!adr.foreign) return
  const foreign = { adr: adr.reference ?? adr.id, format: adr.foreign }
  refuse(
    adr.noMigrationSaid === undefined
      ? and(foreign)
      : { code: 'foreign-format-no-migration', values: { ...foreign, why: adr.noMigrationSaid } }
  )
}

/** What a Status allows, as the code of the refusal when it does not. */
export type StatusRule =
  | 'accept-needs-proposed'
  | 'reject-needs-proposed'
  | 'deprecate-needs-accepted'
  | 'supersede-needs-decided'
  | 'amend-needs-accepted'

export function requireStatus(
  adr: Named & Pick<Adr, 'metadata'>,
  allowed: readonly Status[],
  rule: StatusRule
): void {
  const status = adr.metadata.status
  if (status !== undefined && allowed.includes(status)) return
  refuse({ code: rule, values: { adr: nameOf(adr), is: statusAsWritten(adr) } })
}

/** The Status of an ADR as a sentence names it: one of the five values, or what is written, in quotes. */
export const statusAsWritten = (adr: Pick<Adr, 'metadata'>): string =>
  adr.metadata.rawStatus ? `"${adr.metadata.rawStatus}"` : String(adr.metadata.status)

const TARGET_STATUS: Record<'supersedes' | 'amends', { allowed: Status[]; rule: StatusRule }> = {
  supersedes: { allowed: ['accepted', 'deprecated'], rule: 'supersede-needs-decided' },
  amends: { allowed: ['accepted'], rule: 'amend-needs-accepted' }
}

/** Supersede targets an ADR that is accepted or deprecated, Amend one that is accepted (docs/file-format.md, section 5). */
export function requireTarget(type: 'supersedes' | 'amends', target: AnyAdr): void {
  // Accepting the Relation would write to the target: no use proposing what cannot be accepted.
  requireOwnFormat(target)
  const { allowed, rule } = TARGET_STATUS[type]
  requireStatus(target, allowed, rule)
}
