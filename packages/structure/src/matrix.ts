/**
 * The dependency structure matrix (docs/structure-format.md, section 5): the nodes of a level
 * in an order that leaves above the diagonal only what closes a Cycle, Components expanded
 * into the levels below them where they stood, and the cells between any two rows.
 */
import { stronglyConnected, type WeightedEdge } from './cycles'
import type { Dependency } from './dependencies'
import {
  edgesAmong,
  levelOf,
  type Level,
  type LevelEdge,
  type LevelNode,
  type LevelOptions
} from './levels'
import type { Structure } from './structure'

export interface MatrixRow {
  readonly node: LevelNode
  /** 0 for a node of the level itself; one more for each Component expanded around it. */
  readonly depth: number
  /** A Component that contains Source Files: its row can be expanded. */
  readonly expandable: boolean
}

/** A Component expanded into the rows from `first` to `last`. */
export interface MatrixGroup {
  readonly id: string
  /** The depth its row had. */
  readonly depth: number
  readonly first: number
  readonly last: number
}

/** The rows the members of a Cycle take up, at whatever level the Cycle is. */
export interface MatrixCycle {
  readonly first: number
  readonly last: number
  readonly typeOnly: boolean
}

export interface Matrix {
  readonly parent: string | undefined
  /** In their order: row i and column i are the same node. */
  readonly rows: readonly MatrixRow[]
  /** The outer before the inner. */
  readonly groups: readonly MatrixGroup[]
  /** The outer before the inner. */
  readonly cycles: readonly MatrixCycle[]
  /**
   * The cells that hold something, by the IDs of their row (`from`) and column (`to`), in
   * the order of `from`, then `to`. Never on the diagonal.
   */
  readonly cells: readonly LevelEdge[]
}

const outerFirst = (
  a: { readonly first: number; readonly last: number },
  b: { readonly first: number; readonly last: number }
): number => a.first - b.first || b.last - a.last

/**
 * The matrix of the level below `parent`, or of the top level, with the Components in
 * `expanded` expanded wherever they show up. `undefined` when no Component has that ID.
 */
export function matrixOf(
  structure: Pick<Structure, 'components' | 'sourceFiles'>,
  dependencies: readonly Dependency[],
  parent?: string,
  expanded: Iterable<string> = [],
  options: LevelOptions = {}
): Matrix | undefined {
  const top = levelOf(structure, dependencies, parent, options)
  if (top === undefined) return undefined
  const open = new Set(expanded)

  const rows: MatrixRow[] = []
  const groups: MatrixGroup[] = []
  const cycles: MatrixCycle[] = []

  const place = (level: Level, depth: number): void => {
    const byId = new Map(level.nodes.map((node) => [node.id, node]))
    const span = new Map<string, { first: number; last: number }>()
    for (const id of orderOf(
      level.nodes.map((node) => node.id),
      level.edges
    )) {
      const node = byId.get(id)!
      const first = rows.length
      const expandable = node.kind === 'component' && node.files.length > 0
      if (expandable && open.has(node.id)) {
        place(levelOf(structure, dependencies, node.id, options)!, depth + 1)
        groups.push({ id: node.id, depth, first, last: rows.length - 1 })
      } else {
        rows.push({ node, depth, expandable })
      }
      span.set(id, { first, last: rows.length - 1 })
    }
    for (const cycle of level.cycles) {
      const spans = cycle.members.map((member) => span.get(member)!)
      cycles.push({
        first: Math.min(...spans.map((each) => each.first)),
        last: Math.max(...spans.map((each) => each.last)),
        typeOnly: cycle.typeOnly
      })
    }
  }
  place(top, 0)

  return {
    parent: top.parent,
    rows,
    groups: groups.sort(outerFirst),
    cycles: cycles.sort(outerFirst),
    cells: edgesAmong(
      rows.map((row) => row.node),
      dependencies
    )
  }
}

/**
 * The nodes of a level in the order of the matrix: each after what it depends on, the
 * members of a Cycle together and placed so that what lies above the diagonal is light,
 * ties broken by the order the nodes come in.
 */
export function orderOf(nodes: readonly string[], edges: readonly WeightedEdge[]): string[] {
  const position = new Map(nodes.map((node, index) => [node, index]))
  const successors = new Map<string, string[]>(nodes.map((node) => [node, []]))
  const weights = new Map<string, Map<string, number>>(nodes.map((node) => [node, new Map()]))
  for (const { from, to, weight } of edges) {
    if (from === to || !position.has(from) || !position.has(to)) continue
    successors.get(from)!.push(to)
    weights.get(from)!.set(to, weight)
  }

  // The groups, each a Cycle or a single node, placed as soon as what they depend on is.
  const groups = stronglyConnected(nodes, successors).map((members) =>
    members.sort((a, b) => position.get(a)! - position.get(b)!)
  )
  const groupOf = new Map<string, number>()
  groups.forEach((members, index) => members.forEach((member) => groupOf.set(member, index)))
  const waitingFor = groups.map(() => new Set<number>())
  const waiting = groups.map(() => [] as number[])
  groups.forEach((members, index) => {
    for (const member of members) {
      for (const next of successors.get(member)!) {
        const other = groupOf.get(next)!
        if (other === index || waitingFor[index]!.has(other)) continue
        waitingFor[index]!.add(other)
        waiting[other]!.push(index)
      }
    }
  })

  const order: string[] = []
  const ready = new Set(
    groups.flatMap((_, index) => (waitingFor[index]!.size === 0 ? [index] : []))
  )
  while (ready.size > 0) {
    let next = -1
    for (const index of ready) {
      if (next === -1 || position.get(groups[index]![0]!)! < position.get(groups[next]![0]!)!) {
        next = index
      }
    }
    ready.delete(next)
    order.push(...inside(groups[next]!, weights))
    for (const other of waiting[next]!) {
      waitingFor[other]!.delete(next)
      if (waitingFor[other]!.size === 0) ready.add(other)
    }
  }
  return order
}

/**
 * The members of one Cycle, in the order of the level, placed one by one: the first that
 * depends on no member still to be placed, or else the one whose Dependencies from the others
 * outweigh its Dependencies on them the most.
 */
function inside(
  members: readonly string[],
  weights: ReadonlyMap<string, ReadonlyMap<string, number>>
): string[] {
  if (members.length === 1) return [...members]
  const remaining = new Set(members)
  const into = new Map(members.map((member) => [member, 0]))
  const outOf = new Map(members.map((member) => [member, 0]))
  for (const from of members) {
    for (const [to, weight] of weights.get(from)!) {
      if (!remaining.has(to)) continue
      outOf.set(from, outOf.get(from)! + weight)
      into.set(to, into.get(to)! + weight)
    }
  }

  const placed: string[] = []
  while (remaining.size > 0) {
    let next: string | undefined
    for (const member of members) {
      if (remaining.has(member) && outOf.get(member) === 0) {
        next = member
        break
      }
    }
    if (next === undefined) {
      let best = -Infinity
      for (const member of members) {
        if (!remaining.has(member)) continue
        const balance = into.get(member)! - outOf.get(member)!
        if (balance > best) {
          best = balance
          next = member
        }
      }
    }
    const chosen = next!
    remaining.delete(chosen)
    placed.push(chosen)
    // What is placed no longer weighs on the others.
    for (const [to, weight] of weights.get(chosen)!) {
      if (remaining.has(to)) into.set(to, into.get(to)! - weight)
    }
    for (const from of members) {
      const weight = weights.get(from)!.get(chosen)
      if (weight !== undefined && remaining.has(from)) outOf.set(from, outOf.get(from)! - weight)
    }
  }
  return placed
}
