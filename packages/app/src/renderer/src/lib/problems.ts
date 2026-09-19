import type { Problem, ProblemGroup } from '@adr-tool/core'

/** The ADRs a Problem is reported on; none for a Problem of the repository as a whole. */
export function adrsOf(problem: Problem): readonly string[] {
  return 'adr' in problem ? [problem.adr] : 'adrs' in problem ? problem.adrs : []
}

/** A Problem as one ADR shows it. */
export interface ReportedProblem {
  problem: Problem
  /** The ADR whose unreadable frontmatter is the only reason this is reported. */
  cause?: string
}

/** The Problems reported on this ADR. What merely follows from another ADR's broken file says so. */
export function problemsOf(groups: readonly ProblemGroup[], id: string): ReportedProblem[] {
  return groups.flatMap(({ problem, consequences }) => {
    const [cause] = adrsOf(problem)
    return [
      ...(adrsOf(problem).includes(id) ? [{ problem }] : []),
      ...consequences
        .filter((consequence) => cause !== id && adrsOf(consequence).includes(id))
        .map((consequence) => ({ problem: consequence, ...(cause !== undefined && { cause }) }))
    ]
  })
}
