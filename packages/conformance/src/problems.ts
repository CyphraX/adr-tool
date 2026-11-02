/**
 * The Problems of Conformance (docs/conformance-format.md, section 5): inconsistencies in
 * `.arch/rules.yml` that the suite detects and names, each at the line of the file it is about.
 */
import { DECLARATION_PATH } from '@adr-tool/structure/model'
import { fingerprintText, type Fingerprint } from './fingerprint'
import { englishOf, type ConformanceSaid } from './sentences'

export const RULES_PATH = '.arch/rules.yml'

/** Where Components are named: by a Rule or by an applied Pattern, and under which key. */
type Naming = {
  readonly by: 'rule' | 'applied-pattern'
  readonly owner: string
  readonly key: string
}

export type ConformanceProblem = {
  /** The line of `.arch/rules.yml` the Problem is about, from 1. */
  readonly line: number
} & (
  | { readonly kind: 'unreadable-rules'; readonly detail: ConformanceSaid }
  | { readonly kind: 'rules-without-declaration' }
  /** `kind` is what the Rule says, empty when it says nothing. */
  | { readonly kind: 'unknown-rule-kind'; readonly rule: string; readonly written: string }
  /** `rule` is empty when the Rule has no ID that can be read. */
  | { readonly kind: 'invalid-rule'; readonly rule: string; readonly detail: ConformanceSaid }
  | { readonly kind: 'duplicate-rule'; readonly rule: string }
  | (Naming & { readonly kind: 'unknown-component'; readonly component: string })
  | (Naming & { readonly kind: 'no-component-matches'; readonly pattern: string })
  | { readonly kind: 'invalid-exception'; readonly rule: string; readonly detail: ConformanceSaid }
  | { readonly kind: 'exception-unknown-rule'; readonly rule: string }
  | { readonly kind: 'unmatched-exception'; readonly fingerprint: Fingerprint }
  | { readonly kind: 'duplicate-exception'; readonly fingerprint: Fingerprint }
  | {
      readonly kind: 'unknown-justification'
      readonly fingerprint: Fingerprint
      readonly adr: string
    }
  | {
      readonly kind: 'invalid-applied-pattern'
      readonly pattern: string
      readonly detail: ConformanceSaid
    }
)

export type ConformanceProblemCode = ConformanceProblem['kind']

/** Every code a Problem of Conformance can have, in the order of the specification. */
export const CONFORMANCE_PROBLEM_CODES: readonly ConformanceProblemCode[] = [
  'unreadable-rules',
  'rules-without-declaration',
  'unknown-rule-kind',
  'invalid-rule',
  'duplicate-rule',
  'unknown-component',
  'no-component-matches',
  'invalid-exception',
  'exception-unknown-rule',
  'unmatched-exception',
  'duplicate-exception',
  'unknown-justification',
  'invalid-applied-pattern'
]

/** What a Problem says, as a code: its kind, with the values of its sentence. */
export function saidOf(problem: ConformanceProblem): ConformanceSaid {
  switch (problem.kind) {
    case 'unreadable-rules':
      return { code: problem.kind, values: { path: RULES_PATH, detail: problem.detail } }
    case 'rules-without-declaration':
      return { code: problem.kind, values: { path: RULES_PATH, declaration: DECLARATION_PATH } }
    case 'unknown-rule-kind':
      return {
        code: problem.kind,
        values: { rule: problem.rule, kind: problem.written, kinds: [...RULE_KIND_NAMES] }
      }
    case 'invalid-rule':
    case 'invalid-exception':
      return { code: problem.kind, values: { rule: problem.rule, detail: problem.detail } }
    case 'duplicate-rule':
    case 'exception-unknown-rule':
      return { code: problem.kind, values: { rule: problem.rule } }
    case 'unknown-component': {
      const { by, owner, key, component } = problem
      return { code: problem.kind, values: { by, owner, key, component } }
    }
    case 'no-component-matches': {
      const { by, owner, key, pattern } = problem
      return { code: problem.kind, values: { by, owner, key, pattern } }
    }
    case 'unmatched-exception':
    case 'duplicate-exception':
      return { code: problem.kind, values: { fingerprint: fingerprintText(problem.fingerprint) } }
    case 'unknown-justification':
      return {
        code: problem.kind,
        values: { fingerprint: fingerprintText(problem.fingerprint), adr: problem.adr }
      }
    case 'invalid-applied-pattern':
      return { code: problem.kind, values: { pattern: problem.pattern, detail: problem.detail } }
  }
}

/** What a Problem says to a person, in English. The app and the command line say the same. */
export function wordingOf(problem: ConformanceProblem): string {
  return englishOf(saidOf(problem))
}

/** The kinds of Rules (docs/conformance-format.md, section 2). */
export const RULE_KIND_NAMES = [
  'must-not-depend',
  'may-only-depend',
  'layers',
  'no-cycles',
  'threshold'
] as const
