/**
 * The Conformance module's core: Rules in `.arch/rules.yml`, their Violations on Structure's
 * model, and the Exceptions that accept them (docs/conformance-format.md). It does not load
 * TypeScript: whoever calls it analyses the code with `structure` and hands the Dependencies in.
 */
export { matcherOf as componentMatcher, hasWildcard } from './component-patterns'
export { fingerprintKey, fingerprintText, type Fingerprint } from './fingerprint'
export {
  CONFORMANCE_NOTE_CODES,
  CONFORMANCE_PROBLEM_CODES,
  RULE_KIND_NAMES,
  RULES_PATH,
  saidOf,
  wordingOf,
  type ConformanceNote,
  type ConformanceNoteCode,
  type ConformanceProblem,
  type ConformanceProblemCode
} from './problems'
export {
  isRuleId,
  METRICS,
  readRules,
  type AppliedPattern,
  type CyclesRule,
  type DependencyRule,
  type LayersRule,
  type MetricName,
  type Naming,
  type Rule,
  type RuleKind,
  type RulesFile,
  type ThresholdRule,
  type WrittenException
} from './rules'
export { evaluate, type Model, type Violation } from './evaluate'
export {
  adrExists,
  checkConformance,
  checkPlannedImport,
  justification,
  needsModel,
  openConformance,
  type CheckedViolation,
  type ConformanceReport,
  type Decisions,
  type PlannedImport
} from './check'
export { planRenameInRules, renameInRules } from './rename'
export {
  planAddException,
  planAddRule,
  planChangeRule,
  planConformanceRepair,
  planRemoveRule,
  renderRule,
  repairOf,
  type ConformanceRepair,
  type ExceptionDraft,
  type RuleDraft
} from './write'
export {
  SENTENCES as CONFORMANCE_SENTENCES,
  englishOf as conformanceEnglishOf,
  type Change,
  type ConformanceSaid
} from './sentences'

import type { Dependency } from '@adr-tool/structure/model'
import type { Violation } from './evaluate'
import { englishOf, type ConformanceSaid } from './sentences'

/**
 * What a Violation says at one line of one of its imports: "billing must not depend on web:
 * packages/billing/src/invoice.ts:3 imports packages/web/src/format.ts." — or, for a Violation
 * that has no import, what it says on its own.
 */
export function saidAt(
  violation: Violation,
  dependency?: Dependency,
  line?: number
): ConformanceSaid {
  if (dependency === undefined)
    return { code: 'violation-alone', values: { violation: violation.said } }
  return {
    code: 'violation-at',
    values: {
      violation: violation.said,
      file: dependency.from,
      line: line ?? dependency.lines[0] ?? 1,
      imports: dependency.to
    }
  }
}

/** The English of `saidAt`. */
export const sentenceAt = (violation: Violation, dependency?: Dependency, line?: number): string =>
  englishOf(saidAt(violation, dependency, line))
