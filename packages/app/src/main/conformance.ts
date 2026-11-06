/**
 * The Conformance module's side of the open repositories (docs/plan-vision.md, part 4): the
 * Rules of `.arch/rules.yml`, read afresh, checked on the analysis Structure keeps, through
 * the composition `adr check` and the MCP server use — so that the three say the same of the
 * same files —, and the plans that write the file.
 */
import { conformanceOf, decisionsOf } from '@adr-tool/cli/conformance'
import {
  fingerprintKey,
  fingerprintOf,
  needsModel,
  planAddException,
  planAddRule,
  planChangeRule,
  planRemoveRule,
  readRules,
  RULES_PATH,
  type ExceptionDraft
} from '@adr-tool/conformance'
import { openRepository, type FileSystem, type Plan } from '@adr-tool/core'
import type { ConformanceView, RuleRequest } from '../shared/ipc'
import type { Analysis } from './analysis'
import { declaredComponents } from './traces'

/** The Rules checked against an analysis, with the Decision Logs as they are on disk now. */
export async function conformanceView(
  repositoryId: string,
  fs: FileSystem,
  analysis: Analysis,
  when: Pick<ConformanceView, 'current' | 'analysedAt'>
): Promise<ConformanceView> {
  const [text, repository] = await Promise.all([fs.readText(RULES_PATH), openRepository(fs)])
  const file = readRules(text)
  const { structure, dependencies } = analysis
  const model = needsModel(file, structure) ? dependencies : undefined
  const report = conformanceOf(file, structure, model, repository)
  const ownerOf = new Map(structure.sourceFiles.map((one) => [one.path, one.component]))
  const violations = report.violations.map((violation) => ({
    key: fingerprintKey(violation.fingerprint),
    rule: violation.rule.id,
    kind: violation.rule.kind,
    fingerprint: violation.fingerprint,
    said: violation.said,
    ...(violation.from !== undefined && { from: violation.from }),
    ...(violation.to !== undefined && { to: violation.to }),
    ...(violation.cycle && { cycle: violation.cycle }),
    ...(violation.component !== undefined && { component: violation.component }),
    ...(violation.value !== undefined && { value: violation.value }),
    ...(violation.file !== undefined && { file: violation.file }),
    ...(violation.line !== undefined && { line: violation.line }),
    ...(violation.name !== undefined && { name: violation.name }),
    ...(violation.file !== undefined &&
      ownerOf.get(violation.file) !== undefined && { owner: ownerOf.get(violation.file)! }),
    dependencies: violation.dependencies,
    ...(violation.library !== undefined && { library: violation.library }),
    ...(violation.uses && { uses: violation.uses }),
    ...(violation.exception && { exception: violation.exception })
  }))
  return {
    repositoryId,
    present: report.present,
    evaluated: report.evaluated,
    origin: structure.origin,
    rules: report.rules,
    exceptions: file.exceptions.map((exception) => {
      const rule = report.rules.find((candidate) => candidate.id === exception.rule)
      const fingerprint = rule && fingerprintOf(exception, rule)
      return {
        ...exception,
        ...(fingerprint && { fingerprint }),
        // An Exception accepts the Violations it is the first to name (section 4).
        accepts: violations
          .filter((violation) => violation.exception?.line === exception.line)
          .map((violation) => violation.key)
      }
    }),
    violations,
    problems: report.problems,
    notes: report.notes,
    ...when
  }
}

/**
 * Plan a Rule against the file as it is on disk now: a name the declaration does not have is
 * a warning, as on reading.
 */
export async function planRule(fs: FileSystem, request: RuleRequest): Promise<Plan> {
  if (request.action === 'remove') return planRemoveRule(fs, request.id)
  const declared = (await declaredComponents(fs))?.map((component) => component.id)
  return request.action === 'add'
    ? planAddRule(fs, request.draft, declared)
    : planChangeRule(fs, request.id, request.draft, declared)
}

/** Plan an Exception, justified by an ADR the repository has. */
export async function planException(fs: FileSystem, draft: ExceptionDraft): Promise<Plan> {
  const repository = await openRepository(fs)
  return planAddException(fs, draft, decisionsOf(repository))
}
