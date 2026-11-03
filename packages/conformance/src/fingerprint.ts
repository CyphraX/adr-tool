/**
 * The fingerprint of a Violation (docs/conformance-format.md, section 3): its Rule and what it
 * is about, by the kind of the Rule, without line numbers — so that it stays when lines move.
 * An Exception names a Violation by it, and so will a Baseline and a Finding. Each variant says
 * which it is, so that one added later — part 13's Rule, Source File and function — cannot be
 * taken for another.
 */
export type Fingerprint =
  /** `must-not-depend`, `may-only-depend`, `layers`: the source and the target Component. */
  | {
      readonly kind: 'dependency'
      readonly rule: string
      readonly from: string
      readonly to: string
    }
  /** `no-cycles`: the members of the Cycle, Component IDs or paths, in any order. */
  | { readonly kind: 'cycle'; readonly rule: string; readonly cycle: readonly string[] }
  /** `threshold`: the Component whose metric is outside. */
  | { readonly kind: 'component'; readonly rule: string; readonly component: string }
  /** `library`: the Component that uses the Library, and the Library as the code names it. */
  | {
      readonly kind: 'library'
      readonly rule: string
      readonly component: string
      readonly library: string
    }

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** The members of a Cycle as they are compared: each once, sorted. */
export const membersOf = (cycle: readonly string[]): string[] => [...new Set(cycle)].sort(compare)

/** The fingerprint on one line, for reading: `billing-not-web: billing -> web`. */
export function fingerprintText(fingerprint: Fingerprint): string {
  switch (fingerprint.kind) {
    case 'dependency':
      return `${fingerprint.rule}: ${fingerprint.from} -> ${fingerprint.to}`
    case 'cycle':
      return `${fingerprint.rule}: ${membersOf(fingerprint.cycle).join(', ')}`
    case 'component':
      return `${fingerprint.rule}: ${fingerprint.component}`
    case 'library':
      return `${fingerprint.rule}: ${fingerprint.component} uses ${fingerprint.library}`
  }
}

/** What two fingerprints are compared by: equal exactly when they name the same Violation. */
export function fingerprintKey(fingerprint: Fingerprint): string {
  switch (fingerprint.kind) {
    case 'dependency':
      return [fingerprint.kind, fingerprint.rule, fingerprint.from, fingerprint.to].join('\n')
    case 'cycle':
      return [fingerprint.kind, fingerprint.rule, ...membersOf(fingerprint.cycle)].join('\n')
    case 'component':
      return [fingerprint.kind, fingerprint.rule, fingerprint.component].join('\n')
    case 'library':
      return [fingerprint.kind, fingerprint.rule, fingerprint.component, fingerprint.library].join(
        '\n'
      )
  }
}
