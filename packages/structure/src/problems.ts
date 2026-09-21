/**
 * The Problems of Structure (docs/structure-format.md, section 6): inconsistencies in
 * `.arch/components.yml` that the suite detects and names. On a Draft the same findings are
 * hints, not Problems — nothing has been declared there.
 */
export type StructureProblem =
  /** Not YAML, or a key the suite owns has a value of the wrong form. */
  | { readonly kind: 'unreadable-declaration'; readonly detail: string }
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
  switch (problem.kind) {
    case 'unreadable-declaration':
      return `${DECLARATION_PATH} cannot be read: ${problem.detail}`
    case 'invalid-segment':
      return `"${problem.segment}" in ${problem.component} is not a valid segment of a Component ID. A segment consists of lowercase letters, digits and dashes, and starts and ends with a letter or a digit.`
    case 'duplicate-component':
      return `${problem.component} is declared twice. The first declaration is read.`
    case 'dead-pattern':
      return `The pattern "${problem.pattern}" in ${problem.key} of ${problem.component} matches no Source File.`
    case 'pattern-outside-repository':
      return `The pattern "${problem.pattern}" in ${problem.key} of ${problem.component} is absolute or leaves the repository. It matches nothing.`
    case 'overlapping-components': {
      const [first, second] = problem.components
      const count = problem.files.length
      return `${first} and ${second} both claim ${count === 1 ? problem.files[0] : `${count} Source Files`}. Until one of them gives way, ${count === 1 ? 'the file is' : 'these files are'} treated as Unassigned.`
    }
    case 'empty-component':
      return `${problem.component} has neither paths nor components.`
  }
}
