import {
  groupProblems,
  outsideReference,
  type Adr,
  type DecisionLog,
  type Problem,
  type ProblemGroup
} from '@adr-tool/core'
import type { OpenRepository } from '../../../shared/ipc'
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

/** Every Relation that leads out of its repository, in the order of the tabs and the files. */
export function outsideRelations(repositories: readonly OpenRepository[]): OutsideRelation[] {
  const relations: OutsideRelation[] = []
  for (const repository of repositories) {
    for (const log of repository.repository.logs) {
      for (const adr of log.adrs) {
        for (const type of OUTSIDE_TYPES) {
          for (const written of adr.metadata.relations[type]) {
            const reference = outsideReference(written)
            if (!reference) continue
            const other = byName(repositories, reference.repository)
            const otherLog = other?.repository.logs.find((one) => one.path === reference.log)
            const target = otherLog?.adrs.find((one) => one.id === reference.id)
            relations.push({
              type,
              written,
              from: placed(repository, log, adr),
              to: other && otherLog && target ? placed(other, otherLog, target) : undefined
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

/** The Problems of one open repository, by Decision Log, each root cause once. */
export interface RepositoryProblems {
  readonly repositoryId: string
  readonly repository: string
  /** Problems of the repository as a whole: its configuration, a missing directory. */
  readonly own: readonly Problem[]
  readonly logs: readonly { readonly log: string; readonly groups: readonly ProblemGroup[] }[]
  /** As the sidebar counts them: each root cause once, and what the repository has itself. */
  readonly count: number
}

/** The Problems of every open repository, in the order of the tabs. */
export function problemsAcross(repositories: readonly OpenRepository[]): RepositoryProblems[] {
  return repositories.map((repository) => {
    const logs = repository.repository.logs.map((log) => ({
      log: log.path,
      groups: groupProblems(log)
    }))
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
