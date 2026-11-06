/**
 * The Diagrams' part of the Problems of the repository (lib/repository-problems.ts): the
 * Problems of each Diagram, with the Repair where there is one, those of the key `diagrams` of
 * `.arch/config.yml`, and — once for every module — that `.arch/config.yml` cannot be read.
 */
import type { UnreadableConfig } from '@adr-tool/kernel'
import { hasRepair, type DiagramProblem } from '@adr-tool/diagrams'
import type { DiagramsOverview } from '../../../shared/diagrams'

/** A Problem of a Diagram, with the Diagram it opens at, and whether it has a Repair. */
export interface DiagramEntryProblem {
  readonly problem: DiagramProblem
  /** The Diagram it is about; `undefined` for one of `.arch/config.yml`. */
  readonly diagram:
    { readonly id: string; readonly path: string; readonly title?: string } | undefined
  readonly repairable: boolean
}

export type DiagramsSection =
  /** The Diagrams have not been read yet. */
  | { readonly state: 'reading' }
  | { readonly state: 'failed'; readonly reason: string }
  | {
      readonly state: 'known'
      /** The one Problem of `.arch/config.yml`, said once for every module. */
      readonly config: UnreadableConfig | undefined
      readonly entries: readonly DiagramEntryProblem[]
    }

/** What the window knows of the Diagrams of the repository: the last overview, and whether one is asked for. */
export interface DiagramsKnown {
  readonly overview: DiagramsOverview | undefined
  readonly reading: boolean
  readonly failed: string | undefined
}

export function diagramsSection({ overview, reading, failed }: DiagramsKnown): DiagramsSection {
  if (!overview) {
    return failed !== undefined && !reading
      ? { state: 'failed', reason: failed }
      : { state: 'reading' }
  }
  const declared = overview.declared.origin === 'declared' && !overview.declared.unreadable
  const entries: DiagramEntryProblem[] = [
    ...overview.problems.map((problem) => ({ problem, diagram: undefined, repairable: false })),
    ...overview.diagrams.flatMap((entry) =>
      entry.problems.map((problem) => ({
        problem,
        diagram: {
          id: entry.id,
          path: entry.path,
          ...(entry.title !== undefined && { title: entry.title })
        },
        // An element whose Component is gone is taken out only against a declaration.
        repairable: hasRepair(problem) && (problem.kind !== 'component-gone' || declared)
      }))
    )
  ]
  return { state: 'known', config: overview.config, entries }
}

/** How many Problems the section counts: the file of the settings once, and each Problem. */
export const diagramsCount = (section: DiagramsSection): number =>
  section.state === 'known' ? (section.config ? 1 : 0) + section.entries.length : 0
