/**
 * Everything `conformance` says in sentences — what is wrong with `.arch/rules.yml`, what a
 * Violation is, why an operation is refused — as a code with the values of its sentence, and
 * the English sentence of each code (docs/plan-roadmap.md, part 12). The command line and the
 * MCP server say the English sentence; the window words the code in its own language. A code
 * stays; a sentence that says something else gets a new one.
 */
import {
  KERNEL_SENTENCES,
  Refusal,
  sentenceOf,
  type Said,
  type SaidBy,
  type Sentences
} from '@adr-tool/kernel'

/** What makes a Rule ID, as the end of a sentence about one. */
export const RULE_ID_RULE =
  'consists of lowercase letters, digits and dashes, and starts and ends with a letter or a digit'

/** What another sentence said, inside this one; a plain text is passed on as it is. */
const english = (said: Said | string): string =>
  typeof said === 'string'
    ? said
    : (SENTENCES as unknown as Record<string, (values: unknown) => string>)[said.code]!(said.values)

/** A list of names as a sentence has them: `a`, `a and b`, `a, b and c`. */
export function listed(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

/** A number as a person reads it: whole numbers as they are, others to two places. */
export const formatNumber = (value: number): string =>
  Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100)

// The values are types, not interfaces: a Said's values are a record of names, and only a type
// is one without saying so.

/** Where a Component is named: a Rule or an applied Pattern, and under which key. */
type Naming = {
  readonly by: 'rule' | 'applied-pattern'
  readonly owner: string
  readonly key: string
}
const namedBy = (v: Naming): string =>
  v.by === 'rule' ? `The Rule ${v.owner}` : `The applied Pattern ${v.owner}`

/** A fingerprint as one line, for reading (docs/conformance-format.md, section 3). */
type Printed = { readonly fingerprint: string }

export const SENTENCES = {
  ...KERNEL_SENTENCES,

  // The Problems of Conformance (docs/conformance-format.md, section 5): a code is a Problem's kind.
  'unreadable-rules': (v: { path: string; detail: Said | string }): string =>
    `${v.path} cannot be read: ${english(v.detail)}.`,
  'rules-without-declaration': (v: { path: string; declaration: string }): string =>
    `${v.path} has Rules, and ${v.declaration} declares no Components that can be read, so no Rule is checked. Declare the Components, or adopt the Draft, first.`,
  'unknown-rule-kind': (v: { rule: string; kind: string; kinds: readonly string[] }): string =>
    v.kind === ''
      ? `The Rule ${v.rule} has no kind. A Rule's kind is one of ${v.kinds.join(', ')}.`
      : `The Rule ${v.rule} has the kind "${v.kind}", which the suite does not know. A Rule's kind is one of ${v.kinds.join(', ')}.`,
  'invalid-rule': (v: { rule: string; detail: Said }): string =>
    `${v.rule === '' ? 'A Rule' : `The Rule ${v.rule}`} cannot be checked: ${english(v.detail)}.`,
  'duplicate-rule': (v: { rule: string }): string =>
    `There is a Rule ${v.rule} already. The first one is checked, this one is not.`,
  'unknown-component': (v: Naming & { component: string }): string =>
    `${namedBy(v)} names ${v.component} in ${v.key}, which is not a declared Component.`,
  'no-component-matches': (v: Naming & { pattern: string }): string =>
    `${namedBy(v)} has the pattern "${v.pattern}" in ${v.key}, which matches no declared Component.`,
  'invalid-exception': (v: { rule: string; detail: Said }): string =>
    `An Exception from ${v.rule === '' ? 'a Rule' : `the Rule ${v.rule}`} cannot be read: ${english(v.detail)}.`,
  'exception-unknown-rule': (v: { rule: string }): string =>
    `An Exception names the Rule ${v.rule}, which is not in this file.`,
  'unmatched-exception': (v: Printed): string =>
    `The Exception ${v.fingerprint} matches no Violation: the Violation is gone. Remove the Exception.`,
  'duplicate-exception': (v: Printed): string =>
    `There is an Exception ${v.fingerprint} already. The first one counts.`,
  'unknown-justification': (v: Printed & { adr: string }): string =>
    `The Exception ${v.fingerprint} is justified by ${v.adr}, which is not an ADR of this repository. An ADR is named by the directory of its Decision Log and its ID: docs/adr/0001-example.`,
  'invalid-applied-pattern': (v: { pattern: string; detail: Said }): string =>
    `${v.pattern === '' ? 'An applied Pattern' : `The applied Pattern ${v.pattern}`} cannot be read: ${english(v.detail)}.`,
  'unknown-applied-pattern': (v: { rule: string; pattern: string }): string =>
    `The Rule ${v.rule} says it was written by the applied Pattern ${v.pattern}, which is not in this file.`,

  // Why the file, a Rule, an Exception or an applied Pattern cannot be read: the rest of a sentence.
  'not-yaml': (v: { message: string }): string => `it is not valid YAML: ${v.message}`,
  'top-not-map': (): string => 'its top level must be a map',
  'key-not-list': (v: { key: string }): string => `"${v.key}" must be a list`,
  'item-not-map': (): string => 'it must be a map of its keys',
  'missing-key': (v: { key: string }): string => `it has no "${v.key}"`,
  'not-text': (v: { key: string }): string => `"${v.key}" must be a text`,
  'not-patterns': (v: { key: string }): string =>
    `"${v.key}" must be a Component ID or pattern, or a list of them`,
  'not-rule-id': (v: { id: string }): string =>
    `"${v.id}" is not a valid Rule ID, which ${RULE_ID_RULE}`,
  'not-number': (v: { key: string }): string => `"${v.key}" must be a number`,
  'not-one-of': (v: { key: string; value: string; allowed: readonly string[] }): string =>
    `"${v.key}" is "${v.value}", which is none of ${v.allowed.join(', ')}`,
  'unknown-metric': (v: { metric: string; metrics: readonly string[] }): string =>
    `"${v.metric}" is no metric the suite knows; a metric is one of ${v.metrics.join(', ')}`,
  'too-few-layers': (): string => '"layers" must list at least two layers',
  'among-or-inside': (): string => 'it must have either "among" or "inside"',
  'max-or-min': (): string => 'it must have "max", "min" or both',
  'fingerprint-of-kind': (v: { kind: string; keys: string }): string =>
    `an Exception from a Rule of the kind ${v.kind} names its Violation by ${v.keys}`,
  'roles-not-map': (): string => '"roles" must be a map from each role to Component patterns',

  // What a Violation is (docs/conformance-format.md, section 3): a code is the kind of its Rule.
  'must-not-depend': (v: { from: string; to: string }): string =>
    `${v.from} must not depend on ${v.to}`,
  'may-only-depend': (v: { from: string; to: string; allowed: readonly string[] }): string =>
    v.allowed.length === 0
      ? `${v.from} may depend on no other Component, and depends on ${v.to}`
      : `${v.from} may only depend on ${listed(v.allowed)}, and depends on ${v.to}`,
  layers: (v: { from: string; to: string; where: 'above' | 'further-below' }): string =>
    v.where === 'above'
      ? `${v.from} must not depend on ${v.to}, which lies in a layer above it`
      : `${v.from} may only depend on the layer right below it, and ${v.to} lies further down`,
  'no-cycles': (v: { members: readonly string[]; roundTrip: readonly string[] }): string =>
    `${listed(v.members)} depend on each other in a Cycle: ${[...v.roundTrip, v.roundTrip[0]!].join(' -> ')}`,
  threshold: (v: {
    metric: string
    component: string
    value: number
    bound: 'max' | 'min'
    limit: number
  }): string =>
    `The metric ${v.metric} of ${v.component} is ${formatNumber(v.value)}, ${v.bound === 'max' ? 'above the maximum' : 'below the minimum'} of ${formatNumber(v.limit)}`,
  // A Violation at one of its imports: what Jonas reads on his pull request.
  'violation-at': (v: { violation: Said; file: string; line: number; imports: string }): string =>
    `${english(v.violation)}: ${v.file}:${v.line} imports ${v.imports}.`,
  // A Violation that has no import to point at: a threshold.
  'violation-alone': (v: { violation: Said }): string => `${english(v.violation)}.`,

  // Rename of a Component (docs/conformance-format.md, section 7).
  'rename-unreadable-rules': (v: { path: string }): string =>
    `${v.path} cannot be read, so the Rules that name the Component cannot be renamed with it. Fix the file first.`,
  'cannot-rename-in-rules': (v: { path: string; id: string }): string =>
    `${v.path} is written in a way the suite cannot rename ${v.id} in. Change it in an editor.`
} satisfies Sentences

/** What `conformance` may say: one of its codes, with the values of its sentence. */
export type ConformanceSaid = SaidBy<typeof SENTENCES>

/** The English sentence of what `conformance` said. */
export const englishOf = (said: ConformanceSaid): string => sentenceOf(SENTENCES, said)

/** Refuse an operation: its plan is the reason, in English and as a code. */
export function refusal(said: ConformanceSaid): Refusal {
  return new Refusal(englishOf(said), said)
}
