/**
 * The Traces of Assessments, Risks and Technical Debt Items (docs/assessment-format.md,
 * section 3): checked against what exists, which the caller hands in — `assessment` reads none
 * of the other modules (ADR-0006) —, and followed the other way, computed (ADR-0009).
 */
import { evidenceKey, namesViolation, type NewEvidence } from './evidence'
import type {
  Assessment,
  Evidence,
  Finding,
  Risk,
  SnapshotValues,
  TechnicalDebtItem,
  ViolationFingerprint
} from './model'
import type { AssessmentProblem } from './problems'
import type { AssessmentsReading } from './read'
import { metricValueIn } from './snapshot'

/**
 * An ADR of the repository, as the caller knows them: the directory of its Decision Log
 * relative to the root (`.` for the root) and its ID. `assessment` does not read Decision Logs
 * (ADR-0006): whoever calls it knows them from `core`.
 */
export interface AdrReference {
  readonly log: string
  readonly id: string
}

/** The reference of an ADR as evidence names it from outside its log. */
export const qualified = (adr: AdrReference): string => `${adr.log}/${adr.id}`

/** Which ADR an `adr` item names: `<log>/<ID>`, or a bare ID that one log has; or several. */
export function citedAdr(
  item: string,
  adrs: readonly AdrReference[]
): { readonly found?: AdrReference; readonly ambiguous?: readonly string[] } {
  const slash = item.lastIndexOf('/')
  if (slash >= 0) {
    const [log, id] = [item.slice(0, slash), item.slice(slash + 1)]
    const found = adrs.find((adr) => adr.log === log && adr.id === id)
    return found ? { found } : {}
  }
  const matches = adrs.filter((adr) => adr.id === item)
  if (matches.length === 1) return { found: matches[0]! }
  return matches.length === 0 ? {} : { ambiguous: matches.map(qualified) }
}

/**
 * What exists in the other modules, as the caller knows it. What is not handed in is not
 * checked: on a Draft no Component is, and no Violation while the Rules cannot be evaluated.
 */
export interface Known {
  /** The Component IDs the declaration has. */
  readonly components?: readonly string[]
  /** The fingerprints of the Violations the code has now. */
  readonly violations?: readonly ViolationFingerprint[]
  /** The metric values the code has now, as a Snapshot would freeze them. */
  readonly metrics?: SnapshotValues
  /** The IDs of the Annotations. */
  readonly annotations?: readonly string[]
  /** The ADRs of the Decision Logs. */
  readonly adrs?: readonly AdrReference[]
}

type Reading = Pick<
  AssessmentsReading,
  'directories' | 'assessments' | 'risks' | 'debtItems' | 'problems'
>

/**
 * The Problems of the Traces: of every Assessment — its scope, the one it follows, the
 * Scenarios and the evidence of its Findings — and of every Risk and Technical Debt Item.
 */
export function traceProblems(reading: Reading, known: Known = {}): AssessmentProblem[] {
  const problems: AssessmentProblem[] = []
  const components = known.components && new Set(known.components)
  const assessments = new Set(reading.assessments.map((assessment) => assessment.id))
  const risks = new Set(reading.risks.map((risk) => risk.id))
  const debtItems = new Set(reading.debtItems.map((item) => item.id))
  const annotations = known.annotations && new Set(known.annotations)
  const unreadableSnapshots = new Set(
    reading.problems.flatMap((problem) =>
      problem.kind === 'unreadable-snapshot' ? [problem.assessment] : []
    )
  )

  for (const assessment of reading.assessments) {
    const { path, id } = assessment
    for (const component of assessment.scope ?? []) {
      if (components && !components.has(component)) {
        problems.push({ kind: 'names-no-component', path, id, key: 'scope', component })
      }
    }
    if (assessment.previous !== undefined && !assessments.has(assessment.previous)) {
      problems.push({
        kind: 'unknown-previous-assessment',
        path,
        assessment: id,
        previous: assessment.previous
      })
    }
    const scenarios = new Set(assessment.scenarios.map((scenario) => scenario.id))
    const final = assessment.status === 'final'
    const frozen = unreadableSnapshots.has(id) ? undefined : assessment.snapshot
    let citesMetrics = false
    for (const finding of assessment.findings) {
      const about = { path, assessment: id, finding: finding.id }
      for (const scenario of finding.scenarios) {
        if (!scenarios.has(scenario)) {
          problems.push({
            kind: 'finding-unknown-scenario',
            ...about,
            line: finding.line,
            scenario
          })
        }
      }
      for (const evidence of finding.evidence) {
        const at = { ...about, line: evidence.line }
        switch (evidence.kind) {
          case 'violation':
            // A final Assessment's Violations are a record of its day.
            if (!final && known.violations) {
              const found = known.violations.some((fingerprint) =>
                namesViolation(evidence.violation, fingerprint)
              )
              if (!found) {
                problems.push({ kind: 'violation-gone', ...at, violation: evidence.violation })
              }
            }
            break
          case 'metric': {
            citesMetrics = true
            if (unreadableSnapshots.has(id)) break
            const { metric, subject } = evidence
            if (frozen) {
              if (metricValueIn(frozen, metric, subject) === undefined) {
                problems.push({ kind: 'metric-not-in-snapshot', ...at, metric, subject })
              }
            } else if (!final && known.metrics) {
              if (metricValueIn(known.metrics, metric, subject) === undefined) {
                problems.push({ kind: 'metric-not-measured', ...at, metric, subject })
              }
            }
            break
          }
          case 'annotation':
            if (annotations && !annotations.has(evidence.id)) {
              problems.push({ kind: 'finding-unknown-annotation', ...at, target: evidence.id })
            }
            break
          case 'adr': {
            if (!known.adrs) break
            const cited = citedAdr(evidence.id, known.adrs)
            if (cited.ambiguous) {
              problems.push({
                kind: 'finding-ambiguous-adr',
                ...at,
                target: evidence.id,
                candidates: cited.ambiguous
              })
            } else if (!cited.found) {
              problems.push({ kind: 'finding-unknown-adr', ...at, target: evidence.id })
            }
            break
          }
          case 'risk':
            if (reading.directories.risks !== undefined && !risks.has(evidence.id)) {
              problems.push({ kind: 'finding-unknown-risk', ...at, target: evidence.id })
            }
            break
          case 'debt':
            if (reading.directories.debt !== undefined && !debtItems.has(evidence.id)) {
              problems.push({ kind: 'finding-unknown-debt-item', ...at, target: evidence.id })
            }
            break
        }
      }
    }
    if (final && citesMetrics && !assessment.snapshot && !unreadableSnapshots.has(id)) {
      problems.push({ kind: 'final-without-snapshot', path, assessment: id })
    }
  }

  for (const entry of [...reading.risks, ...reading.debtItems]) {
    for (const component of entry.components) {
      if (components && !components.has(component)) {
        problems.push({
          kind: 'names-no-component',
          path: entry.path,
          id: entry.id,
          key: 'components',
          component
        })
      }
    }
  }
  return problems
}

/** A Finding with the Assessment it stands in. */
export interface FindingOf {
  readonly assessment: Assessment
  readonly finding: Finding
}

/** The Findings whose evidence `cites` says it names. */
function findingsWhere(
  assessments: readonly Assessment[],
  cites: (evidence: Evidence) => boolean
): FindingOf[] {
  return assessments.flatMap((assessment) =>
    assessment.findings
      .filter((finding) => finding.evidence.some(cites))
      .map((finding) => ({ assessment, finding }))
  )
}

/**
 * The Findings that cite an Annotation, a Risk or a Technical Debt Item, by its ID — or an ADR,
 * resolved against the ADRs there are: the other direction of the Trace, computed (ADR-0009).
 */
export function findingsCiting(
  assessments: readonly Assessment[],
  target:
    | { readonly kind: 'annotation' | 'risk' | 'debt'; readonly id: string }
    | { readonly kind: 'adr'; readonly adr: AdrReference; readonly adrs: readonly AdrReference[] }
): FindingOf[] {
  if (target.kind === 'adr') {
    return findingsWhere(assessments, (evidence) => {
      if (evidence.kind !== 'adr') return false
      const found = citedAdr(evidence.id, target.adrs).found
      return found !== undefined && found.log === target.adr.log && found.id === target.adr.id
    })
  }
  return findingsWhere(
    assessments,
    (evidence) => evidence.kind === target.kind && evidence.id === target.id
  )
}

/** The Assessments that name a Risk or a Technical Debt Item in a Finding's evidence. */
export function assessmentsNaming(
  assessments: readonly Assessment[],
  kind: 'risk' | 'debt',
  id: string
): Assessment[] {
  return [
    ...new Set(findingsCiting(assessments, { kind, id }).map((found) => found.assessment))
  ]
}

/** Whether a piece of evidence names a Component: in a fingerprint, or as a metric's subject. */
function namesComponent(evidence: Evidence, component: string): boolean {
  if (evidence.kind === 'metric') {
    return 'component' in evidence.subject && evidence.subject.component === component
  }
  if (evidence.kind !== 'violation') return false
  const violation = evidence.violation
  switch (violation.kind) {
    case 'dependency':
      return violation.from === component || violation.to === component
    case 'cycle':
      return violation.cycle.includes(component)
    case 'component':
      return violation.component === component
    case 'inside':
      return false
  }
}

/**
 * Everything of the module that names a Component (part 11, the Component page): the
 * Assessments whose scope it is in, the Findings whose evidence names it, the Risks and the
 * Technical Debt Items that concern it.
 */
export function citingComponent(
  reading: Pick<AssessmentsReading, 'assessments' | 'risks' | 'debtItems'>,
  component: string
): {
  readonly assessments: readonly Assessment[]
  readonly findings: readonly FindingOf[]
  readonly risks: readonly Risk[]
  readonly debtItems: readonly TechnicalDebtItem[]
} {
  return {
    assessments: reading.assessments.filter((one) => one.scope?.includes(component)),
    findings: findingsWhere(reading.assessments, (evidence) =>
      namesComponent(evidence, component)
    ),
    risks: reading.risks.filter((risk) => risk.components.includes(component)),
    debtItems: reading.debtItems.filter((item) => item.components.includes(component))
  }
}

/**
 * The value of a metric a Finding cites, as its Assessment reads it: from its Snapshot, frozen,
 * when it has one; otherwise from the values now, while it is a draft.
 */
export function metricValueOf(
  assessment: Assessment,
  evidence: Extract<NewEvidence, { kind: 'metric' }>,
  now?: SnapshotValues
): { readonly value: number; readonly frozen: boolean } | undefined {
  if (assessment.snapshot) {
    const value = metricValueIn(assessment.snapshot, evidence.metric, evidence.subject)
    return value === undefined ? undefined : { value, frozen: true }
  }
  if (assessment.status === 'final' || !now) return undefined
  const value = metricValueIn(now, evidence.metric, evidence.subject)
  return value === undefined ? undefined : { value, frozen: false }
}

/** Whether a Finding cites a piece of evidence already. */
export const citesAlready = (finding: Finding, evidence: NewEvidence): boolean =>
  finding.evidence.some((one) => evidenceKey(one) === evidenceKey(evidence))
