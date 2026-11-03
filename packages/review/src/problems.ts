import { englishOf, type ReviewSaid } from './sentences'

/**
 * The Problems of Review (docs/review-format.md, section 6): what the suite finds wrong with
 * the Annotations of a repository, their Replies and the key that says where they are. `path`
 * is the file a Problem is about; `annotation` the ID of the Annotation, where it is about one.
 * That `.arch/config.yml` cannot be read at all is the kernel's Problem, said once for every
 * module (docs/configuration.md).
 */
export type ReviewProblem =
  /** The key `annotations` of `.arch/config.yml` is no directory inside the repository. */
  | {
      readonly kind: 'invalid-annotations-directory'
      readonly path: string
      /** The line of the key, from 1. */
      readonly line: number
    }
  | {
      readonly kind: 'unreadable-annotation' | 'unreadable-reply'
      readonly path: string
      readonly annotation: string
      readonly detail: ReviewSaid
    }
  | {
      readonly kind: 'invalid-type' | 'invalid-state'
      readonly path: string
      readonly annotation: string
      readonly value: string
    }
  | {
      readonly kind: 'invalid-key'
      readonly path: string
      readonly annotation: string
      readonly key: string
      readonly detail: ReviewSaid
    }
  | {
      readonly kind: 'no-anchor' | 'no-quote'
      readonly path: string
      readonly annotation: string
    }
  | {
      readonly kind: 'invalid-anchor'
      readonly path: string
      readonly annotation: string
      readonly detail: ReviewSaid
    }
  | {
      readonly kind: 'quote-does-not-match-lines'
      readonly path: string
      readonly annotation: string
      readonly quoted: number
      readonly lines: string
      readonly count: number
    }
  /** `cites` names no ADR of the repository. Its Repair takes the item out. */
  | {
      readonly kind: 'unknown-adr'
      readonly path: string
      readonly annotation: string
      readonly adr: string
    }
  /** `cites` names an ADR by a bare ID that several Decision Logs have. */
  | {
      readonly kind: 'ambiguous-adr'
      readonly path: string
      readonly annotation: string
      readonly adr: string
      readonly candidates: readonly string[]
    }
  /** The Anchor cannot be found again. No Repair: the Annotation is attached again by hand. */
  | {
      readonly kind: 'orphaned'
      readonly path: string
      readonly annotation: string
      /** The Source File the Anchor names, and its lines. */
      readonly source: string
      readonly lines: string
      /** Whether the Source File, or a file it was renamed to, is there at all. */
      readonly file: 'there' | 'gone'
    }
  | {
      readonly kind: 'replies-without-annotation'
      /** The directory of the Replies. */
      readonly path: string
      readonly annotation: string
    }

/** The codes of Review's Problems: a code is a Problem's kind. */
export const REVIEW_PROBLEM_CODES = [
  'invalid-annotations-directory',
  'unreadable-annotation',
  'invalid-type',
  'invalid-state',
  'invalid-key',
  'no-anchor',
  'invalid-anchor',
  'no-quote',
  'quote-does-not-match-lines',
  'unknown-adr',
  'ambiguous-adr',
  'orphaned',
  'unreadable-reply',
  'replies-without-annotation'
] as const satisfies readonly ReviewProblem['kind'][]

/** What a Problem says, as a code: its kind, with the values of its sentence. */
export function saidOf(problem: ReviewProblem): ReviewSaid {
  switch (problem.kind) {
    case 'unreadable-annotation':
    case 'unreadable-reply':
    case 'invalid-anchor':
      return { code: problem.kind, values: { path: problem.path, detail: problem.detail } }
    case 'invalid-annotations-directory':
      return { code: problem.kind, values: { path: problem.path } }
    case 'invalid-type':
    case 'invalid-state':
      return { code: problem.kind, values: { path: problem.path, value: problem.value } }
    case 'invalid-key':
      return {
        code: problem.kind,
        values: { path: problem.path, key: problem.key, detail: problem.detail }
      }
    case 'no-anchor':
    case 'no-quote':
      return { code: problem.kind, values: { path: problem.path } }
    case 'quote-does-not-match-lines': {
      const { path, quoted, lines, count } = problem
      return { code: problem.kind, values: { path, quoted, lines, count } }
    }
    case 'unknown-adr':
      return { code: problem.kind, values: { path: problem.path, adr: problem.adr } }
    case 'ambiguous-adr': {
      const { path, adr, candidates } = problem
      return { code: problem.kind, values: { path, adr, candidates } }
    }
    case 'orphaned': {
      const { annotation, source, lines, file } = problem
      return { code: problem.kind, values: { annotation, path: source, lines, file } }
    }
    case 'replies-without-annotation':
      return { code: problem.kind, values: { path: problem.path, annotation: problem.annotation } }
  }
}

/** What a Problem says to a person, in English. The window words its code. */
export function wordingOf(problem: ReviewProblem): string {
  return englishOf(saidOf(problem))
}

/** Whether a Problem has a Repair: only a Trace to an ADR that does not exist. */
export function hasRepair(problem: ReviewProblem): boolean {
  return problem.kind === 'unknown-adr'
}
