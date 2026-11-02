/**
 * Cycles (docs/structure-format.md, section 4, "Cycles"): strongly connected groups with more
 * than one member, each with one round trip as its example and, among Components, the
 * weakest Dependency on it.
 */

export interface WeightedEdge {
  readonly from: string
  readonly to: string
  readonly weight: number
  readonly typeOnly: boolean
}

export interface Cycle {
  /** The IDs or paths of its members, in their order. */
  readonly members: readonly string[]
  /**
   * One round trip as the example: a shortest one, and among several the one whose sequence,
   * starting at its smallest member, sorts first. It starts there and does not repeat it.
   */
  readonly roundTrip: readonly string[]
  /**
   * The Dependency on the round trip with the lowest weight, the first such in the round
   * trip's order: the candidate for cutting. Only among the nodes of a level; among Source
   * Files every Dependency weighs one, and none is named.
   */
  readonly weakest?: { readonly from: string; readonly to: string }
  /** Every Dependency among the members is type-only: the Cycle does not exist at run time. */
  readonly typeOnly: boolean
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

export function findCycles(
  nodes: readonly string[],
  edges: readonly WeightedEdge[],
  options: { readonly weakest: boolean }
): Cycle[] {
  const successors = new Map<string, string[]>(nodes.map((node) => [node, []]))
  const byPair = new Map<string, WeightedEdge>()
  for (const edge of edges) {
    if (edge.from === edge.to || !successors.has(edge.from) || !successors.has(edge.to)) continue
    successors.get(edge.from)!.push(edge.to)
    byPair.set(`${edge.from}\n${edge.to}`, edge)
  }
  for (const list of successors.values()) list.sort(compare)

  return stronglyConnected(nodes, successors)
    .filter((group) => group.length > 1)
    .map((group): Cycle => {
      const members = [...group].sort(compare)
      const inside = new Set(members)
      const roundTrip = shortestRoundTrip(members, (node) =>
        successors.get(node)!.filter((next) => inside.has(next))
      )
      const along = roundTrip.map((from, index) =>
        byPair.get(`${from}\n${roundTrip[(index + 1) % roundTrip.length]}`)!
      )
      const lightest = Math.min(...along.map((edge) => edge.weight))
      const weakest = along.find((edge) => edge.weight === lightest)!
      const typeOnly = members.every((from) =>
        successors
          .get(from)!
          .filter((to) => inside.has(to))
          .every((to) => byPair.get(`${from}\n${to}`)!.typeOnly)
      )
      return {
        members,
        roundTrip,
        ...(options.weakest ? { weakest: { from: weakest.from, to: weakest.to } } : {}),
        typeOnly
      }
    })
    .sort((a, b) => compare(a.members[0]!, b.members[0]!))
}

/**
 * The strongly connected groups of a graph, single nodes included, by Tarjan's algorithm —
 * without recursion: a level of Source Files can be thousands deep. A group comes after every
 * group it reaches.
 */
export function stronglyConnected(
  nodes: readonly string[],
  successors: ReadonlyMap<string, readonly string[]>
): string[][] {
  let counter = 0
  const index = new Map<string, number>()
  const low = new Map<string, number>()
  const stack: string[] = []
  const onStack = new Set<string>()
  const groups: string[][] = []

  const enter = (node: string): void => {
    index.set(node, counter)
    low.set(node, counter)
    counter++
    stack.push(node)
    onStack.add(node)
  }

  for (const start of nodes) {
    if (index.has(start)) continue
    enter(start)
    const frames: { node: string; next: number }[] = [{ node: start, next: 0 }]
    while (frames.length > 0) {
      const frame = frames.at(-1)!
      const next = successors.get(frame.node)![frame.next++]
      if (next !== undefined) {
        if (!index.has(next)) {
          enter(next)
          frames.push({ node: next, next: 0 })
        } else if (onStack.has(next)) {
          low.set(frame.node, Math.min(low.get(frame.node)!, index.get(next)!))
        }
        continue
      }
      frames.pop()
      const parent = frames.at(-1)
      if (parent) low.set(parent.node, Math.min(low.get(parent.node)!, low.get(frame.node)!))
      if (low.get(frame.node) === index.get(frame.node)) {
        const group: string[] = []
        let member: string
        do {
          member = stack.pop()!
          onStack.delete(member)
          group.push(member)
        } while (member !== frame.node)
        groups.push(group)
      }
    }
  }
  return groups
}

/**
 * The example round trip of a strongly connected group, `members` in their order. Its
 * length is the shortest of any round trip in the group. Its first member is the smallest
 * that lies on a round trip of that length whose other members are all larger; from there
 * each step takes the smallest next member from which the trip can still close in time.
 */
function shortestRoundTrip(
  members: readonly string[],
  next: (node: string) => readonly string[]
): string[] {
  const previous = new Map<string, string[]>(members.map((member) => [member, []]))
  for (const from of members) for (const to of next(from)) previous.get(to)!.push(from)

  /** How many steps each member needs to reach `target`, through members not below it. */
  const stepsTo = (target: string): Map<string, number> => {
    const steps = new Map([[target, 0]])
    const queue = [target]
    for (let at = 0; at < queue.length; at++) {
      const node = queue[at]!
      for (const before of previous.get(node)!) {
        if (steps.has(before) || compare(before, target) < 0) continue
        steps.set(before, steps.get(node)! + 1)
        queue.push(before)
      }
    }
    return steps
  }
  /** The shortest round trip through `start` among members not below it, and the distances. */
  const through = (start: string): { length: number; steps: Map<string, number> } => {
    const steps = stepsTo(start)
    const lengths = next(start)
      .filter((node) => node !== start && steps.has(node))
      .map((node) => steps.get(node)! + 1)
    return { length: lengths.length > 0 ? Math.min(...lengths) : Infinity, steps }
  }

  // The shortest length overall: every round trip has a smallest member, so trying each
  // member against those not below it finds them all.
  const candidates = members.map((member) => ({ member, ...through(member) }))
  const shortest = Math.min(...candidates.map((candidate) => candidate.length))
  const { member: start, steps } = candidates.find((candidate) => candidate.length === shortest)!

  const trip = [start]
  for (let step = 1; step < shortest; step++) {
    const remaining = shortest - step
    const chosen = next(trip.at(-1)!).find(
      (node) => node !== start && steps.get(node) === remaining
    )!
    trip.push(chosen)
  }
  return trip
}
