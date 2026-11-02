import type { Adr } from '../adr/adr'
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
  /** The Status as the branch writes it, when it is none of the five values. */
  readonly rawStatus?: string
  /**
   * `added`: the working tree has no ADR of this ID in the log. `status`: it has one, with
   * another Status than the branch gives it.
   */
  readonly change: 'added' | 'status'
  /** The Status the working tree has, with `status`. */
  readonly statusHere?: Status
  /** That Status as the working tree writes it, when it is none of the five values. */
  readonly rawStatusHere?: string
  /**
   * The ADRs of the working tree's log with the same number and another ID: the number is
   * taken twice, and whichever of them is merged second has to be renumbered.
   */
  readonly sameNumber: readonly string[]
}

/**
 * What a branch is compared against: the repository as the branch and the working tree last
 * had it in common, their merge base. `unrelated`: they have no commit in common, and the
 * branch is compared with the working tree alone. `unknown`: they may have one that could not
 * be read — a shallow clone ends before it — and who changed a Status cannot be told.
 */
export type MergeBase = Repository | 'unrelated' | 'unknown'

type Read = Pick<Adr, 'id' | 'number' | 'metadata'>

/** Whether two ADRs have the same Status, as written when it is none of the five values. */
const sameStatus = (one: Read, other: Read): boolean =>
  one.metadata.status === other.metadata.status &&
  one.metadata.rawStatus === other.metadata.rawStatus

/**
 * What a branch did to the ADRs that the working tree does not have yet. What the branch has
 * and the merge base has not is the branch's doing, and not something the working tree
 * removed or renamed since. An ADR renamed on either side is the same ADR: a rename keeps its
 * number. Without a merge base that can be read, only the ADRs the working tree does not have
 * are listed.
 */
export function branchChanges(branch: Repository, here: Repository, base: MergeBase): BranchAdr[] {
  const changes: BranchAdr[] = []
  for (const log of branch.logs) {
    const hereLog = here.logs.find((candidate) => candidate.path === log.path)
    const baseLog =
      typeof base === 'string'
        ? undefined
        : base.logs.find((candidate) => candidate.path === log.path)
    const onBranch = new Set(log.adrs.map((adr) => adr.id))
    const inBase = new Set(baseLog?.adrs.map((adr) => adr.id))
    const numbered = (
      adrs: readonly Read[] | undefined,
      number: number | undefined,
      unless: Set<string>
    ): Read | undefined =>
      number === undefined
        ? undefined
        : adrs?.find((candidate) => candidate.number === number && !unless.has(candidate.id))

    for (const adr of log.adrs) {
      // What it was at the merge base: the same ID, or its number under an ID the branch no
      // longer has, which the branch renamed.
      const origin =
        baseLog?.adrs.find((candidate) => candidate.id === adr.id) ??
        numbered(baseLog?.adrs, adr.number, onBranch)
      // The branch left its Status as it was.
      if (origin && sameStatus(origin, adr)) continue
      // What the working tree has of it: the same ID, the merge base's, or its number under an
      // ID the merge base does not have, which the working tree renamed.
      const now =
        hereLog?.adrs.find((candidate) => candidate.id === adr.id) ??
        (origin && hereLog?.adrs.find((candidate) => candidate.id === origin.id)) ??
        (origin && numbered(hereLog?.adrs, adr.number, inBase))
      // The working tree has it already, as the branch has it.
      if (now && sameStatus(now, adr)) continue
      const change = now || origin ? 'status' : 'added'
      // Who changed the Status cannot be told without the merge base.
      if (base === 'unknown' && change === 'status') continue

      const sameNumber =
        adr.number === undefined || change !== 'added'
          ? []
          : (hereLog?.adrs ?? [])
              .filter((other) => other.number === adr.number && other.id !== adr.id)
              .map((other) => other.id)
      const { status, rawStatus } = adr.metadata
      const statusHere = now?.metadata.status
      const rawStatusHere = now?.metadata.rawStatus
      changes.push({
        log: log.path,
        id: adr.id,
        path: adr.path,
        ...(adr.number !== undefined && { number: adr.number }),
        ...(adr.title !== undefined && { title: adr.title }),
        ...(status !== undefined && { status }),
        ...(rawStatus !== undefined && { rawStatus }),
        change,
        ...(statusHere !== undefined && { statusHere }),
        ...(rawStatusHere !== undefined && { rawStatusHere }),
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
