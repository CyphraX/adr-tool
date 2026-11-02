import type { Adr } from '../adr/adr'
import type { Problem } from './problem'

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
 */
export function groupProblems(log: {
  readonly adrs: readonly Adr[]
  readonly problems: readonly Problem[]
}): ProblemGroup[] {
  const groups = log.problems.map((problem) => ({ problem, consequences: [] as Problem[] }))
  // The ADRs a root cause is reported on: those that cannot be read, and those whose Status
  // cannot. An ADR has at most one of the two.
  const roots = new Map(
    groups.flatMap((group) => {
      const root = rootOf(group.problem)
      return root === undefined ? [] : [[root, group] as const]
    })
  )
  const byId = new Map(log.adrs.map((adr) => [adr.id, adr]))

  const causeOf = (problem: Problem): string | undefined => {
    switch (problem.kind) {
      case 'missing-back-reference':
        // Reported on an ADR whose Back-references could not be read.
        return unreadable(problem.adr) ? problem.adr : undefined
      case 'not-marked-superseded':
        // Reported on an ADR whose Status could not be read.
        return roots.has(problem.adr) ? problem.adr : undefined
      case 'unfounded-back-reference':
        // The Relation behind the Back-reference may well be there, in a file that cannot be read.
        return roots.has(problem.source) ? problem.source : undefined
      case 'superseded-without-successor': {
        const named = byId.get(problem.adr)?.metadata.backReferences['superseded-by'] ?? []
        return named.find((id) => roots.has(id))
      }
      default:
        return undefined
    }
  }

  const unreadable = (adr: string): boolean => {
    const kind = roots.get(adr)?.problem.kind
    return kind === 'invalid-frontmatter' || kind === 'unterminated-frontmatter'
  }

  const shown: ProblemGroup[] = []
  for (const group of groups) {
    const cause = causeOf(group.problem)
    if (cause === undefined) shown.push(group)
    else roots.get(cause)!.consequences.push(group.problem)
  }
  return shown
}

/**
 * The ADR whose Relations `problem` voids: one whose frontmatter cannot be read, or whose
 * Status is none of the five values.
 */
export function rootOf(problem: Problem): string | undefined {
  switch (problem.kind) {
    case 'invalid-frontmatter':
    case 'unterminated-frontmatter':
      return problem.adr
    case 'invalid-metadata':
      return problem.key === 'status' ? problem.adr : undefined
    default:
      return undefined
  }
}
