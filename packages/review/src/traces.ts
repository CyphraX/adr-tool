import type { Annotation } from './annotation'
import type { ReviewProblem } from './problems'

/**
 * An ADR of the repository, as the caller knows them: the directory of its Decision Log
 * relative to the root (`.` for the root) and its ID. `review` does not read Decision Logs
 * itself (ADR-0006): whoever calls it knows them from `core`.
 */
export interface AdrReference {
  readonly log: string
  readonly id: string
}

/**
 * What a `cites` item names (docs/review-format.md, section 2): the ADR, or — for a bare ID
 * that several Decision Logs have — `<log>/<ID>` of each, or nothing.
 */
export interface CitedAdr {
  readonly found?: AdrReference
  readonly ambiguous?: readonly string[]
}

/**
 * The ADRs of Decision Logs as a `cites` item names them: by the directory of their log, `.`
 * at the top. `logs` as `core` has them, the root's with the path `''`.
 */
export const adrReferencesOf = (
  logs: readonly { readonly path: string; readonly adrs: readonly { readonly id: string }[] }[]
): AdrReference[] =>
  logs.flatMap((log) =>
    log.adrs.map((adr) => ({ log: log.path === '' ? '.' : log.path, id: adr.id }))
  )

/** The reference of an ADR as an item of `cites` names it from outside its log. */
export const qualified = (adr: AdrReference): string => `${adr.log}/${adr.id}`

/** Which ADR a `cites` item names, if any: `<log>/<ID>`, or a bare ID that one log has. */
export function citedAdr(item: string, adrs: readonly AdrReference[]): CitedAdr {
  const slash = item.lastIndexOf('/')
  if (slash >= 0) {
    const [log, id] = [item.slice(0, slash), item.slice(slash + 1)]
    const found = adrs.find((adr) => adr.log === log && adr.id === id)
    return found ? { found } : {}
  }
  const matches = adrs.filter((adr) => adr.id === item)
  if (matches.length === 1) return { found: matches[0]! }
  return matches.length === 0 ? {} : { ambiguous: matches.map(qualified) }
}

/** The Problems of the Traces of Annotations: a `cites` item that names no ADR, or several. */
export function traceProblems(
  annotations: readonly Annotation[],
  adrs: readonly AdrReference[]
): ReviewProblem[] {
  return annotations.flatMap((annotation) =>
    annotation.cites.flatMap((adr): ReviewProblem[] => {
      const cited = citedAdr(adr, adrs)
      if (cited.found) return []
      const about = { path: annotation.path, annotation: annotation.id, adr }
      return cited.ambiguous
        ? [{ kind: 'ambiguous-adr', ...about, candidates: cited.ambiguous }]
        : [{ kind: 'unknown-adr', ...about }]
    })
  )
}

/** The Annotations that cite an ADR: the other direction of the Trace, computed (ADR-0009). */
export function annotationsCiting(
  adr: AdrReference,
  annotations: readonly Annotation[],
  adrs: readonly AdrReference[]
): Annotation[] {
  return annotations.filter((annotation) =>
    annotation.cites.some((item) => {
      const found = citedAdr(item, adrs).found
      return found !== undefined && found.log === adr.log && found.id === adr.id
    })
  )
}
