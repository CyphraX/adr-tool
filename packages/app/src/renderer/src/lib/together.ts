import {
  groupProblems,
  outsideReference,
  outsideTo,
  type Adr,
  type DecisionLog,
  type Problem
} from '@adr-tool/core'
import type { OpenRepository } from '../../../shared/ipc'
import { adrsOf } from './problems'
import { namedIn } from './references'
import { searchLogs, type LogHit } from './search'

/**
 * The repositories open in the window, seen together (docs/plan-roadmap.md, part 13): one
 * search, one list and one Problems view across them, and the Relations that lead from an
 * ADR of one to an ADR of another (docs/file-format.md, section 3). Nothing here reads or
 * writes: it is worked out from what the window holds already.
 */

/** An ADR where it is: in which repository, in which Decision Log. */
export interface Placed {
  readonly repositoryId: string
  /** The name of the repository: how another one names it in a Relation. */
  readonly repository: string
  readonly log: string
  readonly adr: Adr
}

/** The Relations that may lead into another repository. */
export const OUTSIDE_TYPES = ['depends-on', 'relates-to'] as const
export type OutsideType = (typeof OUTSIDE_TYPES)[number]

/** A Relation of an ADR to an ADR of another repository. */
export interface OutsideRelation {
  readonly type: OutsideType
  readonly from: Placed
  /** The reference as the file writes it: `<name>:<log>/<ID>`. */
  readonly written: string
  /** The ADR it names — when a repository of that name is open and has it. */
  readonly to: Placed | undefined
}

const placed = (repository: OpenRepository, log: DecisionLog, adr: Adr): Placed => ({
  repositoryId: repository.id,
  repository: repository.name,
  log: log.path,
  adr
})

/** Whether `one` is the ADR `id` of the log `log` of the repository `repositoryId`. */
const isAt = (one: Placed, repositoryId: string, log: string, id: string): boolean =>
  one.repositoryId === repositoryId && one.log === log && one.adr.id === id

/**
 * The repository a name leads to among those that are open: the first that has it, in the
 * order of the tabs, when two share one.
 */
function byName(repositories: readonly OpenRepository[], name: string): OpenRepository | undefined {
  return repositories.find((repository) => repository.name === name)
}

/**
 * The ADR a reference to another repository names, `<name>:<log>/<ID>`, when a repository of
 * that name is open and has it; `undefined` for anything else.
 */
export function outsideTarget(
  repositories: readonly OpenRepository[],
  written: string
): Placed | undefined {
  const reference = outsideReference(written)
  if (!reference) return undefined
  const other = byName(repositories, reference.repository)
  const otherLog = other?.repository.logs.find((one) => one.path === reference.log)
  const target = otherLog?.adrs.find((one) => one.id === reference.id)
  return other && otherLog && target ? placed(other, otherLog, target) : undefined
}

/** An ADR of another open repository, with the reference a Relation to it writes. */
export interface OutsideCandidate extends Placed {
  /** `<name>:<log>/<ID>` (docs/file-format.md, section 3). */
  readonly id: string
}

/**
 * The ADRs of the other open repositories that an ADR of `from` can name in `depends-on` or
 * `relates-to`: those a reference by name leads to — not those of a repository that shares the
 * name of one before it, nor of one that shares the name of `from`.
 */
export function outsideCandidates(
  repositories: readonly OpenRepository[],
  from: string
): OutsideCandidate[] {
  const own = repositories.find((repository) => repository.id === from)
  return repositories
    .filter(
      (repository) =>
        repository.id !== from &&
        repository.name !== own?.name &&
        byName(repositories, repository.name) === repository
    )
    .flatMap((repository) =>
      repository.repository.logs.flatMap((log) =>
        log.adrs.map((adr) => ({
          ...placed(repository, log, adr),
          id: outsideTo(repository.name, log.path, adr.id)
        }))
      )
    )
}

/** Every Relation that leads out of its repository, in the order of the tabs and the files. */
export function outsideRelations(repositories: readonly OpenRepository[]): OutsideRelation[] {
  const relations: OutsideRelation[] = []
  for (const repository of repositories) {
    for (const log of repository.repository.logs) {
      for (const adr of log.adrs) {
        for (const type of OUTSIDE_TYPES) {
          for (const written of adr.metadata.relations[type]) {
            if (!outsideReference(written)) continue
            relations.push({
              type,
              written,
              from: placed(repository, log, adr),
              to: outsideTarget(repositories, written)
            })
          }
        }
      }
    }
  }
  return relations
}

/** The Relations of one ADR across repositories: those it carries, and those that lead to it. */
export function outsideOf(
  relations: readonly OutsideRelation[],
  repositoryId: string,
  log: string,
  id: string
): { outgoing: OutsideRelation[]; incoming: OutsideRelation[] } {
  return {
    outgoing: relations.filter((relation) => isAt(relation.from, repositoryId, log, id)),
    incoming: relations.filter(
      (relation) => relation.to !== undefined && isAt(relation.to, repositoryId, log, id)
    )
  }
}

/** A hit of the search across repositories. */
export interface PlacedHit extends LogHit {
  readonly repositoryId: string
  readonly repository: string
}

/**
 * The search over every Decision Log of every open repository, best first. Of hits that match
 * equally well, those of the repository in front come first, and in it those of the log in view.
 */
export function searchAll(
  repositories: readonly OpenRepository[],
  query: string,
  inFront?: { readonly repositoryId: string; readonly log?: string }
): PlacedHit[] {
  const ordered = [...repositories].sort(
    (a, b) => Number(b.id === inFront?.repositoryId) - Number(a.id === inFront?.repositoryId)
  )
  return ordered
    .flatMap((repository) =>
      searchLogs(
        repository.repository.logs,
        query,
        repository.id === inFront?.repositoryId ? inFront.log : undefined
      ).map((hit) => ({ ...hit, repositoryId: repository.id, repository: repository.name }))
    )
    .sort((a, b) => b.score - a.score)
}

/** Every ADR of every open repository: by tab, by log, the newest first as in the list. */
export function everyAdr(repositories: readonly OpenRepository[]): Placed[] {
  return repositories.flatMap((repository) =>
    repository.repository.logs.flatMap((log) =>
      log.adrs.toReversed().map((adr) => placed(repository, log, adr))
    )
  )
}

/** A Problem with the ADRs it is reported on, where they are. */
export interface PlacedProblem {
  readonly problem: Problem
  readonly subjects: readonly Placed[]
}

/** A root cause with what follows from it, as the Problems view of one log groups them. */
export interface PlacedGroup extends PlacedProblem {
  readonly consequences: readonly PlacedProblem[]
}

/** The Problems of one open repository, by Decision Log, each root cause once. */
export interface RepositoryProblems {
  readonly repositoryId: string
  readonly repository: string
  /** Problems of the repository as a whole: its configuration, a missing directory. */
  readonly own: readonly Problem[]
  /** The logs with Problems, in the order of the repository. */
  readonly logs: readonly { readonly log: string; readonly groups: readonly PlacedGroup[] }[]
  /** As the sidebar counts them: each root cause once, and what the repository has itself. */
  readonly count: number
}

/**
 * The ADRs a Problem of `log` is reported on, each in the log it belongs to: of this log, or —
 * a cycle through several logs — of another one of the same repository.
 */
function subjectsOf(repository: OpenRepository, log: DecisionLog, problem: Problem): Placed[] {
  return adrsOf(problem).flatMap((reference) => {
    const named = namedIn(log, reference)
    if (!named) return []
    const home =
      named.log === undefined
        ? log
        : repository.repository.logs.find((one) => one.path === named.log)
    const adr = home?.adrs.find((one) => one.id === named.adr.id)
    return home && adr ? [placed(repository, home, adr)] : []
  })
}

/** The Problems of every open repository, in the order of the tabs. */
export function problemsAcross(repositories: readonly OpenRepository[]): RepositoryProblems[] {
  return repositories.map((repository) => {
    const logs = repository.repository.logs
      .map((log) => ({
        log: log.path,
        groups: groupProblems(log).map(({ problem, consequences }) => ({
          problem,
          subjects: subjectsOf(repository, log, problem),
          consequences: consequences.map((consequence) => ({
            problem: consequence,
            subjects: subjectsOf(repository, log, consequence)
          }))
        }))
      }))
      .filter((log) => log.groups.length > 0)
    const own = repository.repository.problems
    return {
      repositoryId: repository.id,
      repository: repository.name,
      own,
      logs,
      count: own.length + logs.reduce((sum, log) => sum + log.groups.length, 0)
    }
  })
}
