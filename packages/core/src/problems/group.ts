import type { Adr, GuestAdr } from '../adr/adr'
import { BACK_REFERENCE_KEYS, type RelationType } from '../relation'
import { normalReference, referenceTo } from '../relations/reference'
import type { BackReferenceKey, Problem } from './problem'

/** A Problem to show, and the Problems that are only there because of it. */
export interface ProblemGroup {
  readonly problem: Problem
  /**
   * What the tool reports only because it cannot read the frontmatter `problem` is about.
   * They go away with it; none of them is to be repaired on its own.
   */
  readonly consequences: readonly Problem[]
}

/**
 * The Problems of a Decision Log, each root cause with what follows from it.
 *
 * An ADR whose frontmatter cannot be read is read as if it had none: no Relations, no
 * Back-references, the default Status. An ADR whose Status is none of the five values keeps
 * what it says, but its Relations are void. Whatever the consistency rules then find between
 * it and other ADRs says nothing about the log — one broken file must not drown the view.
 * What they find that a valid Status would not change stays a Problem of its own.
 *
 * The root cause may be an ADR of another log of the repository. Its Problem is that log's;
 * here it heads what follows from it, named by its reference, and only when something does.
 */
export function groupProblems(log: {
  readonly path?: string
  readonly adrs: readonly Adr[]
  readonly guests?: readonly GuestAdr[]
  readonly problems: readonly Problem[]
}): ProblemGroup[] {
  const path = log.path ?? ''
  const groups = log.problems.map((problem) => ({ problem, consequences: [] as Problem[] }))
  const byId = new Map<string, Pick<Adr, 'metadata' | 'impliedSupersedes'>>(
    log.adrs.map((adr) => [adr.id, adr])
  )
  // The ADRs a root cause is reported on: those that cannot be read, and those whose Status
  // cannot. An ADR has at most one of the two.
  const roots = new Map(
    groups.flatMap((group) => {
      const root = rootOf(log, group.problem)
      return root === undefined ? [] : [[root, group] as const]
    })
  )
  const fromGuests: ProblemGroup[] = []
  /** How a guest names an ADR of this log. */
  const seenFrom = new Map<string, string>()
  for (const guest of log.guests ?? []) {
    if (!guest.root || !('adr' in guest.root)) continue
    const group = { problem: { ...guest.root, adr: guest.reference }, consequences: [] }
    roots.set(guest.reference, group)
    byId.set(guest.reference, guest)
    seenFrom.set(guest.reference, guest.log)
    fromGuests.push(group)
  }
  const unreadable = (adr: string): boolean => {
    const root = roots.get(adr)?.problem
    return root !== undefined && unreadableFrontmatter(root)
  }
  /**
   * Whether `source` is a root cause that `problem`, about its Relation of `type` to `target`,
   * follows from: its Relations are unknown, or it carries that one, voided by its Status.
   */
  const voids = (source: string, type: RelationType, target: string): boolean => {
    if (!roots.has(source)) return false
    const adr = byId.get(source)
    const from = seenFrom.get(source)
    const named = from === undefined ? target : referenceTo(from, path, target)
    return unreadable(source) || (adr !== undefined && carries(adr, type, named))
  }

  const causeOf = (problem: Problem): string | undefined => {
    switch (problem.kind) {
      case 'missing-back-reference':
        // Reported on an ADR whose Back-references could not be read.
        return unreadable(problem.adr) ? problem.adr : undefined
      case 'not-marked-superseded':
        // Reported on an ADR whose Status could not be read.
        return roots.has(problem.adr) ? problem.adr : undefined
      case 'unfounded-back-reference': {
        // The Relation behind the Back-reference may well be there, in a file that cannot be
        // read, or in one whose Status voids it.
        const type = relationOf(problem.key)
        return voids(problem.source, type, problem.adr) ? problem.source : undefined
      }
      case 'superseded-without-successor': {
        // A successor that may supersede it: one that cannot be read and is named as the
        // successor, or one that does supersede it and whose Status voids that.
        const adr = byId.get(problem.adr)
        const named = (adr?.metadata.backReferences['superseded-by'] ?? []).map((written) =>
          normalReference(path, written)
        )
        return (
          named.find((id) => unreadable(id)) ??
          [...roots.keys()].find((id) => voids(id, 'supersedes', problem.adr) && !unreadable(id))
        )
      }
      default:
        return undefined
    }
  }

  const shown: ProblemGroup[] = []
  for (const group of groups) {
    const cause = causeOf(group.problem)
    if (cause === undefined) shown.push(group)
    else roots.get(cause)!.consequences.push(group.problem)
  }
  return [...shown, ...fromGuests.filter((group) => group.consequences.length > 0)]
}

/** Whether `adr` itself names `target` in its Relations of `type`, or another file says so. */
export function carries(
  adr: Pick<Adr, 'metadata' | 'impliedSupersedes'>,
  type: RelationType,
  target: string
): boolean {
  const implied = type === 'supersedes' ? (adr.impliedSupersedes ?? []) : []
  return adr.metadata.relations[type].includes(target) || implied.includes(target)
}

const relationOf = (key: BackReferenceKey): RelationType =>
  (Object.keys(BACK_REFERENCE_KEYS) as RelationType[]).find(
    (type) => BACK_REFERENCE_KEYS[type as keyof typeof BACK_REFERENCE_KEYS] === key
  )!

/** Whether `problem` is the one that says a frontmatter cannot be read. */
export const unreadableFrontmatter = (problem: Problem): boolean =>
  problem.kind === 'invalid-frontmatter' || problem.kind === 'unterminated-frontmatter'

/**
 * The ADR of `log` whose Relations `problem` voids: one whose frontmatter cannot be read, or
 * whose Status is none of the five values. A Status that is written in the wrong form but
 * read as one of them — the default when it is no single value — voids nothing.
 */
export function rootOf(
  log: { readonly adrs: readonly Adr[] },
  problem: Problem
): string | undefined {
  if (unreadableFrontmatter(problem)) return 'adr' in problem ? problem.adr : undefined
  if (problem.kind !== 'invalid-metadata' || problem.key !== 'status') return undefined
  const adr = log.adrs.find((one) => one.id === problem.adr)
  return adr && adr.metadata.status === undefined ? adr.id : undefined
}
