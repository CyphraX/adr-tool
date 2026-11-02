import {
  describeCause,
  describeProblem,
  groupProblems,
  locateProblem,
  openRepository,
  type DecisionLog,
  type FileSystem,
  type Problem,
  type ProblemCode
} from '@adr-tool/core'
import { DECLARATION_PATH, everyComponent, readDeclaration } from '@adr-tool/structure/model'

/** A Problem as the command reports it (docs/cli.md). */
export interface LintedProblem {
  readonly code: ProblemCode
  readonly message: string
  readonly path: string
  readonly line?: number
  /** The Decision Log it is reported on; none for a Problem of the repository as a whole. */
  readonly log?: string
  readonly problem: Problem
}

/** A root cause, with the Problems that are only reported because of it. */
export interface LintedGroup extends LintedProblem {
  /** Why the consequences are reported: they go away with this Problem. */
  readonly lead?: string
  readonly consequences: readonly LintedProblem[]
}

export interface LintReport {
  /** The Decision Logs that were checked, by their directories. */
  readonly logs: readonly string[]
  readonly problems: readonly LintedGroup[]
}

/**
 * Check the Decision Logs of the repository behind `fs`, as the app does: its Traces against
 * the Components `.arch/components.yml` declares, when it declares some that can be read.
 * `undefined` when the repository has no Decision Log to check.
 */
export async function lint(fs: FileSystem): Promise<LintReport | undefined> {
  const declaration = readDeclaration(await fs.readText(DECLARATION_PATH))
  const components =
    declaration.kind === 'declared'
      ? everyComponent(declaration.components).map((component) => component.id)
      : undefined
  const repository = await openRepository(fs, components ? { components } : {})
  if (repository.discoveredBy === 'none') return undefined

  const report = async (problem: Problem, log?: DecisionLog): Promise<LintedProblem> => {
    const { path, line } = await locateProblem(fs, problem, log)
    return {
      code: problem.kind,
      message: describeProblem(problem),
      path,
      ...(line !== undefined && { line }),
      ...(log && { log: log.path }),
      problem
    }
  }

  const problems: LintedGroup[] = []
  for (const problem of repository.problems) {
    problems.push({ ...(await report(problem)), consequences: [] })
  }
  for (const log of repository.logs) {
    for (const group of groupProblems(log)) {
      const consequences = await Promise.all(group.consequences.map((one) => report(one, log)))
      problems.push({
        ...(await report(group.problem, log)),
        ...(consequences.length > 0 && { lead: describeCause(group.problem) }),
        consequences
      })
    }
  }
  return { logs: repository.logs.map((log) => log.path), problems }
}
