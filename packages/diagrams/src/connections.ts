/**
 * The connections the code has between the Components a Diagram shows, and the Drift between
 * the Diagram and the code (docs/diagrams-format.md, section 4). Both are derived from
 * Structure's Dependencies whenever they are asked for, and never stored.
 */
import { everyComponent, type Dependency, type Structure } from '@adr-tool/structure/model'
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
  /** The Source File Dependencies behind it, in the order of their paths. */
  readonly dependencies: readonly Dependency[]
  /** The Diagram connects the two this way already. */
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

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/**
 * For each Source File, the shown Component it counts for: the deepest shown one that contains
 * it. Files no shown Component contains are not in the map.
 */
function countingFor(
  diagram: Diagram,
  model: Model,
  options: ConnectionOptions
): Map<string, string> {
  const declared = new Set(everyComponent(model.components).map((component) => component.id))
  const shown = new Set(
    elementsOf(diagram)
      .filter((element) => element.kind === 'component' && declared.has(element.id))
      .map((element) => element.id)
  )
  const counts = new Map<string, string>()
  for (const file of model.sourceFiles) {
    if (file.component === undefined || (file.test && !options.tests)) continue
    // The owner, or the nearest Component above it, that the Diagram shows.
    for (
      let id = file.component;
      id !== '';
      id = id.includes('/') ? id.slice(0, id.lastIndexOf('/')) : ''
    ) {
      if (shown.has(id)) {
        counts.set(file.path, id)
        break
      }
    }
  }
  return counts
}

/**
 * Every connection the code has between two Components the Diagram shows, in the order of
 * `from`, then `to`, each saying whether the Diagram draws it. External Systems and the
 * repository have none. None on a Draft, nor while the declaration cannot be read.
 */
export function suggestConnections(
  diagram: Diagram,
  model: Model,
  dependencies: readonly Dependency[],
  options: ConnectionOptions = {}
): SuggestedConnection[] {
  if (model.origin !== 'declared') return []
  const counts = countingFor(diagram, model, options)
  const behind = new Map<string, { from: string; to: string; dependencies: Dependency[] }>()
  for (const dependency of dependencies) {
    const from = counts.get(dependency.from)
    const to = counts.get(dependency.to)
    if (from === undefined || to === undefined || from === to) continue
    const key = `${from}\n${to}`
    const found = behind.get(key) ?? { from, to, dependencies: [] }
    found.dependencies.push(dependency)
    behind.set(key, found)
  }
  const drawn = new Set(connectionsOf(diagram).map(({ from, to }) => `${from}\n${to}`))
  return [...behind.values()]
    .map(({ from, to, dependencies: list }): SuggestedConnection => ({
      from,
      to,
      weight: list.length,
      typeOnly: list.every((dependency) => dependency.typeOnly),
      dependencies: [...list].sort((a, b) => compare(a.from, b.from) || compare(a.to, b.to)),
      drawn: drawn.has(`${from}\n${to}`)
    }))
    .sort((a, b) => compare(a.from, b.from) || compare(a.to, b.to))
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

  const drift: Drift[] = []
  for (const { from, to, line } of connectionsOf(diagram)) {
    if (isShown(from) && isShown(to) && !inCode.has(`${from}\n${to}`)) {
      drift.push({ kind: 'connection-not-in-code', from, to, line })
    }
  }
  for (const { from, to, weight, typeOnly, dependencies: behind, drawn } of suggested) {
    if (!drawn) {
      drift.push({
        kind: 'dependency-not-in-diagram',
        from,
        to,
        weight,
        typeOnly,
        dependencies: behind
      })
    }
  }
  return drift
}

/** What a Drift says, as a code: its kind, with the values of its sentence. */
export function saidOfDrift(drift: Drift): DiagramsSaid {
  return drift.kind === 'connection-not-in-code'
    ? { code: drift.kind, values: { from: drift.from, to: drift.to } }
    : { code: drift.kind, values: { from: drift.from, to: drift.to, count: drift.weight } }
}

/** What a Drift says to a person, in English. */
export const driftWording = (drift: Drift): string => englishOf(saidOfDrift(drift))
