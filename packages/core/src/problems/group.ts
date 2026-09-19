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
 * Back-references, the default Status. Whatever the consistency rules then find between it
 * and other ADRs says nothing about the log — one broken file must not drown the view.
 */
export function groupProblems(log: {
  readonly adrs: readonly Adr[]
  readonly problems: readonly Problem[]
}): ProblemGroup[] {
  const unreadable = log.adrs.filter((adr) => !adr.metadataWritable).map((adr) => adr.id)
  const byId = new Map(log.adrs.map((adr) => [adr.id, adr]))

  const causeOf = (problem: Problem): string | undefined => {
    switch (problem.kind) {
      case 'missing-back-reference':
      case 'not-marked-superseded':
        // Reported on an ADR whose Back-references and Status could not be read.
        return unreadable.find((id) => id === problem.adr)
      case 'unfounded-back-reference':
        // The Relation behind the Back-reference may well be there, in a file that cannot be read.
        return unreadable.find((id) => id === problem.source)
      case 'superseded-without-successor': {
        const named = byId.get(problem.adr)?.metadata.backReferences['superseded-by'] ?? []
        return unreadable.find((id) => named.includes(id))
      }
      default:
        return undefined
    }
  }

  const groups = log.problems.map((problem) => ({ problem, consequences: [] as Problem[] }))
  const roots = new Map(
    groups.flatMap((group) =>
      group.problem.kind === 'invalid-frontmatter' ||
      group.problem.kind === 'unterminated-frontmatter'
        ? [[group.problem.adr, group] as const]
        : []
    )
  )
  return groups.filter((group) => {
    const cause = causeOf(group.problem)
    const root = cause === undefined ? undefined : roots.get(cause)
    root?.consequences.push(group.problem)
    return root === undefined
  })
}
