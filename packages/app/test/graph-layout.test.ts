import { describe, expect, it } from 'vitest'
import type { Relation, RelationType } from '@adr-tool/core'
import { NODE, layoutGraph, type GraphLayout } from '../src/renderer/src/lib/graph-layout'

const relation = (from: string, type: RelationType, to: string): Relation => ({
  from,
  to,
  type,
  state: 'in-effect'
})

const at = (layout: GraphLayout, id: string) => layout.nodes.find((node) => node.id === id)!
const layerOf = (layout: GraphLayout, id: string): number => at(layout, id).layer

describe('the layout of the Relations graph', () => {
  it('reads from left to right: what a decision builds on, replaces or refines stands left of it', () => {
    const layout = layoutGraph(
      ['1', '2', '3', '4'],
      [
        relation('2', 'supersedes', '1'),
        relation('3', 'supersedes', '2'),
        relation('4', 'amends', '3')
      ]
    )
    expect(['1', '2', '3', '4'].map((id) => layerOf(layout, id))).toEqual([0, 1, 2, 3])
    const xs = ['1', '2', '3', '4'].map((id) => at(layout, id).x)
    expect([...xs].sort((a, b) => a - b)).toEqual(xs)
    // A chain is a straight line.
    expect(new Set(['1', '2', '3', '4'].map((id) => at(layout, id).y)).size).toBe(1)
  })

  it('leaves out the ADRs that have no Relation, and says how many', () => {
    const layout = layoutGraph(['1', '2', '3'], [relation('2', 'depends-on', '1')])
    expect(layout.nodes.map((node) => node.id)).toEqual(['1', '2'])
    expect(layout.unrelated).toBe(1)
    expect(layoutGraph(['1'], [])).toMatchObject({ nodes: [], edges: [], unrelated: 1 })
  })

  it('leads an edge that skips a layer around the ADRs in between', () => {
    const layout = layoutGraph(
      ['1', '2', '3'],
      [
        relation('2', 'supersedes', '1'),
        relation('3', 'depends-on', '2'),
        relation('3', 'depends-on', '1')
      ]
    )
    const long = layout.edges.find((edge) => edge.from === '3' && edge.to === '1')!
    const short = layout.edges.find((edge) => edge.from === '3' && edge.to === '2')!
    expect(short.points).toHaveLength(2)
    expect(long.points).toHaveLength(3)
    // Its waypoint has a place of its own in the middle layer: not where ADR 2 is.
    const [, waypoint] = long.points
    const two = at(layout, '2')
    expect(waypoint!.y < two.y || waypoint!.y > two.y + NODE.height).toBe(true)
  })

  it('does not let relates-to decide what is left and what is right', () => {
    const layout = layoutGraph(['1', '2'], [relation('2', 'relates-to', '1')])
    expect(layout.nodes.map((node) => node.layer)).toEqual([0, 0])
    expect(layout.edges).toHaveLength(1)
  })

  it('survives Relations that go in a circle', () => {
    const layout = layoutGraph(
      ['1', '2', '3'],
      [
        relation('1', 'supersedes', '2'),
        relation('2', 'supersedes', '3'),
        relation('3', 'supersedes', '1')
      ]
    )
    expect(layout.nodes).toHaveLength(3)
    expect(layout.edges).toHaveLength(3)
  })

  it('orders a layer so that edges do not cross where they need not', () => {
    // By ID, 3 stands above 4 — but 3 builds on 2 and 4 on 1.
    const layout = layoutGraph(
      ['1', '2', '3', '4'],
      [relation('3', 'depends-on', '2'), relation('4', 'depends-on', '1')]
    )
    expect(at(layout, '1').y).toBeLessThan(at(layout, '2').y)
    expect(at(layout, '4').y).toBeLessThan(at(layout, '3').y)
  })

  it('never puts two ADRs on top of each other, and fits them all in', () => {
    const ids = Array.from({ length: 40 }, (_, index) => String(index + 1))
    const relations = ids.flatMap((id, index) =>
      [index - 1, index - 3, index - 7]
        .filter((target) => target >= 0 && (index + target) % 3 !== 0)
        .map((target) => relation(id, target % 2 ? 'depends-on' : 'supersedes', ids[target]!))
    )
    const layout = layoutGraph(ids, relations)
    for (const a of layout.nodes) {
      expect(a.x + NODE.width).toBeLessThanOrEqual(layout.width)
      expect(a.y + NODE.height).toBeLessThanOrEqual(layout.height)
      for (const b of layout.nodes) {
        if (a === b || a.layer !== b.layer) continue
        expect(Math.abs(a.y - b.y)).toBeGreaterThanOrEqual(NODE.height)
      }
    }
    expect(layout.edges).toHaveLength(relations.length)
  })
})
