import type { Adr } from '../adr/adr'
import type { DecisionLog } from '../log/load'
import type { Status } from '../status'
import { Refusal } from './draft'

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
  return adr
}

export function requireStatus(adr: Adr, allowed: readonly Status[], rule: string): void {
  const status = adr.metadata.status
  if (status !== undefined && allowed.includes(status)) return
  const is = adr.metadata.rawStatus ? `"${adr.metadata.rawStatus}"` : status
  throw new Refusal(`${rule} ${adr.id} is ${is}.`)
}

const TARGET_STATUS: Record<'supersedes' | 'amends', { allowed: Status[]; rule: string }> = {
  supersedes: {
    allowed: ['accepted', 'deprecated'],
    rule: 'Only an accepted or deprecated ADR can be superseded.'
  },
  amends: { allowed: ['accepted'], rule: 'Only an accepted ADR can be amended.' }
}

/** Supersede targets an ADR that is accepted or deprecated, Amend one that is accepted (docs/file-format.md, section 5). */
export function requireTarget(type: 'supersedes' | 'amends', target: Adr): void {
  const { allowed, rule } = TARGET_STATUS[type]
  requireStatus(target, allowed, rule)
}
