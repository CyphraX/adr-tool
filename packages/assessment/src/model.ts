/**
 * What the Assessment module reads from the repository (docs/assessment-format.md): Assessments
 * with their entries and Snapshots, Risks and Technical Debt Items. Each is what its file says,
 * read tolerantly; what is wrong with a file is a Problem beside it.
 */
import type {
  AssessmentStatus,
  DebtState,
  Level,
  QualityAttribute,
  Rating,
  RiskState
} from './quality'

/**
 * A Violation as a Finding names it: its Rule, and what it is about, by the kind of the Rule
 * (docs/conformance-format.md, section 3). `inside` is a function or a class in a Source File,
 * whichever the Rule's metric is about (part 13).
 */
export type NamedViolation =
  | {
      readonly kind: 'dependency'
      readonly rule: string
      readonly from: string
      readonly to: string
    }
  | { readonly kind: 'cycle'; readonly rule: string; readonly cycle: readonly string[] }
  | { readonly kind: 'component'; readonly rule: string; readonly component: string }
  | { readonly kind: 'inside'; readonly rule: string; readonly file: string; readonly name: string }

/**
 * The fingerprint of a Violation the code has now, as Conformance gives it: `assessment` does
 * not know Conformance (ADR-0006), and its caller hands these in. Each of Conformance's
 * fingerprints is one of these, part 13's per function and per class among them.
 */
export type ViolationFingerprint =
  | {
      readonly kind: 'dependency'
      readonly rule: string
      readonly from: string
      readonly to: string
    }
  | { readonly kind: 'cycle'; readonly rule: string; readonly cycle: readonly string[] }
  | { readonly kind: 'component'; readonly rule: string; readonly component: string }
  | {
      readonly kind: 'function' | 'class'
      readonly rule: string
      readonly file: string
      readonly name: string
    }

/** What a metric value is of: a Component (`*` for the top level), or a function or class in a Source File. */
export type MetricSubject =
  { readonly component: string } | { readonly file: string; readonly name: string }

/** One piece of a Finding's evidence: a Trace (docs/assessment-format.md, section 2). */
export type Evidence = (
  | { readonly kind: 'violation'; readonly violation: NamedViolation }
  | { readonly kind: 'metric'; readonly metric: string; readonly subject: MetricSubject }
  /** An Annotation, an ADR as `cites` names one, a Risk, a Technical Debt Item: by its ID. */
  | { readonly kind: 'annotation' | 'adr' | 'risk' | 'debt'; readonly id: string }
) & {
  /** The line of the item in its file, from 1. */
  readonly line: number
}

/** The kinds of evidence, by the key that names each. */
export const EVIDENCE_KINDS = ['violation', 'metric', 'annotation', 'adr', 'risk', 'debt'] as const
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number]

interface Entry {
  readonly id: string
  /** The text of its heading. */
  readonly title: string
  /** The line of its heading, from 1. */
  readonly line: number
  /** The level of its heading, 2 to 6. */
  readonly level: number
  /** Markdown, the author's own: what follows its block up to the next heading of its level. */
  readonly text: string
}

export interface QualityScenario extends Entry {
  /** `undefined` when the block names none, or none that ISO/IEC 25010 has: a Problem says which. */
  readonly attribute?: QualityAttribute
  readonly source?: string
  readonly stimulus?: string
  readonly artifact?: string
  readonly environment?: string
  readonly response?: string
  readonly measure?: string
  readonly importance?: Level
  readonly difficulty?: Level
  /** Absent while it is not rated. */
  readonly rating?: Rating
}

export interface Finding extends Entry {
  /** The Scenarios of its Assessment it concerns, by ID, as written. */
  readonly scenarios: readonly string[]
  readonly evidence: readonly Evidence[]
}

/** The metric values a Snapshot freezes: per Component, and per function or class of a Source File. */
export interface SnapshotValues {
  /** Component ID — `*` for the top level — to metric name to value. */
  readonly components: Readonly<Record<string, Readonly<Record<string, number>>>>
  /** Path of a Source File to the qualified name of a function or class to metric name to value (part 13). */
  readonly sourceFiles?: Readonly<
    Record<string, Readonly<Record<string, Readonly<Record<string, number>>>>>
  >
}

/** The file beside an Assessment that freezes its metric values (docs/assessment-format.md, section 4). */
export interface Snapshot extends SnapshotValues {
  readonly path: string
  /** The commit HEAD pointed at when it was taken; absent where there was none. */
  readonly commit?: string
  /** The day it was taken. */
  readonly date?: string
  readonly sourceFiles: Readonly<
    Record<string, Readonly<Record<string, Readonly<Record<string, number>>>>>
  >
}

export interface Assessment {
  /** The file name without `.md`, frozen when the Assessment is created. */
  readonly id: string
  readonly path: string
  /** The text of its first level-one heading; absent when it has none. */
  readonly title?: string
  /** `YYYY-MM-DD`; absent when the file does not say, or says something else: a Problem says why. */
  readonly date?: string
  /** `draft` when the file does not say; `undefined` when it says something else, or cannot be read. */
  readonly status: AssessmentStatus | undefined
  readonly authors: readonly string[]
  /** The Components it assesses, as written; absent for the whole repository. */
  readonly scope?: readonly string[]
  /** The Assessment it follows. */
  readonly previous?: string
  /** In the order of the document; an entry that cannot be read is not among them. */
  readonly scenarios: readonly QualityScenario[]
  readonly findings: readonly Finding[]
  /** Its Snapshot, when it has one that can be read. */
  readonly snapshot?: Snapshot
  /** Whether the suite may write into the file: its frontmatter can be read. */
  readonly writable: boolean
}

/** The two registers, by the key of their directory. */
export type Register = 'risks' | 'debt'

interface RegisterEntry<State extends string> {
  readonly id: string
  readonly path: string
  readonly title?: string
  /** `open` when the file does not say; `undefined` when it says something else, or cannot be read. */
  readonly state: State | undefined
  /** The day it was recorded. */
  readonly date?: string
  /** The day its state last changed. */
  readonly changed?: string
  readonly owner?: string
  /** The Components it concerns, as written. */
  readonly components: readonly string[]
  /** Markdown, the author's own: the body without its title. */
  readonly description: string
  readonly writable: boolean
}

export interface Risk extends RegisterEntry<RiskState> {
  readonly register: 'risks'
}

export interface TechnicalDebtItem extends RegisterEntry<DebtState> {
  readonly register: 'debt'
}
