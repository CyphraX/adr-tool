/**
 * Propagation cost (docs/structure-format.md, section 5): how much of a level a change to one
 * of its nodes may reach, on average, through the Dependencies among them — the density of the
 * transitive closure of the level's Dependencies (MacCormack, Rusnak and Baldwin, 2006), here
 * without the diagonal: a node does not count as reaching itself.
 */
import type { Level } from './levels'

/**
 * The share of ordered pairs of distinct nodes of the level of which the first reaches the
 * second through Dependencies of the level: 0 when nothing depends on anything, 1 when every
 * node reaches every other. `(unassigned)` takes no part, as in Cycles; `undefined` for a level
 * of fewer than two nodes.
 */
export function propagationCostOf(level: Pick<Level, 'nodes' | 'edges'>): number | undefined {
  const nodes = level.nodes.filter((node) => node.kind !== 'unassigned')
  if (nodes.length < 2) return undefined
  const index = new Map(nodes.map((node, at) => [node.id, at]))
  const out: number[][] = nodes.map(() => [])
  for (const edge of level.edges) {
    const from = index.get(edge.from)
    const to = index.get(edge.to)
    if (from !== undefined && to !== undefined) out[from]!.push(to)
  }
  let reached = 0
  for (let start = 0; start < nodes.length; start++) {
    const seen = new Set([start])
    const waiting = [start]
    while (waiting.length > 0) {
      for (const next of out[waiting.pop()!]!) {
        if (seen.has(next)) continue
        seen.add(next)
        waiting.push(next)
      }
    }
    reached += seen.size - 1
  }
  return reached / (nodes.length * (nodes.length - 1))
}
