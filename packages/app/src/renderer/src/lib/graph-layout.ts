import type { Relation } from '@adr-tool/core'

/** The box of an ADR in the graph, and the room between boxes. */
export const NODE = { width: 184, height: 36, gapX: 52, gapY: 12, padding: 16 }

/** The room an edge takes where it passes a layer it has no ADR in. */
const WAYPOINT_HEIGHT = 10

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
  readonly from: string
  readonly to: string
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
 * depends on — so a chain of supersessions reads like a time line. `relates-to` says
 * nothing about order and does not decide a layer. Within a layer, ADRs are ordered so
 * that edges cross as little as a few sweeps can manage; an edge that skips layers gets a
 * waypoint in each, so it runs between the boxes and not through them.
 */
export function layoutGraph(ids: readonly string[], relations: readonly Relation[]): GraphLayout {
  const related = new Set(relations.flatMap(({ from, to }) => [from, to]))
  const shown = ids.filter((id) => related.has(id))
  const unrelated = ids.length - shown.length
  if (shown.length === 0) return { nodes: [], edges: [], width: 0, height: 0, unrelated }

  const layerOf = layersOf(shown, relations)
  const depth = Math.max(...layerOf.values()) + 1
  const layers: Slot[][] = Array.from({ length: depth }, () => [])
  const slot = (id: string | undefined, layer: number): Slot => {
    const size = id === undefined ? WAYPOINT_HEIGHT : NODE.height
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
    return { relation, run, reversed: a > b, sameLayer: a === b }
  })

  orderLayers(layers)
  placeLayers(layers)

  const top = Math.min(...layers.flat().map((placed) => placed.y))
  const x = (layer: number): number => NODE.padding + layer * (NODE.width + NODE.gapX)
  const y = (placed: Slot): number => placed.y - top + NODE.padding

  const nodes = shown.map((id): GraphNode => {
    const placed = slotOf.get(id)!
    return { id, layer: layerOf.get(id)!, x: x(layerOf.get(id)!), y: y(placed) }
  })
  const edges = runs.map(({ relation, run, reversed, sameLayer }): GraphEdge => {
    const first = layerOf.get(sameLayer || !reversed ? relation.from : relation.to)!
    const points = run.map((placed, position) => {
      const column = x(first + position)
      const middle = y(placed) + placed.size / 2
      // An edge leaves an ADR on the side it is going to; a waypoint is the middle of its layer.
      if (placed.id === undefined) return { x: column + NODE.width / 2, y: middle }
      const onTheRight = sameLayer || position === 0
      return { x: onTheRight ? column + NODE.width : column, y: middle }
    })
    if (sameLayer) {
      const target = slotOf.get(relation.to)!
      points.push({ x: x(first) + NODE.width, y: y(target) + target.size / 2 })
    }
    return {
      relation,
      from: relation.from,
      to: relation.to,
      points: reversed ? points.reverse() : points,
      sameLayer
    }
  })

  const bottom = Math.max(...layers.flat().map((placed) => y(placed) + placed.size))
  return {
    nodes,
    edges,
    width: x(depth - 1) + NODE.width + NODE.padding,
    height: bottom + NODE.padding,
    unrelated
  }
}

/**
 * The layer of every ADR: 0 for one that builds on nothing, otherwise one more than the
 * highest layer it builds on. A Relation that would close a circle is left out of this —
 * the circle is a Problem, and the drawing has to come out all the same.
 */
function layersOf(ids: readonly string[], relations: readonly Relation[]): Map<string, number> {
  const targets = new Map<string, string[]>()
  for (const { type, from, to } of relations) {
    if (type !== 'relates-to' && from !== to) targets.set(from, [...(targets.get(from) ?? []), to])
  }
  const layers = new Map<string, number>()
  const visiting = new Set<string>()
  const layerOf = (id: string): number => {
    const known = layers.get(id)
    if (known !== undefined) return known
    visiting.add(id)
    const below = (targets.get(id) ?? []).filter((target) => !visiting.has(target)).map(layerOf)
    visiting.delete(id)
    const layer = below.length === 0 ? 0 : Math.max(...below) + 1
    layers.set(id, layer)
    return layer
  }
  ids.forEach(layerOf)
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
  const place = (layer: Slot[], side: 'left' | 'right' | undefined): void => {
    let next = Number.NEGATIVE_INFINITY
    for (const slot of layer) {
      const neighbours = side === undefined ? [] : slot[side]
      const wanted = neighbours.length > 0 ? mean(neighbours.map(centre)) - slot.size / 2 : slot.y
      slot.y = Math.max(wanted, next)
      next = slot.y + slot.size + NODE.gapY
    }
  }
  layers.forEach((layer) => {
    layer.forEach((slot, position) => (slot.y = position * (NODE.height + NODE.gapY)))
  })
  for (let pass = 0; pass < 2; pass++) {
    for (let layer = 1; layer < layers.length; layer++) place(layers[layer]!, 'left')
    for (let layer = layers.length - 2; layer >= 0; layer--) place(layers[layer]!, 'right')
  }
}
