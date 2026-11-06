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
  openStructure,
  type Dependencies,
  type NotAnalysed,
  type NotMeasured
} from '@adr-tool/structure'
import {
  DECLARATION_PATH,
  isPositional,
  wordingOf,
  type StructureProblem
} from '@adr-tool/structure/model'
import { openDiagrams } from '@adr-tool/diagrams'
import { openConfig, type Git, type UnreadableConfig } from '@adr-tool/kernel'
import { adrReferencesOf } from '@adr-tool/review'
import { extractorFor } from './analysis'
import { checkDiagrams, diagramsNeedModel, type DiagramsCheck } from './check-diagrams'
import { checkReview, type ReviewCheck } from './check-review'
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
  readonly diagrams: DiagramsCheck
  /** The Annotations of Review: their Problems, and the orphaned ones as notes. */
  readonly review: ReviewCheck
  /** What was not checked, and why: for standard error, not part of the result. */
  readonly notes: readonly string[]
}

/**
 * Check the repository behind `fs`, whose files are `files` (`listRepository`): its Decision
 * Logs as `adr lint` does, its declaration of Components, its Rules against the code, and its
 * Diagrams — their Problems, their pictures, and their Drift against the code —, and its
 * Annotations, whose Anchors are found again with `git`. `undefined` when there is nothing to
 * check: no Decision Log, no declaration, no Rules, no Diagram, no Annotation, and nothing wrong
 * with `.arch/config.yml`.
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
  const found = await openDiagrams(fs, config)
  const review = await checkReview(fs, git, adrReferencesOf(repository.logs))
  const nothing =
    lint === undefined &&
    rulesText === undefined &&
    !declared &&
    config.readable &&
    found.problems.length === 0 &&
    found.diagrams.length === 0 &&
    review.annotations === 0 &&
    review.problems.length === 0
  if (nothing) return undefined

  const notes = [...(lint?.notes ?? [])]
  const structure = await openStructure(fs, files)
  const rules = readRules(rulesText)
  for (const exception of rules.exceptions) {
    if (exception.name !== undefined && isPositional(exception.name)) {
      notes.push(
        `${RULES_PATH}:${exception.line}: The Exception of ${exception.rule} names ${exception.name} by its position among the functions of that name in ${exception.file ?? 'its file'}: it moves to another one when a function of that name is added or removed before it.`
      )
    }
  }

  // The code is analysed only for Rules that are checked, and for Drift where a Diagram can
  // have it: it takes a moment on a large repository.
  let model: Dependencies | undefined
  if (needsModel(rules, structure) || diagramsNeedModel(found, structure)) {
    model = await analyseDependencies(
      fs,
      files,
      structure.sourceFiles,
      await extractorFor(structure)
    )
    if (model.notAnalysed.length > 0) notes.push(notAnalysed(model.notAnalysed))
    if (model.notMeasured.length > 0) notes.push(notMeasured(model.notMeasured))
  }

  const decisions: Decisions = {
    logs: repository.logs.map((log) => log.path),
    adrs: repository.logs.flatMap((log) => log.adrs.map((adr) => ({ log: log.path, id: adr.id })))
  }
  const conformance = checkConformance(rules, structure, model, decisions)
  const diagrams = await checkDiagrams(fs, found, structure, model)

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
    diagrams,
    review,
    notes
  }
}

/** The note about Source Files that cannot be parsed: they have no Dependencies of their own. */
function notAnalysed(files: readonly NotAnalysed[]): string {
  const shown = files
    .slice(0, 3)
    .map((file) =>
      file.line !== undefined
        ? `${file.file}:${file.line}`
        : file.message !== undefined
          ? `${file.file} (${file.message})`
          : file.file
    )
  const more = files.length > shown.length ? `, and ${files.length - shown.length} more` : ''
  const count = files.length === 1 ? '1 Source File' : `${files.length} Source Files`
  return `${count} cannot be parsed and ${files.length === 1 ? 'has' : 'have'} no Dependencies of ${files.length === 1 ? 'its' : 'their'} own: ${shown.join(', ')}${more}.`
}

/** The note about Source Files that could not be measured: no metric of their inside counts them. */
function notMeasured(files: readonly NotMeasured[]): string {
  const shown = files.slice(0, 3).map((file) => `${file.file} (${file.message})`)
  const more = files.length > shown.length ? `, and ${files.length - shown.length} more` : ''
  const count = files.length === 1 ? '1 Source File' : `${files.length} Source Files`
  return `${count} could not be measured inside: ${files.length === 1 ? 'its' : 'their'} functions and classes count towards no Rule on complexity, LCOM4, abstractness or distance: ${shown.join(', ')}${more}.`
}
