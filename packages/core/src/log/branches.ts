import type { Status } from '../status'
import type { Repository } from './load'

/**
 * An ADR as a branch that is not checked out has it, where the branch did something to it
 * that the working tree does not have yet: it added the ADR, or gave it another Status.
 */
export interface BranchAdr {
  /** The directory of its Decision Log. */
  readonly log: string
  readonly id: string
  readonly path: string
  readonly number?: number
  readonly title?: string
  readonly status?: Status
  /**
   * `added`: the working tree has no ADR of this ID in the log. `status`: it has one, with
   * another Status than the branch gives it.
   */
  readonly change: 'added' | 'status'
  /** The Status the working tree has, with `status`. */
  readonly statusHere?: Status
  /**
   * The ADRs of the working tree's log with the same number and another ID: the number is
   * taken twice, and whichever of them is merged second has to be renumbered.
   */
  readonly sameNumber: readonly string[]
}

/**
 * What a branch did to the ADRs that the working tree does not have yet. `base` is the
 * repository as the branch and the working tree last had it in common, their merge base:
 * what the branch has and the base has not is the branch's doing, and not something the
 * working tree removed or renamed since. Without a merge base, the branch is compared with
 * the working tree alone.
 */
export function branchChanges(
  branch: Repository,
  here: Repository,
  base: Repository | undefined
): BranchAdr[] {
  const changes: BranchAdr[] = []
  for (const log of branch.logs) {
    const hereLog = here.logs.find((candidate) => candidate.path === log.path)
    const before = base ? base.logs.find((candidate) => candidate.path === log.path) : hereLog
    for (const adr of log.adrs) {
      const status = adr.metadata.status
      const was = before?.adrs.find((candidate) => candidate.id === adr.id)
      // The branch left it as it was.
      if (was && was.metadata.status === status) continue
      const now = hereLog?.adrs.find((candidate) => candidate.id === adr.id)
      // The working tree has it already, as the branch has it.
      if (now && now.metadata.status === status) continue

      const sameNumber =
        adr.number === undefined || now
          ? []
          : (hereLog?.adrs ?? [])
              .filter((other) => other.number === adr.number && other.id !== adr.id)
              .map((other) => other.id)
      const statusHere = now?.metadata.status
      changes.push({
        log: log.path,
        id: adr.id,
        path: adr.path,
        ...(adr.number !== undefined && { number: adr.number }),
        ...(adr.title !== undefined && { title: adr.title }),
        ...(status !== undefined && { status }),
        change: now ? 'status' : 'added',
        ...(statusHere !== undefined && { statusHere }),
        sameNumber
      })
    }
  }
  return changes
}

/** An ADR on another branch that has a number a new ADR of the working tree would take too. */
export interface TakenNumber {
  readonly branch: string
  readonly id: string
}

/**
 * The ADRs that other branches add to a log under a number, and that the working tree does
 * not have: where an ADR `id` with that number would be the second one once they are merged.
 */
export function numberTakenOn(
  branches: readonly { readonly name: string; readonly adrs: readonly BranchAdr[] }[],
  log: string,
  id: string,
  number: number
): TakenNumber[] {
  return branches.flatMap(({ name, adrs }) =>
    adrs
      .filter(
        (adr) => adr.change === 'added' && adr.log === log && adr.number === number && adr.id !== id
      )
      .map((adr) => ({ branch: name, id: adr.id }))
  )
}
