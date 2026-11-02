import { describe, expect, it } from 'vitest'
import { findCycles, type WeightedEdge } from '../src/cycles'

/** Edges written as `a>b:3`, weight 1 unless given; `a>b~` is type-only. */
const graph = (...written: string[]): { nodes: string[]; edges: WeightedEdge[] } => {
  const edges = written.map((text) => {
    const [, from, to, weight, type] = /^(\w+)>(\w+)(?::(\d+))?(~)?$/.exec(text)!
    return { from: from!, to: to!, weight: Number(weight ?? 1), typeOnly: type === '~' }
  })
  const nodes = [...new Set(edges.flatMap((edge) => [edge.from, edge.to]))].sort()
  return { nodes, edges }
}

const cycles = (...written: string[]) => {
  const { nodes, edges } = graph(...written)
  return findCycles(nodes, edges, { weakest: true })
}

describe('Cycles (docs/structure-format.md, section 4)', () => {
  it('are the strongly connected groups with more than one member, and nothing else', () => {
    const found = cycles('a>b', 'b>a', 'b>c', 'c>c', 'd>e', 'e>f', 'f>d', 'g>d')
    expect(found.map((cycle) => cycle.members)).toEqual([
      ['a', 'b'],
      ['d', 'e', 'f']
    ])
  })

  it('are reported as one group, not as the round trips inside it', () => {
    const found = cycles('a>b', 'b>a', 'b>c', 'c>b', 'c>d', 'd>c')
    expect(found).toHaveLength(1)
    expect(found[0]!.members).toEqual(['a', 'b', 'c', 'd'])
  })

  it('show a shortest round trip, also where it does not pass the smallest member', () => {
    const [cycle] = cycles('a>b', 'b>c', 'c>a', 'c>d', 'd>c')
    expect(cycle!.members).toEqual(['a', 'b', 'c', 'd'])
    expect(cycle!.roundTrip).toEqual(['c', 'd'])
  })

  it('among several shortest round trips, show the one that sorts first from its smallest member', () => {
    expect(cycles('a>c', 'c>a', 'a>b', 'b>a')[0]!.roundTrip).toEqual(['a', 'b'])
    // Three of length two; the one through the smallest member sorts first.
    expect(cycles('c>d', 'd>c', 'b>c', 'c>b', 'a>b', 'b>a')[0]!.roundTrip).toEqual(['a', 'b'])
    // Two of length three through a: a b d before a c d.
    expect(cycles('a>c', 'c>d', 'd>a', 'a>b', 'b>d')[0]!.roundTrip).toEqual(['a', 'b', 'd'])
  })

  it('take the smallest next member only where the trip can still close in time', () => {
    // From a, b is smaller than c, but the trip through b is longer.
    const [cycle] = cycles('a>b', 'b>e', 'e>f', 'f>a', 'a>c', 'c>a')
    expect(cycle!.roundTrip).toEqual(['a', 'c'])
  })

  it('name the lightest Dependency on the round trip as the weakest, the first of several', () => {
    expect(cycles('a>b:5', 'b>c:2', 'c>a:7')[0]!.weakest).toEqual({ from: 'b', to: 'c' })
    expect(cycles('a>b:2', 'b>c:2', 'c>a:2')[0]!.weakest).toEqual({ from: 'a', to: 'b' })
    // The closing step counts like any other.
    expect(cycles('a>b:3', 'b>a:1')[0]!.weakest).toEqual({ from: 'b', to: 'a' })
  })

  it('name no weakest Dependency where every Dependency weighs one', () => {
    const { nodes, edges } = graph('a>b', 'b>a')
    expect(findCycles(nodes, edges, { weakest: false })[0]).not.toHaveProperty('weakest')
  })

  it('are marked when every Dependency among the members is type-only', () => {
    expect(cycles('a>b~', 'b>a~')[0]!.typeOnly).toBe(true)
    expect(cycles('a>b~', 'b>a')[0]!.typeOnly).toBe(false)
    // An edge off the round trip, inside the group, counts as well.
    expect(cycles('a>b~', 'b>a~', 'b>c~', 'c>b', 'c>a~')[0]!.typeOnly).toBe(false)
  })

  it('leave out nodes and edges that are not given as nodes of the level', () => {
    const { edges } = graph('a>b', 'b>a', 'b>u', 'u>a')
    expect(findCycles(['a', 'u'], edges, { weakest: true })).toEqual([])
  })

  it('are found in a group thousands of members deep', () => {
    const size = 5000
    const names = Array.from({ length: size }, (_, i) => `f${String(i).padStart(5, '0')}`)
    const edges = names.map((from, i) => ({
      from,
      to: names[(i + 1) % size]!,
      weight: 1,
      typeOnly: false
    }))
    const [cycle] = findCycles(names, edges, { weakest: false })
    expect(cycle!.members).toHaveLength(size)
    expect(cycle!.roundTrip).toHaveLength(size)
    expect(cycle!.roundTrip[0]).toBe('f00000')
  })
})
