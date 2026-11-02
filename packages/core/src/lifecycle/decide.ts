import type { Plan } from '../plan'
import type { FileSystem } from '@adr-tool/kernel'
import type { DecisionLog } from '../log/load'
import { addToList, setScalar } from '../metadata/write'
import { plan } from './pending'
import { referenceTo } from '../relations/reference'
import { logOf, requireStatus, requireTarget, writable, writableTarget } from './rules'

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
  return plan(fs, async (pending) => {
    const adr = writable(log, id)
    requireStatus(adr, ['proposed'], 'accept-needs-proposed')

    const superseded = adr.metadata.relations.supersedes.map((target) => {
      const old = writableTarget(log, target, { adr: id, type: 'supersedes' })
      requireTarget('supersedes', old)
      return old
    })
    const amended = adr.metadata.relations.amends.map((target) => {
      const base = writableTarget(log, target, { adr: id, type: 'amends' })
      requireTarget('amends', base)
      return base
    })

    await pending.write(adr.path, (view) => setScalar(view, 'status', 'accepted'))
    await pending.write(adr.path, (view) => setScalar(view, 'decided', date(when)))
    // A target in another log names this ADR with its log's directory.
    for (const old of superseded) {
      const self = referenceTo(logOf(log, old), log.path, id)
      await pending.write(old.path, (view) => setScalar(view, 'status', 'superseded'))
      await pending.write(old.path, (view) => addToList(view, 'superseded-by', self))
    }
    for (const base of amended) {
      const self = referenceTo(logOf(log, base), log.path, id)
      await pending.write(base.path, (view) => addToList(view, 'amended-by', self))
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
  return plan(fs, async (pending) => {
    const adr = writable(log, id)
    requireStatus(adr, ['proposed'], 'reject-needs-proposed')
    await pending.write(adr.path, (view) => setScalar(view, 'status', 'rejected'))
    await pending.write(adr.path, (view) => setScalar(view, 'decided', date(when)))
  })
}

/** Deprecate an `accepted` ADR: the decision no longer applies, and nothing takes its place. */
export function planDeprecate(fs: FileSystem, log: DecisionLog, id: string): Promise<Plan> {
  return plan(fs, async (pending) => {
    const adr = writable(log, id)
    requireStatus(adr, ['accepted'], 'deprecate-needs-accepted')
    await pending.write(adr.path, (view) => setScalar(view, 'status', 'deprecated'))
  })
}

function date(when: Today): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(when.today)) throw new TypeError(`Not a date: ${when.today}`)
  return when.today
}
