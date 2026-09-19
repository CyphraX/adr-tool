import type { Adr } from '../adr/adr'
import type { Plan } from '../change/change-set'
import type { FileSystem } from '../fs/port'
import type { DecisionLog } from '../log/load'
import type { MetadataKey } from '../metadata/keys'
import { addToList, removeFromList, setScalar } from '../metadata/write'
import { groupProblems } from '../problems/group'
import type { BackReferenceKey, Problem } from '../problems/problem'
import { BACK_REFERENCE_KEYS } from '../relation'
import { plan } from './draft'
import { planRenumber } from './renumber'
import { requireOwnFormat, writable } from './rules'

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
 * The Repairs of a Problem. None: the tool cannot know what was meant, a person fixes the
 * file. Several: any one of them is a step, and the person says which.
 */
export function repairsOf(log: DecisionLog, problem: Problem): Repair[] {
  // Renumber renames a file; every other Repair writes into one, and a file in a foreign
  // format is only written by Migration.
  const foreign = new Set(log.adrs.filter((adr) => adr.foreign).map((adr) => adr.id))
  return candidatesOf(log, problem).filter(
    (repair) => repair.kind === 'renumber' || !foreign.has(repair.adr)
  )
}

function candidatesOf(log: DecisionLog, problem: Problem): Repair[] {
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
    case 'not-marked-superseded': {
      // Only what may be superseded is marked so. A Status that is proposed, rejected or
      // unreadable has a story the tool does not know; a person sorts that out first.
      const status = log.adrs.find((adr) => adr.id === problem.adr)?.metadata.status
      return status === 'accepted' || status === 'deprecated'
        ? [{ kind: 'set-status', adr: problem.adr, status: 'superseded' }]
        : []
    }
    case 'superseded-without-successor':
      return [{ kind: 'set-status', adr: problem.adr, status: 'accepted' }]
    case 'supersedes-cycle':
      // Every Relation between the ADRs of the group. Taking one out opens a circle; where
      // several circles share ADRs, what is left of them is reported again.
      // Only a Relation that is written in the file of its ADR can be taken out of it.
      return log.relations
        .filter(
          ({ type, from, to }) =>
            type === 'supersedes' &&
            problem.adrs.includes(from) &&
            problem.adrs.includes(to) &&
            log.adrs.find((adr) => adr.id === from)?.metadata.relations.supersedes.includes(to)
        )
        .map(({ from, to }) => ({ kind: 'remove-item', adr: from, key: 'supersedes', item: to }))
    case 'duplicate-number':
      return problem.adrs.map((adr) => ({ kind: 'renumber', adr }))
    default:
      return []
  }
}

const same = (a: Repair, b: Repair): boolean => {
  const [left, right] = [a, b] as Record<string, unknown>[]
  return Object.keys({ ...left, ...right }).every((field) => left![field] === right![field])
}

/**
 * Plan a Repair. It has to be one of the Repairs of a Problem the log has right now, and
 * of a Problem that stands on its own: what only follows from a file that cannot be read
 * is not repaired, the file is. What is planned is the Repair as `core` offers it, never
 * the object that was handed in.
 */
export async function planRepair(fs: FileSystem, log: DecisionLog, asked: Repair): Promise<Plan> {
  const offered = (problem: Problem): Repair | undefined =>
    repairsOf(log, problem).find((candidate) => same(candidate, asked))

  const groups = groupProblems(log)
  const repair = groups.map(({ problem }) => offered(problem)).find(Boolean)
  if (!repair) {
    // The Problem is there, and what repairs it is known: it is the file that is not the tool's to write.
    const foreign = log.adrs.find((adr) => adr.foreign && adr.id === asked.adr)
    const withheld = log.problems.some((problem) =>
      candidatesOf(log, problem).some((candidate) => same(candidate, asked))
    )
    if (foreign && withheld) return plan(fs, async () => requireOwnFormat(foreign))
    const root = groups.find(({ consequences }) => consequences.some(offered))?.problem
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
  const warnings = premiseOf(log, repair)
  return planned.ok && warnings.length > 0 ? { ...planned, warnings } : planned
}

/**
 * What a Repair rests on, where that is another ADR's word: taking a Back-reference out, or
 * the `superseded` Status back, is only right if the other ADR is right. The preview says
 * what the other ADR says, so that a successor that needs fixing is not mistaken for a
 * stale Back-reference.
 */
function premiseOf(log: DecisionLog, repair: Repair): string[] {
  if (repair.kind === 'set-status' && repair.status === 'accepted') {
    return [
      `${repair.adr} becomes accepted. If it had been deprecated before it was marked as superseded, deprecate it again afterwards.`
    ]
  }
  if (repair.kind !== 'remove-item') return []
  const type = (Object.keys(BACK_REFERENCE_KEYS) as (keyof typeof BACK_REFERENCE_KEYS)[]).find(
    (relation) => BACK_REFERENCE_KEYS[relation] === repair.key
  )
  const source: Adr | undefined = log.adrs.find((adr) => adr.id === repair.item)
  if (!type || !source || source.id === repair.adr) return []

  const { status, rawStatus, relations } = source.metadata
  if (status === undefined) {
    return [
      `The Status of ${source.id} cannot be read ("${rawStatus}"). If that ADR has been accepted, cancel and fix its Status instead: the Back-reference is right then.`
    ]
  }
  if (!relations[type].includes(repair.adr)) {
    return [
      `${source.id} does not name ${repair.adr} in ${type}. If it should, cancel and add it to ${source.id} by hand: the Back-reference is right then.`
    ]
  }
  if (status === 'proposed') {
    return [
      `${source.id} is still proposed. When it is accepted, the Back-reference is written again.`
    ]
  }
  return status === 'rejected'
    ? [`${source.id} was rejected: its Relations never take effect.`]
    : []
}
