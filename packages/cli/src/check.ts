import type { FileSystem } from '@adr-tool/core'
import {
  checkConformance,
  needsModel,
  readRules,
  RULES_PATH,
  type ConformanceReport,
  type Decisions
} from '@adr-tool/conformance'
import {
  analyseDependencies,
  extractorOf,
  openStructure,
  type NotAnalysed
} from '@adr-tool/structure'
import { DECLARATION_PATH, wordingOf, type StructureProblem } from '@adr-tool/structure/model'
import { openConfig, type Git, type UnreadableConfig } from '@adr-tool/kernel'
import { adrReferencesOf } from '@adr-tool/review'
import { checkReview, type ReviewCheck } from './check-review'
import { goReader, javaReader, pythonReader } from './readers'
import { lintRepository, type LintReport } from './lint'

/** A Problem of `.arch/components.yml`, as the command reports it. */
export interface DeclarationProblem {
  readonly code: StructureProblem['kind']
  readonly message: string
  readonly path: string
  /** Where the file says one: the line the YAML parser stopped at. */
  readonly line?: number
  readonly problem: StructureProblem
}

/** What `adr check` found (docs/cli.md): every module's Problems, and the Violations. */
export interface CheckReport {
  /** What `adr lint` reports; `undefined` when the repository has no Decision Log. */
  readonly lint: LintReport | undefined
  /** Whether `.arch/components.yml` is there. */
  readonly declared: boolean
  readonly declaration: readonly DeclarationProblem[]
  /** That `.arch/config.yml` cannot be read: the one Problem of the file, said once for every module. */
  readonly config: UnreadableConfig | undefined
  readonly conformance: ConformanceReport
  /** The Annotations of Review: their Problems, and the orphaned ones as notes. */
  readonly review: ReviewCheck
  /** What was not checked, and why: for standard error, not part of the result. */
  readonly notes: readonly string[]
}

/**
 * Check the repository behind `fs`, whose files are `files` (`listRepository`): its Decision
 * Logs as `adr lint` does, its declaration of Components, its Rules against the code, and its
 * Annotations, whose Anchors are found again with `git`. `undefined` when there is nothing to
 * check: no Decision Log, no declaration, no Rules, no Annotation, and nothing wrong with
 * `.arch/config.yml`.
 */
export async function check(
  fs: FileSystem,
  files: readonly string[],
  git: Git
): Promise<CheckReport | undefined> {
  const { report: lint, repository } = await lintRepository(fs)
  const rulesText = await fs.readText(RULES_PATH)
  const declared = (await fs.readText(DECLARATION_PATH)) !== undefined
  const config = await openConfig(fs)
  const review = await checkReview(fs, git, adrReferencesOf(repository.logs))
  const nothing =
    lint === undefined &&
    rulesText === undefined &&
    !declared &&
    config.readable &&
    review.annotations === 0 &&
    review.problems.length === 0
  if (nothing) return undefined

  const notes = [...(lint?.notes ?? [])]
  const structure = await openStructure(fs, files)
  const rules = readRules(rulesText)

  // The code is analysed only for Rules that are checked: it takes a moment on a large repository.
  let model: Awaited<ReturnType<typeof analyseDependencies>> | undefined
  if (needsModel(rules, structure)) {
    const has = (language: string): boolean =>
      structure.sourceFiles.some((file) => file.language === language)
    const extract = extractorOf({
      java: has('java') ? await javaReader() : undefined,
      python: has('python') ? await pythonReader() : undefined,
      go: has('go') ? await goReader() : undefined
    })
    model = await analyseDependencies(fs, files, structure.sourceFiles, extract)
    if (model.notAnalysed.length > 0) notes.push(notAnalysed(model.notAnalysed))
  }

  const decisions: Decisions = {
    logs: repository.logs.map((log) => log.path),
    adrs: repository.logs.flatMap((log) => log.adrs.map((adr) => ({ log: log.path, id: adr.id })))
  }
  const conformance = checkConformance(rules, structure, model, decisions)

  return {
    lint,
    declared,
    // The Problems of a declaration that is there; on a Draft, what is found is a hint.
    declaration: structure.problems.map((problem) => ({
      code: problem.kind,
      message: wordingOf(problem),
      path: DECLARATION_PATH,
      ...('line' in problem && problem.line !== undefined && { line: problem.line }),
      problem
    })),
    config: config.readable ? undefined : config.problem,
    conformance,
    review,
    notes
  }
}

/** The note about Source Files that cannot be parsed: they have no Dependencies of their own. */
function notAnalysed(files: readonly NotAnalysed[]): string {
  const shown = files
    .slice(0, 3)
    .map((file) => (file.line === undefined ? file.file : `${file.file}:${file.line}`))
  const more = files.length > shown.length ? `, and ${files.length - shown.length} more` : ''
  const count = files.length === 1 ? '1 Source File' : `${files.length} Source Files`
  return `${count} cannot be parsed and ${files.length === 1 ? 'has' : 'have'} no Dependencies of ${files.length === 1 ? 'its' : 'their'} own: ${shown.join(', ')}${more}.`
}
