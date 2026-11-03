/**
 * The Problems of Diagrams (docs/diagrams-format.md, section 5): inconsistencies in a Diagram,
 * or in `.arch/config.yml` where it says where the Diagrams are, that the suite detects and
 * names, each at the file and the line it is about.
 */
import type { ViewLevel } from './diagram'
import { englishOf, type DiagramsSaid } from './sentences'

/** The two ends of a connection, as it is written. */
type Ends = { readonly from: string; readonly to: string }

export type DiagramProblem = {
  /** The file the Problem is about: a Diagram, or `.arch/config.yml`. */
  readonly path: string
  /** The line of that file, from 1. */
  readonly line: number
} & (
  | { readonly kind: 'invalid-diagrams-directory' }
  | { readonly kind: 'unreadable-diagram'; readonly detail: DiagramsSaid }
  | { readonly kind: 'no-level' }
  | { readonly kind: 'unknown-level'; readonly level: string }
  | { readonly kind: 'no-scope' }
  | { readonly kind: 'scope-without-component-level'; readonly level: ViewLevel }
  | { readonly kind: 'invalid-element-id'; readonly id: string }
  | { readonly kind: 'duplicate-element'; readonly id: string }
  | { readonly kind: 'self-connection'; readonly id: string }
  | (Ends & { readonly kind: 'unknown-element'; readonly id: string })
  | (Ends & { readonly kind: 'duplicate-connection' })
  | { readonly kind: 'component-gone'; readonly component: string }
  | { readonly kind: 'unknown-scope'; readonly component: string }
  | {
      readonly kind: 'component-does-not-fit'
      readonly component: string
      readonly level: ViewLevel
      /** The scope of a component view; empty at the other levels. */
      readonly scope: string
    }
  | { readonly kind: 'repository-does-not-fit'; readonly id: string }
)

export type DiagramProblemCode = DiagramProblem['kind']

/** The Problem of a Diagram whose file cannot be read: the one thing said about it. */
export type UnreadableDiagramProblem = Extract<
  DiagramProblem,
  { readonly kind: 'unreadable-diagram' }
>

/** Every code a Problem of Diagrams can have, in the order of the specification. */
export const DIAGRAM_PROBLEM_CODES: readonly DiagramProblemCode[] = [
  'invalid-diagrams-directory',
  'unreadable-diagram',
  'no-level',
  'unknown-level',
  'no-scope',
  'scope-without-component-level',
  'invalid-element-id',
  'duplicate-element',
  'self-connection',
  'unknown-element',
  'duplicate-connection',
  'component-gone',
  'unknown-scope',
  'component-does-not-fit',
  'repository-does-not-fit'
]

/** What a Problem says, as a code: its kind, with the values of its sentence. */
export function saidOf(problem: DiagramProblem): DiagramsSaid {
  switch (problem.kind) {
    case 'unreadable-diagram':
      return { code: problem.kind, values: { path: problem.path, detail: problem.detail } }
    case 'invalid-diagrams-directory':
      return { code: problem.kind, values: { path: problem.path } }
    case 'no-level':
    case 'no-scope':
      return { code: problem.kind, values: {} }
    case 'unknown-level':
    case 'scope-without-component-level':
      return { code: problem.kind, values: { level: problem.level } }
    case 'invalid-element-id':
    case 'duplicate-element':
    case 'self-connection':
    case 'repository-does-not-fit':
      return { code: problem.kind, values: { id: problem.id } }
    case 'unknown-element':
      return { code: problem.kind, values: { from: problem.from, to: problem.to, id: problem.id } }
    case 'duplicate-connection':
      return { code: problem.kind, values: { from: problem.from, to: problem.to } }
    case 'component-gone':
    case 'unknown-scope':
      return { code: problem.kind, values: { component: problem.component } }
    case 'component-does-not-fit': {
      const { component, level, scope } = problem
      return { code: problem.kind, values: { component, level, scope } }
    }
  }
}

/** What a Problem says to a person, in English. The app and the command line say the same. */
export function wordingOf(problem: DiagramProblem): string {
  return englishOf(saidOf(problem))
}

/** Whether a Problem has a Repair. One has: an element whose Component is gone is taken out. */
export const hasRepair = (problem: DiagramProblem): boolean => problem.kind === 'component-gone'
