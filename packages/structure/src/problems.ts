import { englishOf, SEGMENT_RULE, type StructureSaid } from './sentences'

export { SEGMENT_RULE }

/**
 * The Problems of Structure (docs/structure-format.md, section 6): inconsistencies in
 * `.arch/components.yml` that the suite detects and names. On a Draft the same findings are
 * hints, not Problems — nothing has been declared there.
 */
export type StructureProblem =
  /** Not YAML, or a key the suite owns has a value of the wrong form. */
  | {
      readonly kind: 'unreadable-declaration'
      readonly detail: string
      /** `detail` as a code, for a window in another language. */
      readonly said?: StructureSaid
      /** The line the YAML parser stopped at, where it says one. */
      readonly line?: number
    }
  /** A key of a `components` map is not a valid segment of a Component ID. */
  | { readonly kind: 'invalid-segment'; readonly component: string; readonly segment: string }
  /** A key occurs twice in one `components` map. The first one is read. */
  | { readonly kind: 'duplicate-component'; readonly component: string }
  /** A pattern that does not begin with `!` matches no Source File. */
  | {
      readonly kind: 'dead-pattern'
      readonly component: string
      readonly key: PatternKey
      readonly pattern: string
    }
  /** A pattern is absolute or leaves the repository. It matches nothing. */
  | {
      readonly kind: 'pattern-outside-repository'
      readonly component: string
      readonly key: PatternKey
      readonly pattern: string
    }
  /** Two Components, neither an ancestor of the other, claim the same Source Files. */
  | {
      readonly kind: 'overlapping-components'
      readonly components: readonly [string, string]
      readonly files: readonly string[]
    }
  /** A Component has neither `paths` nor `components`. */
  | { readonly kind: 'empty-component'; readonly component: string }

export type PatternKey = 'paths' | 'tests'

export const DECLARATION_PATH = '.arch/components.yml'

/** What a Problem says to a person. The app and the later CLI say the same thing. */
export function wordingOf(problem: StructureProblem): string {
  return englishOf(saidOf(problem))
}

/** What a Problem says, as a code: its kind, with the values of its sentence. */
export function saidOf(problem: StructureProblem): StructureSaid {
  switch (problem.kind) {
    case 'unreadable-declaration':
      return {
        code: problem.kind,
        values: { path: DECLARATION_PATH, detail: problem.said ?? problem.detail }
      }
    case 'invalid-segment':
      return {
        code: problem.kind,
        values: { segment: problem.segment, component: problem.component }
      }
    case 'duplicate-component':
    case 'empty-component':
      return { code: problem.kind, values: { component: problem.component } }
    case 'dead-pattern':
    case 'pattern-outside-repository': {
      const { pattern, key, component } = problem
      return { code: problem.kind, values: { pattern, key, component } }
    }
    case 'overlapping-components': {
      const [first, second] = problem.components
      return { code: problem.kind, values: { first, second, files: problem.files } }
    }
  }
}
