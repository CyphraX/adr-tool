/**
 * Checking a repository's Rules (docs/conformance-format.md): read `.arch/rules.yml`, check the
 * Components its Rules name against the declaration, evaluate the Rules on Structure's model,
 * and let the Exceptions accept what they name. Reads only; never writes.
 */
import { normalizePath, type FileSystem } from '@adr-tool/kernel'
import { everyComponent, type Structure } from '@adr-tool/structure/model'
import { hasWildcard, matcherOf } from './component-patterns'
import { evaluate, type Model, type Violation } from './evaluate'
import { fingerprintKey, membersOf, type Fingerprint } from './fingerprint'
import { RULES_PATH, type ConformanceNote, type ConformanceProblem } from './problems'
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
  /** What could be better in `.arch/rules.yml` and fails nothing, in the order of their lines. */
  readonly notes: readonly ConformanceNote[]
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
  const notes: ConformanceNote[] = []
  const byLine = <T extends { line: number }>(list: readonly T[]): T[] =>
    list
      .map((item, order) => ({ item, order }))
      .sort((a, b) => a.item.line - b.item.line || a.order - b.order)
      .map(({ item }) => item)
  const report = (violations: CheckedViolation[], evaluated: boolean): ConformanceReport => ({
    present: file.present,
    rules: file.rules,
    evaluated,
    violations,
    problems: byLine(problems),
    notes: byLine(notes)
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

  // The Exceptions that can match, each with its fingerprint; first the Problems of the others.
  const taken = new Set<string>()
  const matching: { exception: WrittenException; fingerprint: Fingerprint }[] = []
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
    matching.push({ exception, fingerprint })
    const adr = exception.justifiedBy
    if (adr !== undefined && decisions !== undefined) {
      const found = justification(adr.adr, decisions)
      if (found !== 'exists') {
        problems.push({
          kind: found === 'url' ? 'invalid-justification' : 'unknown-justification',
          fingerprint,
          adr: adr.adr,
          line: adr.line
        })
      }
    }
  }

  // What each Exception accepts: the Violation it names; and for a Cycle, failing that, every
  // Cycle of its Rule whose members are all among its own (section 4) — a Cycle that shrank.
  const accepts = new Map<WrittenException, number[]>(
    matching.map(({ exception }) => [exception, []])
  )
  const accept = (index: number, exception: WrittenException): void => {
    violations[index] = { ...violations[index]!, exception }
    accepts.get(exception)!.push(index)
  }
  for (const { exception, fingerprint } of matching) {
    const index = byKey.get(fingerprintKey(fingerprint))
    if (index !== undefined) accept(index, exception)
  }
  for (const { exception, fingerprint } of matching) {
    if (fingerprint.kind !== 'cycle') continue
    const own = new Set(fingerprint.cycle)
    violations.forEach((violation, index) => {
      const found = violation.fingerprint
      if (violation.exception !== undefined || found.kind !== 'cycle') return
      if (found.rule === fingerprint.rule && found.cycle.every((member) => own.has(member))) {
        accept(index, exception)
      }
    })
  }
  for (const { exception, fingerprint } of matching) {
    const accepted = accepts.get(exception)!
    if (accepted.length === 0) {
      problems.push({ kind: 'unmatched-exception', fingerprint, line: exception.line })
      continue
    }
    if (fingerprint.kind !== 'cycle') continue
    const members = membersOf(
      accepted.flatMap((index) => {
        const found = violations[index]!.fingerprint
        return found.kind === 'cycle' ? found.cycle : []
      })
    )
    if (members.length < membersOf(fingerprint.cycle).length) {
      notes.push({ kind: 'exception-can-shrink', fingerprint, members, line: exception.line })
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
export const FINGERPRINT_KEYS: Record<Rule['kind'], string> = {
  'must-not-depend': '"from" and "to"',
  'may-only-depend': '"from" and "to"',
  layers: '"from" and "to"',
  'no-cycles': '"cycle", the list of its members',
  threshold: '"component"'
}

/** The fingerprint an Exception names, when its keys fit the kind of its Rule. */
export function fingerprintOf(
  exception: Pick<WrittenException, 'from' | 'to' | 'cycle' | 'component'>,
  rule: Rule
): Fingerprint | undefined {
  const { from, to, cycle, component } = exception
  switch (rule.kind) {
    case 'must-not-depend':
    case 'may-only-depend':
    case 'layers':
      return from !== undefined &&
        to !== undefined &&
        cycle === undefined &&
        component === undefined
        ? { kind: 'dependency', rule: rule.id, from, to }
        : undefined
    case 'no-cycles':
      return cycle !== undefined && cycle.length > 1 && from === undefined && to === undefined
        ? { kind: 'cycle', rule: rule.id, cycle }
        : undefined
    case 'threshold':
      return component !== undefined &&
        from === undefined &&
        to === undefined &&
        cycle === undefined
        ? { kind: 'component', rule: rule.id, component }
        : undefined
  }
}

/** A web address, or anything else with a scheme and `//`: no name of an ADR. */
const URL = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//
/** What a repository is named, before the colon (docs/file-format.md, section 3). */
const REPOSITORY_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/**
 * Whether a reference names an ADR of another repository, as `core` reads one: a name, a
 * colon, the directory of a log as the tool writes it (`.` for the root) and an ID. A web
 * address is none: its `//` is no directory of a log.
 */
function outside(reference: string): boolean {
  const colon = reference.indexOf(':')
  if (colon <= 0 || !REPOSITORY_NAME.test(reference.slice(0, colon))) return false
  const rest = reference.slice(colon + 1)
  const slash = rest.lastIndexOf('/')
  if (slash === -1) return false
  const written = rest.slice(0, slash)
  const id = rest.slice(slash + 1)
  const log = written === '.' ? '' : normalizePath(written)
  if (log === undefined || (written !== '.' && (log === '' || log !== written))) return false
  return id !== '' && !id.includes(':') && !/\.md$/i.test(id)
}

/**
 * What `justified-by` names (docs/conformance-format.md, section 4): an ADR of the repository
 * — `<log>/<ID>`, `./<ID>` for a log at the root, a bare ID where there is one Decision Log —
 * or of another one, taken as written; or nothing that exists; or a web address, which names
 * no ADR at all.
 */
export function justification(
  reference: string,
  decisions: Decisions
): 'exists' | 'missing' | 'url' {
  if (URL.test(reference)) return 'url'
  if (outside(reference)) return 'exists'
  return adrExists(reference, decisions) ? 'exists' : 'missing'
}

/** Whether `justified-by` names an ADR of this repository, or one of another, taken as written. */
export function adrExists(reference: string, decisions: Decisions): boolean {
  if (URL.test(reference)) return false
  if (outside(reference)) return true
  const slash = reference.lastIndexOf('/')
  const id = reference.slice(slash + 1)
  const written = slash === -1 ? undefined : reference.slice(0, slash)
  const log = written === undefined ? decisions.logs[0] : written === '.' ? '' : written
  if (written === undefined && decisions.logs.length !== 1) return false
  return decisions.adrs.some((adr) => adr.log === log && adr.id === id)
}

/** An import that is not written yet: from one Source File to another. */
export interface PlannedImport {
  readonly from: string
  readonly to: string
  /** An `import type`, which a Rule that ignores type-only Dependencies does not count. */
  readonly typeOnly?: boolean
  /** The line it will stand on; 1 when it is left out. */
  readonly line?: number
}

/**
 * The Violations an import would be part of, before it is written (docs/mcp.md,
 * `list_violations`): the Rules are checked with the import added to the Dependencies, and
 * what is found with it behind is returned — accepted by an Exception or not. An import that is
 * there already is checked as it is. `structure` has to know `from` as a Source File, a file
 * that is not written yet included: whoever calls lists it among the files of the repository.
 */
export function checkPlannedImport(
  file: RulesFile,
  structure: Pick<Structure, 'origin' | 'components' | 'sourceFiles'>,
  model: Omit<Model, 'structure'>,
  planned: PlannedImport,
  decisions?: Decisions
): ConformanceReport & { readonly exists: boolean } {
  const { from, to } = planned
  const there = model.dependencies.find((one) => one.from === from && one.to === to)
  const dependencies = there
    ? model.dependencies
    : [
        ...model.dependencies,
        { from, to, typeOnly: planned.typeOnly ?? false, lines: [planned.line ?? 1] }
      ]
  const report = checkConformance(file, structure, { ...model, dependencies }, decisions)
  return {
    ...report,
    violations: report.violations.filter((violation) =>
      violation.dependencies.some((one) => one.from === from && one.to === to)
    ),
    exists: there !== undefined
  }
}
