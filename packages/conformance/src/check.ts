/**
 * Checking a repository's Rules (docs/conformance-format.md): read `.arch/rules.yml`, check the
 * Components its Rules name against the declaration, evaluate the Rules on Structure's model,
 * and let the Exceptions accept what they name. Reads only; never writes.
 */
import type { FileSystem } from '@adr-tool/kernel'
import { everyComponent, type Structure } from '@adr-tool/structure/model'
import { hasWildcard, matcherOf } from './component-patterns'
import { evaluate, type Model, type Violation } from './evaluate'
import { fingerprintKey, type Fingerprint } from './fingerprint'
import { RULES_PATH, type ConformanceProblem } from './problems'
import { readRules, type Naming, type Rule, type RulesFile, type WrittenException } from './rules'

/**
 * What the checker is told about Decisions, which `conformance` does not know (ADR-0006): the
 * Decision Logs of the repository by their directories — `''` for the root — and every ADR in
 * them. Left out, `justified-by` is not checked.
 */
export interface Decisions {
  readonly logs: readonly string[]
  readonly adrs: readonly { readonly log: string; readonly id: string }[]
}

/** A Violation, and the Exception that accepts it, if one does. */
export interface CheckedViolation extends Violation {
  readonly exception?: WrittenException
}

export interface ConformanceReport {
  /** Whether `.arch/rules.yml` is there. */
  readonly present: boolean
  /** The Rules that can be read, in the order of the file. */
  readonly rules: readonly Rule[]
  /** Whether the Rules were evaluated: not on a Draft, and not while the file cannot be read. */
  readonly evaluated: boolean
  /** In the order of the Rules, each Rule's in the order of their fingerprints. */
  readonly violations: readonly CheckedViolation[]
  /** In the order of their lines in `.arch/rules.yml`. */
  readonly problems: readonly ConformanceProblem[]
}

/**
 * Whether the Rules of the file will be evaluated on this Structure, so that its Dependencies
 * are needed: there are Rules that can be read, and Components are declared.
 */
export function needsModel(file: RulesFile, structure: Pick<Structure, 'origin'>): boolean {
  return file.rules.length > 0 && structure.origin === 'declared'
}

/**
 * Check the Rules of a file against a Structure. `model` is needed when `needsModel` says so:
 * the Dependencies and line counts of the repository's Source Files.
 */
export function checkConformance(
  file: RulesFile,
  structure: Pick<Structure, 'origin' | 'components' | 'sourceFiles'>,
  model?: Omit<Model, 'structure'>,
  decisions?: Decisions
): ConformanceReport {
  const problems: ConformanceProblem[] = [...file.problems]
  const report = (violations: CheckedViolation[], evaluated: boolean): ConformanceReport => ({
    present: file.present,
    rules: file.rules,
    evaluated,
    violations,
    problems: problems
      .map((problem, order) => ({ problem, order }))
      .sort((a, b) => a.problem.line - b.problem.line || a.order - b.order)
      .map(({ problem }) => problem)
  })

  if (structure.origin !== 'declared') {
    if (file.written > 0) problems.push({ kind: 'rules-without-declaration', line: file.rulesLine })
    return report([], false)
  }
  const evaluating = needsModel(file, structure)
  if (evaluating && model === undefined) {
    throw new Error('The Rules need the Dependencies of the repository.')
  }

  // Every Component a Rule or an applied Pattern names is declared.
  const declared = everyComponent(structure.components).map((component) => component.id)
  const known = new Set(declared)
  const checkNames = (
    names: readonly Naming[],
    by: 'rule' | 'applied-pattern',
    owner: string
  ): void => {
    for (const { pattern, key, line } of names) {
      if (!hasWildcard(pattern)) {
        if (!known.has(pattern)) {
          problems.push({ kind: 'unknown-component', by, owner, key, component: pattern, line })
        }
      } else if (!declared.some(matcherOf([pattern]))) {
        problems.push({ kind: 'no-component-matches', by, owner, key, pattern, line })
      }
    }
  }
  for (const rule of file.rules) checkNames(rule.names, 'rule', rule.id)
  for (const pattern of file.patterns) checkNames(pattern.names, 'applied-pattern', pattern.id)

  const violations: CheckedViolation[] = evaluating
    ? file.rules.flatMap((rule) => evaluate(rule, { structure, ...model! }))
    : []
  const byKey = new Map(
    violations.map((violation, index) => [fingerprintKey(violation.fingerprint), index])
  )
  const rules = new Map(file.rules.map((rule) => [rule.id, rule]))

  const taken = new Set<string>()
  for (const exception of file.exceptions) {
    const rule = rules.get(exception.rule)
    if (rule === undefined) {
      // A Rule that is written and cannot be checked has its own Problem, which comes first.
      if (!file.unchecked.has(exception.rule)) {
        problems.push({
          kind: 'exception-unknown-rule',
          rule: exception.rule,
          line: exception.line
        })
      }
      continue
    }
    const fingerprint = fingerprintOf(exception, rule)
    if (fingerprint === undefined) {
      problems.push({
        kind: 'invalid-exception',
        rule: rule.id,
        detail: {
          code: 'fingerprint-of-kind',
          values: { kind: rule.kind, keys: FINGERPRINT_KEYS[rule.kind] }
        },
        line: exception.line
      })
      continue
    }
    const key = fingerprintKey(fingerprint)
    if (taken.has(key)) {
      problems.push({ kind: 'duplicate-exception', fingerprint, line: exception.line })
      continue
    }
    taken.add(key)
    const index = byKey.get(key)
    if (index === undefined) {
      problems.push({ kind: 'unmatched-exception', fingerprint, line: exception.line })
    } else {
      violations[index] = { ...violations[index]!, exception }
    }
    const adr = exception.justifiedBy
    if (adr !== undefined && decisions !== undefined && !adrExists(adr.adr, decisions)) {
      problems.push({ kind: 'unknown-justification', fingerprint, adr: adr.adr, line: adr.line })
    }
  }
  return report(violations, evaluating)
}

/** Read `.arch/rules.yml` from the repository behind `fs`, and check it. */
export async function openConformance(
  fs: FileSystem,
  structure: Pick<Structure, 'origin' | 'components' | 'sourceFiles'>,
  model?: Omit<Model, 'structure'>,
  decisions?: Decisions
): Promise<ConformanceReport> {
  return checkConformance(readRules(await fs.readText(RULES_PATH)), structure, model, decisions)
}

/** What names a Violation of each kind in an Exception, in words. */
const FINGERPRINT_KEYS: Record<Rule['kind'], string> = {
  'must-not-depend': '"from" and "to"',
  'may-only-depend': '"from" and "to"',
  layers: '"from" and "to"',
  'no-cycles': '"cycle", the list of its members',
  threshold: '"component"'
}

/** The fingerprint an Exception names, when its keys fit the kind of its Rule. */
function fingerprintOf(exception: WrittenException, rule: Rule): Fingerprint | undefined {
  const { from, to, cycle, component } = exception
  switch (rule.kind) {
    case 'must-not-depend':
    case 'may-only-depend':
    case 'layers':
      return from !== undefined &&
        to !== undefined &&
        cycle === undefined &&
        component === undefined
        ? { rule: rule.id, from, to }
        : undefined
    case 'no-cycles':
      return cycle !== undefined && cycle.length > 1 && from === undefined && to === undefined
        ? { rule: rule.id, cycle }
        : undefined
    case 'threshold':
      return component !== undefined &&
        from === undefined &&
        to === undefined &&
        cycle === undefined
        ? { rule: rule.id, component }
        : undefined
  }
}

/** The name of a repository, before the colon of a reference that leads out of this one. */
const OUTSIDE = /^[A-Za-z0-9][A-Za-z0-9._-]*:.+\/.+$/

/**
 * Whether `justified-by` names an ADR of the repository (docs/conformance-format.md, section 4):
 * `<log>/<ID>`, `./<ID>` for a log at the root, a bare ID where there is one Decision Log. An
 * ADR of another repository is taken as written.
 */
export function adrExists(reference: string, decisions: Decisions): boolean {
  if (OUTSIDE.test(reference)) return true
  const slash = reference.lastIndexOf('/')
  const id = reference.slice(slash + 1)
  const written = slash === -1 ? undefined : reference.slice(0, slash)
  const log = written === undefined ? decisions.logs[0] : written === '.' ? '' : written
  if (written === undefined && decisions.logs.length !== 1) return false
  return decisions.adrs.some((adr) => adr.log === log && adr.id === id)
}
