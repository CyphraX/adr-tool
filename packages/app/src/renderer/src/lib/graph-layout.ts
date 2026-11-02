/** The box of a node in the graph — an ADR, a Component — and the room between boxes. */
export const NODE = { width: 184, height: 36, gapX: 52, gapY: 12, padding: 16 }

/** The room an edge takes where it passes a layer it has no ADR in, and the room between two of them. */
const WAYPOINT = { height: 8, gap: 4 }

/** How far apart two edges between the same two ADRs leave and arrive. */
const PARALLEL = 7

/** How far the line between two nodes of one layer reaches out to the right of them. */
export const SAME_LAYER_REACH = 40

/** What the layout needs to know of an edge: it points from the node that builds on the other. */
export interface LayoutEdge {
  readonly from: string
  readonly to: string
}

export interface LayoutOptions<E extends LayoutEdge> {
  /** Whether an edge decides which of its ends stands left. All of them do unless this says otherwise. */
  readonly decidesLayer?: (edge: E) => boolean
  /** Draw the nodes no edge touches as well, instead of only counting them. */
  readonly keepUnconnected?: boolean
  /** Nodes drawn even when no edge touches them: the ADR that is selected, say. */
  readonly keep?: readonly string[]
  /**
   * Nodes that share a layer, whatever their edges say among themselves: the members of a
   * Cycle. Their edges to each other are drawn as between two nodes of one layer.
   */
  readonly groups?: readonly (readonly string[])[]
}

export interface GraphNode {
  readonly id: string
  /** 0 is the leftmost column: the nodes that build on nothing. */
  readonly layer: number
  /** The top left corner. */
  readonly x: number
  readonly y: number
}

export interface GraphEdge<E extends LayoutEdge> {
  readonly edge: E
  /**
   * From the node the edge leaves to the node it points at: where the line leaves, the middle
   * of every layer it passes, where it arrives. Two nodes of one layer are joined on their right.
   */
  readonly points: readonly { readonly x: number; readonly y: number }[]
  readonly sameLayer: boolean
}

export interface GraphLayout<E extends LayoutEdge> {
  readonly nodes: readonly GraphNode[]
  readonly edges: readonly GraphEdge<E>[]
  readonly width: number
  readonly height: number
  /** Nodes that no edge touches and that are not drawn. */
  readonly unrelated: number
}

/** A place in a layer: a node, or the waypoint of an edge that passes through. */
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
 * A layered drawing, hand-made for what these graphs are: tens of nodes, mostly chains
 * (docs/plan.md, decision 5) — the Relations of a Decision Log, the Dependencies of one level
 * of Components (docs/plan-structure.md, decision 4).
 *
 * Left to right is "builds on": a node stands right of everything its edges point at — an
 * ADR right of what it supersedes, a Component right of what it depends on. An edge that
 * does not say which of the two builds on the other (`relates-to`) does not decide a layer,
 * and the members of a group share one. Within a layer, nodes are ordered so that edges
 * cross as little as a few sweeps can manage; an edge that skips layers gets a waypoint in
 * each, so it runs between the boxes and not through them.
 */
export function layoutGraph<E extends LayoutEdge>(
  ids: readonly string[],
  given: readonly E[],
  options: LayoutOptions<E> = {}
): GraphLayout<E> {
  const known = new Set(ids)
  const connections = given.filter(({ from, to }) => known.has(from) && known.has(to))
  const related = new Set(connections.flatMap(({ from, to }) => [from, to]))
  const kept = new Set(options.keep)
  const shown = options.keepUnconnected
    ? [...ids]
    : ids.filter((id) => related.has(id) || kept.has(id))
  const unrelated = ids.length - shown.length
  if (shown.length === 0) return { nodes: [], edges: [], width: 0, height: 0, unrelated }

  const decides = options.decidesLayer ?? ((): boolean => true)
  const layerOf = layersOf(
    shown,
    connections.filter((connection) => decides(connection)),
    options.groups ?? []
  )
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
  const runs = connections.map((connection) => {
    const [a, b] = [layerOf.get(connection.from)!, layerOf.get(connection.to)!]
    const [left, right] =
      a <= b ? [connection.from, connection.to] : [connection.to, connection.from]
    const run = [slotOf.get(left)!]
    for (let layer = Math.min(a, b) + 1; layer < Math.max(a, b); layer++) {
      run.push(slot(undefined, layer))
    }
    if (a !== b) run.push(slotOf.get(right)!)
    for (let position = 1; position < run.length; position++) {
      run[position - 1]!.right.push(run[position]!)
      run[position]!.left.push(run[position - 1]!)
    }
    return { connection, run, first: Math.min(a, b), reversed: a > b, sameLayer: a === b }
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

  // Two nodes can have several edges between them; their lines run side by side.
  const between = (connection: E): string => [connection.from, connection.to].sort().join('\n')
  const lanes = new Map<string, E[]>()
  for (const connection of connections) {
    lanes.set(between(connection), [...(lanes.get(between(connection)) ?? []), connection])
  }
  const laneOf = (connection: E): number => {
    const lane = lanes.get(between(connection))!
    return (lane.indexOf(connection) - (lane.length - 1) / 2) * PARALLEL
  }

  const edges = runs.map(({ connection, run, first, reversed, sameLayer }): GraphEdge<E> => {
    const aside = laneOf(connection)
    const points = run.map((placed, position) => {
      const column = x(first + position)
      const middle = y(placed) + placed.size / 2
      // An edge leaves a node on the side it is going to; a waypoint is the middle of its layer.
      if (placed.id === undefined) return { x: column + NODE.width / 2, y: middle }
      const onTheRight = sameLayer || position === 0
      return { x: onTheRight ? column + NODE.width : column, y: middle + aside }
    })
    if (sameLayer) {
      const target = slotOf.get(connection.to)!
      points.push({ x: x(first) + NODE.width, y: y(target) + target.size / 2 + aside })
    }
    return { edge: connection, points: reversed ? points.reverse() : points, sameLayer }
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
 * The layer of every node: 0 for one that builds on nothing, otherwise one more than the
 * highest layer it builds on. The members of a group stand together as one. An edge that
 * would close a cycle beyond the groups is left out of this: a cycle of `supersedes` is a
 * Problem and reported as one, and the drawing has to come out all the same. Without
 * recursion: a chain can be as long as a Decision Log.
 */
function layersOf(
  ids: readonly string[],
  connections: readonly LayoutEdge[],
  groups: readonly (readonly string[])[]
): Map<string, number> {
  const unitOf = new Map<string, string>()
  for (const group of groups) for (const member of group) unitOf.set(member, group[0]!)
  const unit = (id: string): string => unitOf.get(id) ?? id

  const targets = new Map<string, string[]>()
  for (const { from, to } of connections) {
    const [a, b] = [unit(from), unit(to)]
    if (a !== b) targets.set(a, [...(targets.get(a) ?? []), b])
  }
  const layers = new Map<string, number>()
  const visiting = new Set<string>()
  for (const start of new Set(ids.map(unit))) {
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
  return new Map(ids.map((id) => [id, layers.get(unit(id))!]))
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

/** How far a curve reaches out before it turns. */
const BEND = NODE.gapX / 2

/** The line of an edge, as SVG: level where it leaves, arrives and passes a layer, curved in between. */
export function pathOf({ points, sameLayer }: GraphEdge<LayoutEdge>): string {
  const [start, ...rest] = points
  if (!start) return ''
  if (sameLayer) {
    const end = rest[0]!
    // A curve reaches three quarters as far as its control points.
    const reach = (SAME_LAYER_REACH * 4) / 3 - 4
    return `M${start.x} ${start.y}C${start.x + reach} ${start.y} ${end.x + reach} ${end.y} ${end.x} ${end.y}`
  }
  const direction = Math.sign(rest.at(-1)!.x - start.x)
  let path = `M${start.x} ${start.y}`
  let from = start
  rest.forEach((point, position) => {
    const passing = position < rest.length - 1
    // A waypoint is the middle of its layer: the line crosses the whole layer at that height.
    const to = passing ? { x: point.x - (direction * NODE.width) / 2, y: point.y } : point
    path += `C${from.x + direction * BEND} ${from.y} ${to.x - direction * BEND} ${to.y} ${to.x} ${to.y}`
    from = passing ? { x: point.x + (direction * NODE.width) / 2, y: point.y } : to
    if (passing) path += `L${from.x} ${from.y}`
  })
  return path
}

/**
 * What the Relations graph draws of a Decision Log: the Relations of the types that are
 * shown, the ADRs of other logs that those lead to or come from, and the log's own ADRs. Of
 * these, the layout leaves out the ones that no Relation shown touches, unless one is kept.
 */
export function relationsShown<R extends LayoutEdge & { readonly type: string }>(
  own: readonly string[],
  guests: readonly string[],
  relations: readonly R[],
  types: readonly string[]
): { ids: string[]; relations: R[] } {
  const shown = relations.filter((relation) => types.includes(relation.type))
  const touched = new Set(shown.flatMap(({ from, to }) => [from, to]))
  return { ids: [...guests.filter((guest) => touched.has(guest)), ...own], relations: shown }
}

/** How far the drawing can be made smaller and larger, and how much one step does. */
export const ZOOM = { min: 0.1, max: 2, step: 1.25 }

/** A scale within the limits. */
export function clampScale(scale: number): number {
  return Math.min(ZOOM.max, Math.max(ZOOM.min, scale))
}

/**
 * One step larger (1) or smaller (-1), to a whole percent: steps back and forth meet again,
 * and 100 % is on the way.
 */
export function stepScale(scale: number, direction: 1 | -1): number {
  return clampScale(Math.round(scale * ZOOM.step ** direction * 100) / 100)
}

/** The scale after a turn of the wheel, as smooth as the wheel or the trackpad turns. */
export function wheelScale(scale: number, deltaY: number, deltaMode = 0): number {
  // A wheel that counts in lines turns by about 40 pixels a line.
  const pixels = deltaMode === 1 ? deltaY * 40 : deltaY
  return clampScale(scale * Math.exp(-pixels / 500))
}

/** The scale at which all of a drawing fits a pane: never larger than as drawn. */
export function fitScale(
  drawing: { readonly width: number; readonly height: number },
  pane: { readonly width: number; readonly height: number }
): number {
  if (drawing.width <= 0 || drawing.height <= 0) return 1
  const fits = Math.min(1, pane.width / drawing.width, pane.height / drawing.height)
  return clampScale(Math.floor(fits * 100) / 100)
}

/**
 * Where a pane scrolls to when the scale of the drawing in it changes from `from` to `to`, so
 * that the point at `at` — measured from the pane's top left corner, under the cursor —
 * stays where it is.
 */
export function scrollAfterZoom(
  scroll: { readonly left: number; readonly top: number },
  at: { readonly x: number; readonly y: number },
  from: number,
  to: number
): { left: number; top: number } {
  return {
    left: Math.max(0, ((scroll.left + at.x) / from) * to - at.x),
    top: Math.max(0, ((scroll.top + at.y) / from) * to - at.y)
  }
}
