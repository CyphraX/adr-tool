/**
 * Evidence as a person reads it, and when two pieces of it name the same thing: a Violation by
 * its fingerprint (docs/conformance-format.md, section 3), a metric by its subject, everything
 * else by its ID.
 */
import type { Evidence, MetricSubject, NamedViolation, ViolationFingerprint } from './model'

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** The members of a Cycle as they are compared: each once, sorted. */
export const membersOf = (cycle: readonly string[]): string[] => [...new Set(cycle)].sort(compare)

/** A Violation on one line, as `adr check` prints its fingerprint: `web-through-cart: web -> catalog`. */
export function violationText(violation: NamedViolation): string {
  switch (violation.kind) {
    case 'dependency':
      return `${violation.rule}: ${violation.from} -> ${violation.to}`
    case 'cycle':
      return `${violation.rule}: ${membersOf(violation.cycle).join(', ')}`
    case 'component':
      return `${violation.rule}: ${violation.component}`
    case 'inside':
      return `${violation.rule}: ${violation.name} in ${violation.file}`
  }
}

/** What a metric is of, on one line: `cart`, or `Cart.total() in cart/src/…/Cart.java`. */
export const subjectText = (subject: MetricSubject): string =>
  'component' in subject ? subject.component : `${subject.name} in ${subject.file}`

/**
 * Whether a Violation a Finding names is the one a fingerprint of the code names. Two Cycles are
 * the same only with the same members; `inside` is a function or a class, whichever it is.
 */
export function namesViolation(named: NamedViolation, fingerprint: ViolationFingerprint): boolean {
  if (named.rule !== fingerprint.rule) return false
  switch (named.kind) {
    case 'dependency':
      return (
        fingerprint.kind === 'dependency' &&
        fingerprint.from === named.from &&
        fingerprint.to === named.to
      )
    case 'cycle': {
      if (fingerprint.kind !== 'cycle') return false
      const [a, b] = [membersOf(named.cycle), membersOf(fingerprint.cycle)]
      return a.length === b.length && a.every((member, index) => member === b[index])
    }
    case 'component':
      return fingerprint.kind === 'component' && fingerprint.component === named.component
    case 'inside':
      return (
        (fingerprint.kind === 'function' || fingerprint.kind === 'class') &&
        fingerprint.file === named.file &&
        fingerprint.name === named.name
      )
  }
}

/** A piece of evidence without the line it stands on: what a Finding is given to cite. */
export type NewEvidence = WithoutLine<Evidence>
type WithoutLine<E> = E extends unknown ? Omit<E, 'line'> : never

/** What a piece of evidence is named by in a sentence: the fingerprint, the metric and its subject, the ID. */
export function evidenceName(evidence: NewEvidence): string {
  switch (evidence.kind) {
    case 'violation':
      return violationText(evidence.violation)
    case 'metric':
      return `${evidence.metric} of ${subjectText(evidence.subject)}`
    default:
      return evidence.id
  }
}

/** What two pieces of evidence are compared by: equal exactly when they name the same thing. */
export function evidenceKey(evidence: NewEvidence): string {
  switch (evidence.kind) {
    case 'violation': {
      const violation = evidence.violation
      const rest =
        violation.kind === 'dependency'
          ? [violation.from, violation.to]
          : violation.kind === 'cycle'
            ? membersOf(violation.cycle)
            : violation.kind === 'component'
              ? [violation.component]
              : [violation.file, violation.name]
      return ['violation', violation.kind, violation.rule, ...rest].join('\n')
    }
    case 'metric': {
      const subject = evidence.subject
      return [
        'metric',
        evidence.metric,
        ...('component' in subject ? [subject.component] : [subject.file, subject.name])
      ].join('\n')
    }
    default:
      return [evidence.kind, evidence.id].join('\n')
  }
}
