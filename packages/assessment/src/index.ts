/**
 * The core of the Assessment module (docs/assessment-format.md): Assessments with their Quality
 * Scenarios, Findings and Snapshots, and the registers of Risks and Technical Debt Items. Pure
 * TypeScript on the kernel's file-system port; it reads Structure's model, and is told by its
 * caller what the other modules know (ADR-0006).
 */
export type {
  Assessment,
  Evidence,
  EvidenceKind,
  Finding,
  MetricSubject,
  NamedViolation,
  QualityScenario,
  Register,
  Risk,
  Snapshot,
  SnapshotValues,
  TechnicalDebtItem,
  ViolationFingerprint
} from './model'
export { EVIDENCE_KINDS } from './model'
export {
  ASSESSMENT_STATUSES,
  attributeText,
  DEBT_STATES,
  isMetricName,
  LEVELS,
  METRIC_NAMES,
  QUALITY_ATTRIBUTES,
  qualityAttributeOf,
  RATINGS,
  RISK_STATES,
  type AssessmentStatus,
  type Characteristic,
  type DebtState,
  type Level,
  type QualityAttribute,
  type Rating,
  type RiskState
} from './quality'
export {
  evidenceKey,
  evidenceName,
  membersOf,
  namesViolation,
  subjectText,
  violationText,
  type NewEvidence
} from './evidence'
export { isEntryId, readAssessment } from './document'
export { readRegisterEntry } from './register'
export {
  componentValuesOf,
  metricValueIn,
  readSnapshot,
  snapshotPathOf,
  snapshotText,
  snapshotValuesOf,
  SNAPSHOT_SUFFIX,
  type MeasuredInside,
  type NewSnapshot
} from './snapshot'
export {
  DEFAULT_DIRECTORIES,
  DIRECTORY_KEYS,
  isFileId,
  lastAssessment,
  locateAssessments,
  openAssessments,
  readLocations,
  type AssessmentLocations,
  type AssessmentsReading
} from './read'
export {
  assessmentsNaming,
  citedAdr,
  citesAlready,
  citingComponent,
  findingsCiting,
  metricValueOf,
  qualified,
  traceProblems,
  type AdrReference,
  type FindingOf,
  type Known
} from './traces'
export {
  ASSESSMENT_PROBLEM_CODES,
  hasRepair,
  saidOf,
  wordingOf,
  type AssessmentProblem,
  type DirectoryKey
} from './problems'
export {
  englishOf as assessmentEnglishOf,
  SENTENCES as ASSESSMENT_SENTENCES,
  type AssessmentSaid
} from './sentences'
export {
  evidenceLines,
  planAssessment,
  planAssessmentFromLast,
  planDebtItem,
  planEvidence,
  planFinding,
  planFinish,
  planRating,
  planRegisterEntry,
  planRisk,
  planScenario,
  planSnapshot,
  planState,
  type NewAssessment,
  type NewFinding,
  type NewRegisterEntry,
  type NewScenario
} from './write'
export { planRepair } from './repair'
export { planRenameInAssessments } from './rename'
