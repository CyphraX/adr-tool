/**
 * The values a Quality Scenario takes (docs/assessment-format.md, section 2): the quality
 * attributes of ISO/IEC 25010:2011, the levels of importance and difficulty, the ratings — and
 * the names of the metrics a Finding and a Snapshot use.
 */

/** The eight characteristics of ISO/IEC 25010:2011, each with its sub-characteristics. */
export const QUALITY_ATTRIBUTES = {
  'functional-suitability': [
    'functional-completeness',
    'functional-correctness',
    'functional-appropriateness'
  ],
  'performance-efficiency': ['time-behaviour', 'resource-utilization', 'capacity'],
  compatibility: ['co-existence', 'interoperability'],
  usability: [
    'appropriateness-recognizability',
    'learnability',
    'operability',
    'user-error-protection',
    'user-interface-aesthetics',
    'accessibility'
  ],
  reliability: ['maturity', 'availability', 'fault-tolerance', 'recoverability'],
  security: ['confidentiality', 'integrity', 'non-repudiation', 'accountability', 'authenticity'],
  maintainability: ['modularity', 'reusability', 'analysability', 'modifiability', 'testability'],
  portability: ['adaptability', 'installability', 'replaceability']
} as const satisfies Record<string, readonly string[]>

export type Characteristic = keyof typeof QUALITY_ATTRIBUTES

/** What a Quality Scenario is about: a characteristic, and perhaps one of its sub-characteristics. */
export interface QualityAttribute {
  readonly characteristic: Characteristic
  readonly subCharacteristic?: string
}

/** The quality attribute an `attribute` names, `maintainability/modifiability`; `undefined` for none. */
export function qualityAttributeOf(text: string): QualityAttribute | undefined {
  const [characteristic, sub, ...rest] = text.trim().split('/')
  if (rest.length > 0 || characteristic === undefined) return undefined
  if (!Object.hasOwn(QUALITY_ATTRIBUTES, characteristic)) return undefined
  const known = characteristic as Characteristic
  if (sub === undefined) return { characteristic: known }
  const subs: readonly string[] = QUALITY_ATTRIBUTES[known]
  return subs.includes(sub) ? { characteristic: known, subCharacteristic: sub } : undefined
}

/** A quality attribute as `attribute` writes it. */
export const attributeText = (attribute: QualityAttribute): string =>
  attribute.subCharacteristic === undefined
    ? attribute.characteristic
    : `${attribute.characteristic}/${attribute.subCharacteristic}`

/** How much a Scenario matters, and how hard it is: high, medium, low. */
export const LEVELS = ['H', 'M', 'L'] as const
export type Level = (typeof LEVELS)[number]

/** How well the architecture meets a Scenario's measure, from the best to the worst. */
export const RATINGS = ['met', 'partly-met', 'not-met'] as const
export type Rating = (typeof RATINGS)[number]

/** The state of an Assessment. */
export const ASSESSMENT_STATUSES = ['draft', 'final'] as const
export type AssessmentStatus = (typeof ASSESSMENT_STATUSES)[number]

/** The states of a Risk, and of a Technical Debt Item (docs/assessment-format.md, section 5). */
export const RISK_STATES = ['open', 'mitigated', 'accepted', 'closed'] as const
export type RiskState = (typeof RISK_STATES)[number]
export const DEBT_STATES = ['open', 'scheduled', 'paid-off'] as const
export type DebtState = (typeof DEBT_STATES)[number]

/**
 * The metrics by the names a Rule gives them (docs/conformance-format.md, section 2), in the
 * order a Snapshot writes them: those of a Component, then those inside a Source File, then that
 * of a level. A name a later version brings is read and kept all the same.
 */
export const METRIC_NAMES = [
  'files',
  'lines',
  'efferent-coupling',
  'afferent-coupling',
  'instability',
  'fan-out',
  'fan-in',
  'relational-cohesion',
  'internal-share',
  'abstractness',
  'distance',
  'complexity',
  'lcom4',
  'propagation-cost'
] as const

/** Whether a text is a metric's name as the format writes one: lowercase words joined by dashes. */
export const isMetricName = (name: string): boolean => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)
