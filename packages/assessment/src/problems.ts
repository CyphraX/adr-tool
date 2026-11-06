import type { EvidenceKind, MetricSubject, NamedViolation } from './model'
import { englishOf, type AssessmentSaid } from './sentences'
import { subjectText, violationText } from './evidence'

/** The keys of `.arch/config.yml` that are Assessment's own (docs/configuration.md). */
export type DirectoryKey = 'assessments' | 'risks' | 'debt'

/**
 * The Problems of Assessment (docs/assessment-format.md, section 7): what the suite finds wrong
 * with the Assessments of a repository, their Snapshots, the Risks and Technical Debt Items, the
 * keys that say where they are, and the Traces they carry. `path` is the file a Problem is about;
 * `line` where in it, from 1. That `.arch/config.yml` cannot be read at all is the kernel's
 * Problem, said once for every module (docs/configuration.md).
 */
export type AssessmentProblem =
  /** A key of `.arch/config.yml` is no directory inside the repository. */
  | {
      readonly kind: 'invalid-directory-setting'
      readonly path: string
      readonly line: number
      readonly key: DirectoryKey
    }
  | {
      readonly kind: 'unreadable-assessment' | 'unreadable-risk' | 'unreadable-debt-item'
      readonly path: string
      /** The ID of the Assessment, Risk or Technical Debt Item. */
      readonly id: string
      readonly detail: AssessmentSaid
    }
  /** A key of the frontmatter has a value of the wrong form. */
  | {
      readonly kind: 'invalid-frontmatter-value'
      readonly path: string
      readonly id: string
      readonly line: number
      readonly key: string
      readonly detail: AssessmentSaid
    }
  | { readonly kind: 'assessment-without-date'; readonly path: string; readonly id: string }
  /** The block of an entry is not YAML, or is never closed. Its entry is not read. */
  | {
      readonly kind: 'unreadable-entry'
      readonly path: string
      readonly assessment: string
      readonly line: number
      readonly detail: AssessmentSaid
    }
  | {
      readonly kind: 'entry-of-two-kinds'
      readonly path: string
      readonly assessment: string
      readonly line: number
    }
  | {
      readonly kind: 'entry-without-heading' | 'invalid-entry-id'
      readonly path: string
      readonly assessment: string
      readonly line: number
      /** The ID as written. */
      readonly entry: string
    }
  | {
      readonly kind: 'duplicate-entry'
      readonly path: string
      readonly assessment: string
      readonly line: number
      readonly entry: string
      readonly of: 'scenario' | 'finding'
    }
  | {
      readonly kind: 'missing-entry-key'
      readonly path: string
      readonly assessment: string
      readonly line: number
      readonly entry: string
      readonly key: string
    }
  | {
      readonly kind: 'invalid-entry-value'
      readonly path: string
      readonly assessment: string
      readonly line: number
      readonly entry: string
      readonly key: string
      readonly detail: AssessmentSaid
    }
  | {
      readonly kind: 'unknown-quality-attribute'
      readonly path: string
      readonly assessment: string
      readonly line: number
      readonly entry: string
      readonly value: string
    }
  | {
      readonly kind: 'invalid-evidence'
      readonly path: string
      readonly assessment: string
      readonly line: number
      readonly entry: string
      readonly detail: AssessmentSaid
    }
  | {
      readonly kind: 'unreadable-snapshot'
      readonly path: string
      readonly assessment: string
      readonly detail: AssessmentSaid
    }
  | {
      readonly kind: 'snapshot-without-assessment'
      readonly path: string
      readonly assessment: string
    }
  /** `scope` of an Assessment, or `components` of a Risk or Item, names an undeclared Component. */
  | {
      readonly kind: 'names-no-component'
      readonly path: string
      readonly id: string
      readonly key: 'scope' | 'components'
      readonly component: string
    }
  | {
      readonly kind: 'unknown-previous-assessment'
      readonly path: string
      readonly assessment: string
      readonly previous: string
    }
  | {
      readonly kind: 'finding-unknown-scenario'
      readonly path: string
      readonly assessment: string
      readonly line: number
      readonly finding: string
      readonly scenario: string
    }
  /** A draft cites a Violation the code no longer has. */
  | {
      readonly kind: 'violation-gone'
      readonly path: string
      readonly assessment: string
      readonly line: number
      readonly finding: string
      readonly violation: NamedViolation
    }
  | {
      readonly kind: 'metric-not-in-snapshot' | 'metric-not-measured'
      readonly path: string
      readonly assessment: string
      readonly line: number
      readonly finding: string
      readonly metric: string
      readonly subject: MetricSubject
    }
  | { readonly kind: 'final-without-snapshot'; readonly path: string; readonly assessment: string }
  /** Evidence of an Annotation, an ADR, a Risk or a Technical Debt Item that is not there. */
  | {
      readonly kind:
        | 'finding-unknown-annotation'
        | 'finding-unknown-adr'
        | 'finding-unknown-risk'
        | 'finding-unknown-debt-item'
      readonly path: string
      readonly assessment: string
      readonly line: number
      readonly finding: string
      /** The ID as the evidence writes it. */
      readonly target: string
    }
  | {
      readonly kind: 'finding-ambiguous-adr'
      readonly path: string
      readonly assessment: string
      readonly line: number
      readonly finding: string
      readonly target: string
      readonly candidates: readonly string[]
    }

/** The codes of Assessment's Problems: a code is a Problem's kind. */
export const ASSESSMENT_PROBLEM_CODES = [
  'invalid-directory-setting',
  'unreadable-assessment',
  'unreadable-risk',
  'unreadable-debt-item',
  'invalid-frontmatter-value',
  'assessment-without-date',
  'unreadable-entry',
  'entry-of-two-kinds',
  'entry-without-heading',
  'invalid-entry-id',
  'duplicate-entry',
  'missing-entry-key',
  'invalid-entry-value',
  'unknown-quality-attribute',
  'invalid-evidence',
  'unreadable-snapshot',
  'snapshot-without-assessment',
  'names-no-component',
  'unknown-previous-assessment',
  'finding-unknown-scenario',
  'violation-gone',
  'metric-not-in-snapshot',
  'metric-not-measured',
  'final-without-snapshot',
  'finding-unknown-annotation',
  'finding-unknown-adr',
  'finding-ambiguous-adr',
  'finding-unknown-risk',
  'finding-unknown-debt-item'
] as const satisfies readonly AssessmentProblem['kind'][]

/** Which kind of evidence each Problem of a missing target is about. */
export const EVIDENCE_OF: Partial<Record<AssessmentProblem['kind'], EvidenceKind>> = {
  'violation-gone': 'violation',
  'metric-not-in-snapshot': 'metric',
  'metric-not-measured': 'metric',
  'finding-unknown-annotation': 'annotation',
  'finding-unknown-adr': 'adr',
  'finding-unknown-risk': 'risk',
  'finding-unknown-debt-item': 'debt'
}

/** What a Problem says, as a code: its kind, with the values of its sentence. */
export function saidOf(problem: AssessmentProblem): AssessmentSaid {
  switch (problem.kind) {
    case 'invalid-directory-setting':
      return { code: problem.kind, values: { path: problem.path, key: problem.key } }
    case 'unreadable-assessment':
    case 'unreadable-risk':
    case 'unreadable-debt-item':
      return { code: problem.kind, values: { path: problem.path, detail: problem.detail } }
    case 'invalid-frontmatter-value':
      return {
        code: problem.kind,
        values: { path: problem.path, key: problem.key, detail: problem.detail }
      }
    case 'assessment-without-date':
    case 'final-without-snapshot':
      return { code: problem.kind, values: { path: problem.path } }
    case 'unreadable-entry':
      return {
        code: problem.kind,
        values: { path: problem.path, line: problem.line, detail: problem.detail }
      }
    case 'entry-of-two-kinds':
      return { code: problem.kind, values: { path: problem.path, line: problem.line } }
    case 'entry-without-heading':
    case 'invalid-entry-id':
      return {
        code: problem.kind,
        values: { path: problem.path, line: problem.line, entry: problem.entry }
      }
    case 'duplicate-entry': {
      const { path, line, entry, of } = problem
      return { code: problem.kind, values: { path, line, entry, of } }
    }
    case 'missing-entry-key':
      return {
        code: problem.kind,
        values: { path: problem.path, entry: problem.entry, key: problem.key }
      }
    case 'invalid-entry-value': {
      const { path, entry, key, detail } = problem
      return { code: problem.kind, values: { path, entry, key, detail } }
    }
    case 'unknown-quality-attribute':
      return {
        code: problem.kind,
        values: { path: problem.path, entry: problem.entry, value: problem.value }
      }
    case 'invalid-evidence': {
      const { path, line, entry, detail } = problem
      return { code: problem.kind, values: { path, line, entry, detail } }
    }
    case 'unreadable-snapshot':
      return { code: problem.kind, values: { path: problem.path, detail: problem.detail } }
    case 'snapshot-without-assessment':
      return { code: problem.kind, values: { path: problem.path, assessment: problem.assessment } }
    case 'names-no-component': {
      const { path, key, component } = problem
      return { code: problem.kind, values: { path, key, component } }
    }
    case 'unknown-previous-assessment':
      return { code: problem.kind, values: { path: problem.path, previous: problem.previous } }
    case 'finding-unknown-scenario': {
      const { path, finding, scenario } = problem
      return { code: problem.kind, values: { path, finding, scenario } }
    }
    case 'violation-gone':
      return {
        code: problem.kind,
        values: {
          path: problem.path,
          finding: problem.finding,
          violation: violationText(problem.violation)
        }
      }
    case 'metric-not-in-snapshot':
    case 'metric-not-measured':
      return {
        code: problem.kind,
        values: {
          path: problem.path,
          finding: problem.finding,
          metric: problem.metric,
          subject: subjectText(problem.subject)
        }
      }
    case 'finding-unknown-annotation':
    case 'finding-unknown-adr':
    case 'finding-unknown-risk':
    case 'finding-unknown-debt-item': {
      const { path, finding, target } = problem
      return { code: problem.kind, values: { path, finding, target } }
    }
    case 'finding-ambiguous-adr': {
      const { path, finding, target, candidates } = problem
      return { code: problem.kind, values: { path, finding, target, candidates } }
    }
  }
}

/** What a Problem says to a person, in English. The window words its code. */
export function wordingOf(problem: AssessmentProblem): string {
  return englishOf(saidOf(problem))
}

/**
 * Whether a Problem has a Repair: a Trace to something that is not there, which the Repair takes
 * out where it stands (docs/assessment-format.md, section 7). A Trace that is ambiguous, an
 * Assessment that follows one that is gone, and a final Assessment without a Snapshot have none:
 * only a person knows what was meant.
 */
export function hasRepair(problem: AssessmentProblem): boolean {
  return (
    problem.kind === 'names-no-component' ||
    problem.kind === 'finding-unknown-scenario' ||
    EVIDENCE_OF[problem.kind] !== undefined
  )
}
