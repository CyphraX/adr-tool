import {
  describeCause,
  describeProblem,
  groupProblems,
  isQualified,
  parseReference,
  problemLocator,
  openRepository,
  type DecisionLog,
  type FileSystem,
  type Problem,
  type ProblemCode,
  type Repository
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
  /** What was not checked, and why: for standard error, not part of the result. */
  readonly notes: readonly string[]
}

/**
 * Check the Decision Logs of the repository behind `fs`, as the app does: its Traces against
 * the Components `.arch/components.yml` declares, when it declares some that can be read.
 * `undefined` when the repository has no Decision Log to check.
 */
export async function lint(fs: FileSystem): Promise<LintReport | undefined> {
  return (await lintRepository(fs)).report
}

/** `lint`, and the Decision Logs it read: what `adr check` tells Conformance about the ADRs. */
export async function lintRepository(
  fs: FileSystem
): Promise<{ readonly report: LintReport | undefined; readonly repository: Repository }> {
  const declaration = readDeclaration(await fs.readText(DECLARATION_PATH))
  const components =
    declaration.kind === 'declared'
      ? everyComponent(declaration.components).map((component) => component.id)
      : undefined
  const notes =
    declaration.kind === 'unreadable'
      ? [
          `${DECLARATION_PATH} cannot be read (${declaration.detail}), so the Traces in affects are not checked.`
        ]
      : []
  const repository = await openRepository(fs, components ? { components } : {})
  if (repository.discoveredBy === 'none') return { report: undefined, repository }

  const locate = problemLocator(fs)
  const report = async (problem: Problem, log?: DecisionLog): Promise<LintedProblem> => {
    const { path, line } = await locate(problem, log)
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
  // A root cause in one log may have consequences in another: they are listed under it, in
  // the log it is reported in, and it is counted once.
  const grouped = repository.logs.map((log) => ({ log, groups: groupProblems(log) }))
  const elsewhere = new Map<string, { problem: Problem; log: DecisionLog }[]>()
  const keyOf = (log: string, problem: Problem): string =>
    `${log}\0${problem.kind}\0${'adr' in problem ? problem.adr : ''}`
  for (const { log, groups } of grouped) {
    for (const group of groups) {
      if (!('adr' in group.problem) || !isQualified(group.problem.adr)) continue
      const root = parseReference(group.problem.adr)
      const key = keyOf(root.log!, { ...group.problem, adr: root.id })
      const list = elsewhere.get(key) ?? []
      elsewhere.set(key, [...list, ...group.consequences.map((problem) => ({ problem, log }))])
    }
  }
  for (const { log, groups } of grouped) {
    for (const group of groups) {
      if ('adr' in group.problem && isQualified(group.problem.adr)) continue
      const consequences = await Promise.all([
        ...group.consequences.map((one) => report(one, log)),
        ...(elsewhere.get(keyOf(log.path, group.problem)) ?? []).map((one) =>
          report(one.problem, one.log)
        )
      ])
      problems.push({
        ...(await report(group.problem, log)),
        ...(consequences.length > 0 && { lead: describeCause(group.problem) }),
        consequences
      })
    }
  }
  return { report: { logs: repository.logs.map((log) => log.path), problems, notes }, repository }
}
