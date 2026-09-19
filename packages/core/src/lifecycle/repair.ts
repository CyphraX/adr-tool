import type { Plan } from '../change/change-set'
import type { FileSystem } from '../fs/port'
import type { DecisionLog } from '../log/load'
import type { MetadataKey } from '../metadata/keys'
import { addToList, removeFromList, setScalar } from '../metadata/write'
import { groupProblems } from '../problems/group'
import type { BackReferenceKey, Problem } from '../problems/problem'
import { plan } from './draft'
import { planRenumber } from './renumber'
import { writable } from './rules'

/**
 * What repairs a Problem (docs/file-format.md, section 5, "Repairs"). Each one names the ADR
 * it writes to and the one thing it writes there.
 */
export type Repair =
  /** Write the Status as it is, in lowercase. */
  | { readonly kind: 'lowercase-status'; readonly adr: string }
  /** Take an item out of a list of IDs. */
  | {
      readonly kind: 'remove-item'
      readonly adr: string
      readonly key: MetadataKey
      readonly item: string
    }
  /** Add the Back-reference that a Relation in effect asks for. */
  | {
      readonly kind: 'add-back-reference'
      readonly adr: string
      readonly key: BackReferenceKey
      readonly item: string
    }
  /** `superseded` where a Relation in effect says so; back to `accepted` where none does. */
  | {
      readonly kind: 'set-status'
      readonly adr: string
      readonly status: 'superseded' | 'accepted'
    }
  /** Give the ADR the next number of its Decision Log. */
  | { readonly kind: 'renumber'; readonly adr: string }

/**
 * The repairs of a Problem. None: the tool cannot know what was meant, a person fixes the
 * file. Several: any one of them repairs the Problem, and the person says which.
 */
export function repairsOf(log: DecisionLog, problem: Problem): Repair[] {
  switch (problem.kind) {
    case 'status-not-lowercase':
      return [{ kind: 'lowercase-status', adr: problem.adr }]
    case 'unknown-target':
      return [{ kind: 'remove-item', adr: problem.adr, key: problem.key, item: problem.target }]
    case 'self-reference':
      return [{ kind: 'remove-item', adr: problem.adr, key: problem.key, item: problem.adr }]
    case 'missing-back-reference':
      return [
        { kind: 'add-back-reference', adr: problem.adr, key: problem.key, item: problem.source }
      ]
    case 'unfounded-back-reference':
      return [{ kind: 'remove-item', adr: problem.adr, key: problem.key, item: problem.source }]
    case 'not-marked-superseded':
      return [{ kind: 'set-status', adr: problem.adr, status: 'superseded' }]
    case 'superseded-without-successor':
      return [{ kind: 'set-status', adr: problem.adr, status: 'accepted' }]
    case 'supersedes-cycle':
      // Every Relation that keeps the circle closed; taking out any one of them opens it.
      return log.relations
        .filter(
          ({ type, from, to }) =>
            type === 'supersedes' && problem.adrs.includes(from) && problem.adrs.includes(to)
        )
        .map(({ from, to }) => ({ kind: 'remove-item', adr: from, key: 'supersedes', item: to }))
    case 'duplicate-number':
      return problem.adrs.map((adr) => ({ kind: 'renumber', adr }))
    default:
      return []
  }
}

const same = (a: Repair, b: Repair): boolean =>
  a.kind === b.kind &&
  a.adr === b.adr &&
  (['key', 'item', 'status'] as const).every(
    (field) => (a as Record<string, unknown>)[field] === (b as Record<string, unknown>)[field]
  )

/**
 * Plan a repair. It has to be one of the repairs of a Problem the log has right now, and
 * of a Problem that stands on its own: what only follows from a file that cannot be read
 * is not repaired, the file is.
 */
export async function planRepair(fs: FileSystem, log: DecisionLog, repair: Repair): Promise<Plan> {
  const offers = (problem: Problem): boolean =>
    repairsOf(log, problem).some((candidate) => same(candidate, repair))

  const groups = groupProblems(log)
  if (!groups.some(({ problem }) => offers(problem))) {
    const root = groups.find(({ consequences }) => consequences.some(offers))?.problem
    return {
      ok: false,
      reason:
        root && 'adr' in root
          ? `This is only reported because the frontmatter of ${root.adr} cannot be read. Fix that file first.`
          : 'This Problem is no longer there.'
    }
  }

  if (repair.kind === 'renumber') return planRenumber(fs, log, repair.adr)

  const planned = await plan(fs, async (drafts) => {
    const adr = writable(log, repair.adr)
    await drafts.write(adr.path, (view) => {
      switch (repair.kind) {
        case 'lowercase-status':
          return setScalar(view, 'status', adr.metadata.status!)
        case 'remove-item':
          return removeFromList(view, repair.key, repair.item)
        case 'add-back-reference':
          return addToList(view, repair.key, repair.item)
        case 'set-status':
          return setScalar(view, 'status', repair.status)
      }
    })
  })

  if (!planned.ok || repair.kind !== 'set-status' || repair.status !== 'accepted') return planned
  return {
    ...planned,
    warnings: [
      `${repair.adr} becomes accepted. If it had been deprecated before it was marked as superseded, deprecate it again afterwards.`
    ]
  }
}
