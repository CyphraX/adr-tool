/**
 * The fingerprint of a Violation (docs/conformance-format.md, section 3): its Rule and what it
 * is about, by the kind of the Rule, without line numbers — so that it stays when lines move.
 * An Exception names a Violation by it, and so will a Baseline and a Finding.
 */
export type Fingerprint =
  /** `must-not-depend`, `may-only-depend`, `layers`: the source and the target Component. */
  | { readonly rule: string; readonly from: string; readonly to: string }
  /** `no-cycles`: the members of the Cycle, Component IDs or paths, in any order. */
  | { readonly rule: string; readonly cycle: readonly string[] }
  /** `threshold`: the Component whose metric is outside. */
  | { readonly rule: string; readonly component: string }

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** The fingerprint on one line, for reading: `billing-not-web: billing -> web`. */
export function fingerprintText(fingerprint: Fingerprint): string {
  if ('from' in fingerprint) return `${fingerprint.rule}: ${fingerprint.from} -> ${fingerprint.to}`
  if ('cycle' in fingerprint) {
    return `${fingerprint.rule}: ${[...fingerprint.cycle].sort(compare).join(', ')}`
  }
  return `${fingerprint.rule}: ${fingerprint.component}`
}

/** What two fingerprints are compared by: equal exactly when they name the same Violation. */
export function fingerprintKey(fingerprint: Fingerprint): string {
  if ('from' in fingerprint)
    return ['pair', fingerprint.rule, fingerprint.from, fingerprint.to].join('\n')
  if ('cycle' in fingerprint) {
    return ['cycle', fingerprint.rule, ...[...new Set(fingerprint.cycle)].sort(compare)].join('\n')
  }
  return ['component', fingerprint.rule, fingerprint.component].join('\n')
}
