import type { FileSystem } from '@adr-tool/core'
import {
  checkPicture,
  driftOf,
  driftWording,
  problemsOf,
  saidOfDrift,
  wordingOf,
  type Analysis,
  type DiagramProblem,
  type DiagramProblemCode,
  type DiagramsSaid,
  type Drift,
  type RepositoryDiagrams
} from '@adr-tool/diagrams'
import type { Structure } from '@adr-tool/structure/model'

/** A Problem of a Diagram, or of the key `diagrams` in `.arch/config.yml`, as `adr check` reports it. */
export interface ReportedDiagramProblem {
  readonly code: DiagramProblemCode
  readonly message: string
  readonly path: string
  readonly line: number
  readonly problem: DiagramProblem
}

/** A Drift of a Diagram, as `adr check` reports it: a note, which fails nothing. */
export interface ReportedDrift {
  /** The code of its sentence: `connection-perhaps-not-in-code` where it is not certain. */
  readonly code: DiagramsSaid['code']
  readonly message: string
  /** The Diagram, at the line of its connection, or of the element that uses. */
  readonly path: string
  readonly line: number
  readonly drift: Drift
}

/** The Diagrams' part of `adr check` (docs/cli.md; docs/diagrams-format.md, sections 4 and 5). */
export interface DiagramsCheck {
  /** The Diagrams there are, those that cannot be read among them. */
  readonly diagrams: readonly {
    readonly id: string
    readonly path: string
    readonly title?: string
  }[]
  /** Of the key `diagrams`, then of each Diagram: of its file, against the declaration, of its picture. */
  readonly problems: readonly ReportedDiagramProblem[]
  /** Whether the Diagrams were compared with the code: only against a declaration that can be read. */
  readonly compared: boolean
  readonly drift: readonly ReportedDrift[]
}

/**
 * Whether Drift can be found, so that the code is worth analysing: a declaration that can be
 * read, and a Diagram that shows a Component.
 */
export function diagramsNeedModel(found: RepositoryDiagrams, structure: Structure): boolean {
  return (
    comparable(structure) &&
    found.diagrams.some(
      (diagram) =>
        diagram.readable && diagram.elements.some((element) => element.kind === 'component')
    )
  )
}

const comparable = (structure: Structure): boolean =>
  structure.origin === 'declared' &&
  !structure.problems.some((problem) => problem.kind === 'unreadable-declaration')

/**
 * Check the Diagrams `found` against the declaration in `structure`, their pictures against
 * what the export would write, and — with `model`, the code's Dependencies — against the code.
 */
export async function checkDiagrams(
  fs: FileSystem,
  found: RepositoryDiagrams,
  structure: Structure,
  model: Analysis | undefined
): Promise<DiagramsCheck> {
  const problems: DiagramProblem[] = [...found.problems]
  const drift: ReportedDrift[] = []
  const compared = model !== undefined && comparable(structure)
  for (const diagram of found.diagrams) {
    if (!diagram.readable) {
      problems.push(...diagram.problems)
      continue
    }
    problems.push(...problemsOf(diagram, structure))
    const stale = await checkPicture(fs, diagram, structure)
    if (stale) problems.push(stale)
    if (!compared) continue
    // A Dependency the Diagram leaves out stands at the element that uses, or at the one used.
    const lineOf = (id: string): number | undefined =>
      diagram.elements.find((element) => element.id === id)?.line
    for (const one of driftOf(diagram, structure, model)) {
      const line =
        one.kind === 'connection-not-in-code' ? one.line : (lineOf(one.from) ?? lineOf(one.to) ?? 1)
      drift.push({
        code: saidOfDrift(one).code,
        message: driftWording(one),
        path: diagram.path,
        line,
        drift: one
      })
    }
  }
  return {
    diagrams: found.diagrams.map((diagram) => ({
      id: diagram.id,
      path: diagram.path,
      ...(diagram.readable && diagram.title !== undefined && { title: diagram.title })
    })),
    problems: problems.map((problem) => ({
      code: problem.kind,
      message: wordingOf(problem),
      path: problem.path,
      line: problem.line,
      problem
    })),
    compared,
    drift
  }
}
