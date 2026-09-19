import type { Adr } from '../adr/adr'
import type { Plan } from '../change/change-set'
import type { FileSystem } from '../fs/port'
import type { DecisionLog } from '../log/load'
import { addToList, setScalar } from '../metadata/write'
import type { Status } from '../status'
import { Refusal, plan } from './draft'

export interface Today {
  /** The date to record, `YYYY-MM-DD`, in the user's own time zone. */
  readonly today: string
}

/**
 * Accept a `proposed` ADR. This is also the moment its `supersedes` and `amends` Relations
 * take effect: every ADR it supersedes becomes `superseded`, and every target gets its
 * Back-reference (docs/file-format.md, section 5).
 */
export function planAccept(
  fs: FileSystem,
  log: DecisionLog,
  id: string,
  when: Today
): Promise<Plan> {
  return plan(fs, async (drafts) => {
    const adr = writable(log, id)
    requireStatus(adr, ['proposed'], 'Only a proposed ADR can be accepted.')

    const superseded = adr.metadata.relations.supersedes.map((target) => {
      const old = writable(log, target, `${id} supersedes ${target}`)
      requireStatus(
        old,
        ['accepted', 'deprecated'],
        'Only an accepted or deprecated ADR can be superseded.'
      )
      return old
    })
    const amended = adr.metadata.relations.amends.map((target) => {
      const base = writable(log, target, `${id} amends ${target}`)
      requireStatus(base, ['accepted'], 'Only an accepted ADR can be amended.')
      return base
    })

    await drafts.write(adr.path, (view) => setScalar(view, 'status', 'accepted'))
    await drafts.write(adr.path, (view) => setScalar(view, 'decided', date(when)))
    for (const old of superseded) {
      await drafts.write(old.path, (view) => setScalar(view, 'status', 'superseded'))
      await drafts.write(old.path, (view) => addToList(view, 'superseded-by', id))
    }
    for (const base of amended) {
      await drafts.write(base.path, (view) => addToList(view, 'amended-by', id))
    }
  })
}

/** Reject a `proposed` ADR. Its Relations never take effect; nothing else is written. */
export function planReject(
  fs: FileSystem,
  log: DecisionLog,
  id: string,
  when: Today
): Promise<Plan> {
  return plan(fs, async (drafts) => {
    const adr = writable(log, id)
    requireStatus(adr, ['proposed'], 'Only a proposed ADR can be rejected.')
    await drafts.write(adr.path, (view) => setScalar(view, 'status', 'rejected'))
    await drafts.write(adr.path, (view) => setScalar(view, 'decided', date(when)))
  })
}

/** Deprecate an `accepted` ADR: the decision no longer applies, and nothing takes its place. */
export function planDeprecate(fs: FileSystem, log: DecisionLog, id: string): Promise<Plan> {
  return plan(fs, async (drafts) => {
    const adr = writable(log, id)
    requireStatus(adr, ['accepted'], 'Only an accepted ADR can be deprecated.')
    await drafts.write(adr.path, (view) => setScalar(view, 'status', 'deprecated'))
  })
}

/** The ADR `id` of the log, if the tool may write its Metadata. `because` says who is asking for it. */
function writable(log: DecisionLog, id: string, because?: string): Adr {
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

function requireStatus(adr: Adr, allowed: readonly Status[], rule: string): void {
  const status = adr.metadata.status
  if (status !== undefined && allowed.includes(status)) return
  const is = adr.metadata.rawStatus ? `"${adr.metadata.rawStatus}"` : status
  throw new Refusal(`${rule} ${adr.id} is ${is}.`)
}

function date(when: Today): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(when.today)) throw new TypeError(`Not a date: ${when.today}`)
  return when.today
}
