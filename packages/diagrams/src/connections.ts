/**
 * The connections the code has between the Components a Diagram shows, and the Drift between
 * the Diagram and the code (docs/diagrams-format.md, section 4). Both are derived from
 * Structure's Dependencies whenever they are asked for, and never stored.
 */
import {
  edgesAmong,
  everyComponent,
  type Dependency,
  type Structure
} from '@adr-tool/structure/model'
import { connectionsOf, elementsOf, type Diagram } from './diagram'
import { englishOf, type DiagramsSaid } from './sentences'

/** What suggestions and Drift need of Structure: the declaration, and who owns which Source File. */
export type Model = Pick<Structure, 'origin' | 'components' | 'sourceFiles'>

export interface ConnectionOptions {
  /** Count test files as well. Like Structure's views, Diagrams leave them out by default. */
  readonly tests?: boolean
}

/** A connection the code has, from one shown Component to another. */
export interface SuggestedConnection {
  readonly from: string
  readonly to: string
  /** The number of distinct pairs of Source Files: the Dependencies behind it. */
  readonly weight: number
  /** Every Dependency behind it is type-only. */
  readonly typeOnly: boolean
  /** The Source File Dependencies behind it, in the order Structure gives them: of `from`, then `to`. */
  readonly dependencies: readonly Dependency[]
  /**
   * One end is the scope of a component view, not an element: the Dependencies are on the
   * scope's own Source Files, or of them, which stand at the boundary of the view.
   */
  readonly throughScope: boolean
  /**
   * The Diagram connects the two this way already. Through the scope: it connects the other
   * end, this way, with a part of the scope it shows.
   */
  readonly drawn: boolean
}

export type Drift =
  /** A connection from one shown Component to another that no Dependency stands behind. */
  | {
      readonly kind: 'connection-not-in-code'
      readonly from: string
      readonly to: string
      /** The line of the connection in the Diagram's file, from 1. */
      readonly line: number
    }
  /** A Dependency between shown Components that the Diagram does not connect. */
  | {
      readonly kind: 'dependency-not-in-diagram'
      readonly from: string
      readonly to: string
      readonly weight: number
      readonly typeOnly: boolean
      readonly dependencies: readonly Dependency[]
    }
  /**
   * A Dependency between the scope's own Source Files and a shown Component outside the scope,
   * where the Diagram connects that Component, this way, with no part of the scope.
   */
  | {
      readonly kind: 'scope-dependency-not-in-diagram'
      /** The scope, or the Component outside it. */
      readonly from: string
      readonly to: string
      readonly scope: string
      readonly weight: number
      readonly typeOnly: boolean
      readonly dependencies: readonly Dependency[]
    }

const parentOf = (id: string): string => (id.includes('/') ? id.slice(0, id.lastIndexOf('/')) : '')

/** Whether `id` is the Component `scope` or one of its parts. */
const within = (id: string, scope: string): boolean => id === scope || id.startsWith(`${scope}/`)

interface Counting {
  /** For each Source File that counts, the shown Component it counts for, or the boundary. */
  readonly counts: ReadonlyMap<string, string>
  /**
   * The scope of a component view, declared and not shown itself: its own Source Files count
   * for it, as the boundary of the view.
   */
  readonly boundary: string | undefined
}

/**
 * For each Source File, what it counts for: the deepest shown Component that contains it, or,
 * for the scope's own files, the scope as the boundary of the view. Files that count for
 * nothing are not in the map.
 */
function countingFor(diagram: Diagram, model: Model, options: ConnectionOptions): Counting {
  const declared = new Set(everyComponent(model.components).map((component) => component.id))
  const shown = new Set(
    elementsOf(diagram)
      .filter((element) => element.kind === 'component' && declared.has(element.id))
      .map((element) => element.id)
  )
  const scope = diagram.level === 'component' ? diagram.scope : undefined
  const boundary =
    scope !== undefined && declared.has(scope) && !shown.has(scope) ? scope : undefined
  const counts = new Map<string, string>()
  for (const file of model.sourceFiles) {
    if (file.component === undefined || (file.test && !options.tests)) continue
    if (file.component === boundary) {
      counts.set(file.path, boundary)
      continue
    }
    // The owner, or the nearest Component above it, that the Diagram shows.
    for (let id = file.component; id !== ''; id = parentOf(id)) {
      if (shown.has(id)) {
        counts.set(file.path, id)
        break
      }
    }
  }
  return { counts, boundary }
}

/**
 * Every connection the code has between two Components the Diagram shows, in the order of
 * `from`, then `to`, each saying whether the Diagram draws it; in a component view also those
 * between the scope's own files and the Components outside the scope. External Systems and the
 * repository have none. None on a Draft, nor while the declaration cannot be read.
 */
export function suggestConnections(
  diagram: Diagram,
  model: Model,
  dependencies: readonly Dependency[],
  options: ConnectionOptions = {}
): SuggestedConnection[] {
  if (model.origin !== 'declared') return []
  const { counts, boundary } = countingFor(diagram, model, options)
  // Each stands for the Source Files that count for it, as a node of Structure's levels does.
  const files = new Map<string, string[]>()
  for (const [file, id] of counts) files.set(id, [...(files.get(id) ?? []), file])
  const nodes = [...files].map(([id, list]) => ({ id, files: list }))

  const drawn = connectionsOf(diagram)
  const isDrawn = (from: string, to: string): boolean =>
    drawn.some((connection) =>
      from === boundary
        ? within(connection.from, boundary) && connection.to === to
        : to === boundary
          ? connection.from === from && within(connection.to, boundary)
          : connection.from === from && connection.to === to
    )
  return edgesAmong(nodes, dependencies).flatMap((edge) => {
    const throughScope = edge.from === boundary || edge.to === boundary
    // Within the scope, its own files and its parts are one: the view looks into it.
    if (throughScope && within(edge.from, boundary!) && within(edge.to, boundary!)) return []
    return [{ ...edge, throughScope, drawn: isDrawn(edge.from, edge.to) }]
  })
}

/**
 * The Drift of a Diagram: first its connections the code does not have, in the order of the
 * file; then the Dependencies it leaves out, in the order of `from`, then `to`. None on a
 * Draft, nor while the declaration cannot be read.
 */
export function driftOf(
  diagram: Diagram,
  model: Model,
  dependencies: readonly Dependency[],
  options: ConnectionOptions = {}
): Drift[] {
  if (model.origin !== 'declared') return []
  const declared = new Set(everyComponent(model.components).map((component) => component.id))
  const kinds = new Map(elementsOf(diagram).map((element) => [element.id, element.kind]))
  const isShown = (id: string): boolean => kinds.get(id) === 'component' && declared.has(id)
  const suggested = suggestConnections(diagram, model, dependencies, options)
  const inCode = new Set(suggested.map(({ from, to }) => `${from}\n${to}`))
  const { boundary } = countingFor(diagram, model, options)

  /**
   * Whether the code may have the connection through the scope's own files: it enters the
   * scope from outside where the outside depends on them, or leaves it where they depend on
   * the outside. Which part of the scope those files lead to, the suite cannot tell.
   */
  const throughScope = (from: string, to: string): boolean =>
    boundary !== undefined &&
    ((!within(from, boundary) && within(to, boundary) && inCode.has(`${from}\n${boundary}`)) ||
      (within(from, boundary) && !within(to, boundary) && inCode.has(`${boundary}\n${to}`)))

  const drift: Drift[] = []
  for (const { from, to, line } of connectionsOf(diagram)) {
    if (!isShown(from) || !isShown(to) || inCode.has(`${from}\n${to}`)) continue
    if (throughScope(from, to)) continue
    drift.push({ kind: 'connection-not-in-code', from, to, line })
  }
  for (const one of suggested) {
    if (one.drawn) continue
    const { from, to, weight, typeOnly, dependencies: behind } = one
    drift.push(
      one.throughScope
        ? {
            kind: 'scope-dependency-not-in-diagram',
            from,
            to,
            scope: boundary!,
            weight,
            typeOnly,
            dependencies: behind
          }
        : { kind: 'dependency-not-in-diagram', from, to, weight, typeOnly, dependencies: behind }
    )
  }
  return drift
}

/** What a Drift says, as a code: its kind, with the values of its sentence. */
export function saidOfDrift(drift: Drift): DiagramsSaid {
  switch (drift.kind) {
    case 'connection-not-in-code':
      return { code: drift.kind, values: { from: drift.from, to: drift.to } }
    case 'dependency-not-in-diagram':
      return { code: drift.kind, values: { from: drift.from, to: drift.to, count: drift.weight } }
    case 'scope-dependency-not-in-diagram': {
      const { from, to, scope, weight } = drift
      return { code: drift.kind, values: { from, to, scope, count: weight } }
    }
  }
}

/** What a Drift says to a person, in English. */
export const driftWording = (drift: Drift): string => englishOf(saidOfDrift(drift))
