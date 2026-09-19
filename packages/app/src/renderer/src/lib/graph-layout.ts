import type { Relation } from '@adr-tool/core'

/** The box of an ADR in the graph, and the room between boxes. */
export const NODE = { width: 184, height: 36, gapX: 52, gapY: 12, padding: 16 }

/** The room an edge takes where it passes a layer it has no ADR in, and the room between two of them. */
const WAYPOINT = { height: 8, gap: 4 }

/** How far apart two edges between the same two ADRs leave and arrive. */
const PARALLEL = 7

/** How far the line between two ADRs of one layer reaches out to the right of them. */
export const SAME_LAYER_REACH = 40

export interface GraphNode {
  readonly id: string
  /** 0 is the leftmost column: the ADRs that build on nothing. */
  readonly layer: number
  /** The top left corner. */
  readonly x: number
  readonly y: number
}

export interface GraphEdge {
  readonly relation: Relation
  /**
   * From the ADR that carries the Relation to its target: where the line leaves, the middle
   * of every layer it passes, where it arrives. Two ADRs of one layer are joined on their right.
   */
  readonly points: readonly { readonly x: number; readonly y: number }[]
  readonly sameLayer: boolean
}

export interface GraphLayout {
  readonly nodes: readonly GraphNode[]
  readonly edges: readonly GraphEdge[]
  readonly width: number
  readonly height: number
  /** ADRs that have no Relation and are not drawn. */
  readonly unrelated: number
}

/** A place in a layer: an ADR, or the waypoint of an edge that passes through. */
interface Slot {
  readonly id: string | undefined
  readonly size: number
  /** The slots this one is joined to, in the layer to the left and to the right. */
  readonly left: Slot[]
  readonly right: Slot[]
  order: number
  y: number
}

const centre = (slot: Slot): number => slot.y + slot.size / 2
const mean = (values: number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length

/**
 * A layered drawing of the Relations of one Decision Log, hand-made for what these graphs
 * are: tens of ADRs, mostly chains (docs/plan.md, decision 5).
 *
 * Left to right is "builds on": an ADR stands right of everything it supersedes, amends or
 * depends on — so a chain of supersessions reads like a time line. `relates-to` does not
 * say which of the two builds on the other, and does not decide a layer. Within a layer,
 * ADRs are ordered so that edges cross as little as a few sweeps can manage; an edge that
 * skips layers gets a waypoint in each, so it runs between the boxes and not through them.
 */
export function layoutGraph(ids: readonly string[], relations: readonly Relation[]): GraphLayout {
  const related = new Set(relations.flatMap(({ from, to }) => [from, to]))
  const shown = ids.filter((id) => related.has(id))
  const unrelated = ids.length - shown.length
  if (shown.length === 0) return { nodes: [], edges: [], width: 0, height: 0, unrelated }

  const layerOf = layersOf(shown, relations)
  const depth = shown.reduce((deepest, id) => Math.max(deepest, layerOf.get(id)!), 0) + 1
  const layers: Slot[][] = Array.from({ length: depth }, () => [])
  const slot = (id: string | undefined, layer: number): Slot => {
    const size = id === undefined ? WAYPOINT.height : NODE.height
    const made: Slot = { id, size, left: [], right: [], order: layers[layer]!.length, y: 0 }
    layers[layer]!.push(made)
    return made
  }
  const slotOf = new Map(shown.map((id) => [id, slot(id, layerOf.get(id)!)]))

  // Every edge as a run of slots from its left end to its right end, one per layer.
  const runs = relations.map((relation) => {
    const [a, b] = [layerOf.get(relation.from)!, layerOf.get(relation.to)!]
    const [left, right] = a <= b ? [relation.from, relation.to] : [relation.to, relation.from]
    const run = [slotOf.get(left)!]
    for (let layer = Math.min(a, b) + 1; layer < Math.max(a, b); layer++) {
      run.push(slot(undefined, layer))
    }
    if (a !== b) run.push(slotOf.get(right)!)
    for (let position = 1; position < run.length; position++) {
      run[position - 1]!.right.push(run[position]!)
      run[position]!.left.push(run[position - 1]!)
    }
    return { relation, run, first: Math.min(a, b), reversed: a > b, sameLayer: a === b }
  })

  orderLayers(layers)
  placeLayers(layers)

  const slots = layers.flat()
  const top = slots.reduce((least, placed) => Math.min(least, placed.y), Infinity)
  const x = (layer: number): number => NODE.padding + layer * (NODE.width + NODE.gapX)
  const y = (placed: Slot): number => placed.y - top + NODE.padding

  const nodes = shown.map((id): GraphNode => {
    const placed = slotOf.get(id)!
    return { id, layer: layerOf.get(id)!, x: x(layerOf.get(id)!), y: y(placed) }
  })

  // Two ADRs can have several Relations between them; their lines run side by side.
  const between = (relation: Relation): string => [relation.from, relation.to].sort().join('\n')
  const lanes = new Map<string, Relation[]>()
  for (const relation of relations) {
    lanes.set(between(relation), [...(lanes.get(between(relation)) ?? []), relation])
  }
  const laneOf = (relation: Relation): number => {
    const lane = lanes.get(between(relation))!
    return (lane.indexOf(relation) - (lane.length - 1) / 2) * PARALLEL
  }

  const edges = runs.map(({ relation, run, first, reversed, sameLayer }): GraphEdge => {
    const aside = laneOf(relation)
    const points = run.map((placed, position) => {
      const column = x(first + position)
      const middle = y(placed) + placed.size / 2
      // An edge leaves an ADR on the side it is going to; a waypoint is the middle of its layer.
      if (placed.id === undefined) return { x: column + NODE.width / 2, y: middle }
      const onTheRight = sameLayer || position === 0
      return { x: onTheRight ? column + NODE.width : column, y: middle + aside }
    })
    if (sameLayer) {
      const target = slotOf.get(relation.to)!
      points.push({ x: x(first) + NODE.width, y: y(target) + target.size / 2 + aside })
    }
    return { relation, points: reversed ? points.reverse() : points, sameLayer }
  })

  const bottom = slots.reduce((most, placed) => Math.max(most, y(placed) + placed.size), 0)
  const reach = runs.some((run) => run.sameLayer && run.first === depth - 1) ? SAME_LAYER_REACH : 0
  return {
    nodes,
    edges,
    width: x(depth - 1) + NODE.width + reach + NODE.padding,
    height: bottom + NODE.padding,
    unrelated
  }
}

/**
 * The layer of every ADR: 0 for one that builds on nothing, otherwise one more than the
 * highest layer it builds on. A Relation that would close a cycle is left out of this: a
 * cycle of `supersedes` is a Problem and reported as one, and the drawing has to come out
 * all the same. Without recursion: a chain can be as long as a Decision Log.
 */
function layersOf(ids: readonly string[], relations: readonly Relation[]): Map<string, number> {
  const targets = new Map<string, string[]>()
  for (const { type, from, to } of relations) {
    if (type !== 'relates-to') targets.set(from, [...(targets.get(from) ?? []), to])
  }
  const layers = new Map<string, number>()
  const visiting = new Set<string>()
  for (const start of ids) {
    const path = [start]
    while (path.length > 0) {
      const id = path.at(-1)!
      if (layers.has(id)) {
        path.pop()
        continue
      }
      visiting.add(id)
      const below = (targets.get(id) ?? []).filter((target) => !visiting.has(target))
      const unknown = below.find((target) => !layers.has(target))
      if (unknown !== undefined) {
        path.push(unknown)
        continue
      }
      layers.set(
        id,
        below.reduce((layer, target) => Math.max(layer, layers.get(target)! + 1), 0)
      )
      visiting.delete(id)
      path.pop()
    }
  }
  return layers
}

/** Sweep left to right and back a few times, each layer sorted by where its neighbours stand. */
function orderLayers(layers: Slot[][]): void {
  const sortBy = (layer: Slot[], side: 'left' | 'right'): void => {
    const weight = new Map(
      layer.map((slot) => [
        slot,
        slot[side].length > 0 ? mean(slot[side].map((neighbour) => neighbour.order)) : slot.order
      ])
    )
    layer.sort((a, b) => weight.get(a)! - weight.get(b)! || a.order - b.order)
    layer.forEach((slot, position) => (slot.order = position))
  }
  for (let sweep = 0; sweep < 4; sweep++) {
    for (let layer = 1; layer < layers.length; layer++) sortBy(layers[layer]!, 'left')
    for (let layer = layers.length - 2; layer >= 0; layer--) sortBy(layers[layer]!, 'right')
  }
}

/**
 * Give every slot its height on the page: as close to the middle of its neighbours as the
 * order of its layer allows, so that a chain is a straight line.
 */
function placeLayers(layers: Slot[][]): void {
  const gapAfter = (slot: Slot, next: Slot | undefined): number =>
    slot.id === undefined && next?.id === undefined ? WAYPOINT.gap : NODE.gapY

  const place = (layer: Slot[], side: 'left' | 'right'): void => {
    let free = Number.NEGATIVE_INFINITY
    layer.forEach((slot, position) => {
      const neighbours = slot[side]
      const wanted = neighbours.length > 0 ? mean(neighbours.map(centre)) - slot.size / 2 : slot.y
      slot.y = Math.max(wanted, free)
      free = slot.y + slot.size + gapAfter(slot, layer[position + 1])
    })
  }
  for (const layer of layers) {
    let free = 0
    layer.forEach((slot, position) => {
      slot.y = free
      free += slot.size + gapAfter(slot, layer[position + 1])
    })
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let layer = 1; layer < layers.length; layer++) place(layers[layer]!, 'left')
    for (let layer = layers.length - 2; layer >= 0; layer--) place(layers[layer]!, 'right')
  }
}
