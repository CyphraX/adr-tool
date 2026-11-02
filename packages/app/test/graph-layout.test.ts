import { describe, expect, it } from 'vitest'
import type { Relation, RelationType } from '@adr-tool/core'
import {
  NODE,
  SAME_LAYER_REACH,
  ZOOM,
  fitScale,
  layoutGraph as layoutLayers,
  relationsShown,
  scrollAfterZoom,
  stepScale,
  wheelScale,
  type GraphLayout,
  type LayoutEdge
} from '../src/renderer/src/lib/graph-layout'

const relation = (from: string, type: RelationType, to: string): Relation => ({
  from,
  to,
  type,
  state: 'in-effect'
})

/** As the Relations graph lays a Decision Log out: `relates-to` does not decide a layer. */
const layoutGraph = (ids: readonly string[], relations: readonly Relation[]) =>
  layoutLayers(ids, relations, { decidesLayer: (relation) => relation.type !== 'relates-to' })

const at = (layout: GraphLayout<LayoutEdge>, id: string) =>
  layout.nodes.find((node) => node.id === id)!
const layerOf = (layout: GraphLayout<LayoutEdge>, id: string): number => at(layout, id).layer

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
    const long = layout.edges.find(({ edge }) => edge.from === '3' && edge.to === '1')!
    const short = layout.edges.find(({ edge }) => edge.from === '3' && edge.to === '2')!
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
    // The line between two ADRs of one layer reaches out to the right: there is room for it.
    expect(layout.width).toBe(NODE.padding * 2 + NODE.width + SAME_LAYER_REACH)
  })

  it('draws every edge from the ADR that carries the Relation to its target', () => {
    const layout = layoutGraph(
      ['1', '2', '3'],
      [
        relation('2', 'supersedes', '1'),
        relation('3', 'depends-on', '2'),
        relation('1', 'relates-to', '3'),
        relation('3', 'relates-to', '1')
      ]
    )
    for (const { edge: drawn, points } of layout.edges) {
      const [from, to] = [at(layout, drawn.from), at(layout, drawn.to)]
      const near = (point: { x: number }, node: { x: number }): boolean =>
        point.x >= node.x && point.x <= node.x + NODE.width
      expect(near(points[0]!, from), `${drawn.from} → ${drawn.to} leaves`).toBe(true)
      expect(near(points.at(-1)!, to), `${drawn.from} → ${drawn.to} arrives`).toBe(true)
    }
  })

  it('draws two Relations between the same two ADRs side by side, not on top of each other', () => {
    const layout = layoutGraph(
      ['1', '2'],
      [
        relation('2', 'supersedes', '1'),
        relation('2', 'depends-on', '1'),
        relation('1', 'relates-to', '2')
      ]
    )
    const starts = layout.edges.map(({ points, edge: drawn }) =>
      drawn.from === '2' ? points[0]!.y : points.at(-1)!.y
    )
    expect(new Set(starts).size).toBe(3)
  })

  it('takes a chain as long as a Decision Log can be, whichever end it starts at', () => {
    const ids = Array.from({ length: 6000 }, (_, index) => String(index))
    const chain = ids.slice(1).map((id, index) => relation(ids[index]!, 'depends-on', id))
    expect(layoutGraph(ids, chain).nodes).toHaveLength(6000)
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

describe('the Relations graph filtered by Relation type', () => {
  const relations = [
    relation('2', 'supersedes', '1'),
    relation('3', 'depends-on', '2'),
    relation('4', 'relates-to', '1'),
    relation('5', 'amends', 'docs/decisions/0001-a'),
    relation('docs/decisions/0002-b', 'depends-on', '5')
  ]
  const own = ['1', '2', '3', '4', '5']
  const guests = ['docs/decisions/0001-a', 'docs/decisions/0002-b']
  const drawn = (types: RelationType[], selected?: string) => {
    const shown = relationsShown(own, guests, relations, types)
    const layout = layoutLayers(shown.ids, shown.relations, {
      decidesLayer: (one) => one.type !== 'relates-to',
      keep: selected === undefined ? [] : [selected]
    })
    return {
      ids: layout.nodes.map((node) => node.id).sort(),
      edges: layout.edges.length,
      unrelated: layout.unrelated
    }
  }

  it('draws every Relation, and the ADRs of other logs they lead to, when every type is shown', () => {
    expect(drawn(['supersedes', 'amends', 'depends-on', 'relates-to'])).toEqual({
      ids: ['1', '2', '3', '4', '5', ...guests].sort(),
      edges: 5,
      unrelated: 0
    })
  })

  it('leaves out the Relations of a type that is not shown, and the ADRs left without one', () => {
    expect(drawn(['supersedes'])).toEqual({ ids: ['1', '2'], edges: 1, unrelated: 3 })
    // An ADR of another log is only drawn for a Relation that is: it is not counted either.
    expect(drawn(['depends-on'])).toEqual({
      ids: ['2', '3', '5', 'docs/decisions/0002-b'],
      edges: 2,
      unrelated: 2
    })
    expect(drawn([])).toEqual({ ids: [], edges: 0, unrelated: 5 })
  })

  it('keeps the selected ADR in the drawing, with a Relation shown or without', () => {
    expect(drawn(['supersedes'], '4')).toEqual({ ids: ['1', '2', '4'], edges: 1, unrelated: 2 })
    expect(drawn([], '3')).toEqual({ ids: ['3'], edges: 0, unrelated: 4 })
  })
})

describe('the zoom of a drawing', () => {
  it('steps by a quarter, to whole percents that meet again on the way back', () => {
    expect(stepScale(1, 1)).toBe(1.25)
    expect(stepScale(1.25, -1)).toBe(1)
    let scale = 1
    for (let step = 0; step < 4; step++) scale = stepScale(scale, -1)
    for (let step = 0; step < 4; step++) scale = stepScale(scale, 1)
    expect(scale).toBe(1)
    expect(stepScale(ZOOM.max, 1)).toBe(ZOOM.max)
    expect(stepScale(ZOOM.min, -1)).toBe(ZOOM.min)
  })

  it('follows the wheel smoothly: down is smaller, up is larger, within the limits', () => {
    expect(wheelScale(1, 100)).toBeLessThan(1)
    expect(wheelScale(1, -100)).toBeGreaterThan(1)
    // A trackpad turns by a few pixels, and still zooms.
    expect(wheelScale(1, 2)).toBeLessThan(1)
    expect(wheelScale(1, 3, 1)).toBeCloseTo(wheelScale(1, 120), 10)
    expect(wheelScale(1, 100_000)).toBe(ZOOM.min)
    expect(wheelScale(1, -100_000)).toBe(ZOOM.max)
  })

  it('fits the whole drawing into the pane, and never draws it larger than it is', () => {
    expect(fitScale({ width: 2000, height: 500 }, { width: 1000, height: 800 })).toBe(0.5)
    expect(fitScale({ width: 600, height: 1800 }, { width: 1000, height: 600 })).toBe(0.33)
    expect(fitScale({ width: 300, height: 200 }, { width: 1000, height: 800 })).toBe(1)
    expect(fitScale({ width: 5172, height: 980 }, { width: 819, height: 756 })).toBe(0.15)
    expect(fitScale({ width: 40_000, height: 200 }, { width: 1000, height: 800 })).toBe(ZOOM.min)
    expect(fitScale({ width: 0, height: 0 }, { width: 1000, height: 800 })).toBe(1)
  })

  it('keeps the point under the cursor where it is', () => {
    const scroll = { left: 120, top: 40 }
    const cursor = { x: 300, y: 200 }
    const after = scrollAfterZoom(scroll, cursor, 1, 2)
    // The point of the drawing under the cursor, before and after.
    const point = (at: typeof scroll, scale: number) => ({
      x: (at.left + cursor.x) / scale,
      y: (at.top + cursor.y) / scale
    })
    expect(point(after, 2)).toEqual(point(scroll, 1))
    const back = point(scrollAfterZoom(after, cursor, 2, 0.9), 0.9)
    expect(back.x).toBeCloseTo(point(scroll, 1).x, 9)
    expect(back.y).toBeCloseTo(point(scroll, 1).y, 9)
    // The pane cannot scroll to before its start.
    expect(scrollAfterZoom({ left: 0, top: 0 }, cursor, 1, 0.5)).toEqual({ left: 0, top: 0 })
  })
})

describe('the layout of a level of Components', () => {
  const dependency = (from: string, to: string) => ({ from, to })

  it('puts what is depended on to the left, and the members of a Cycle into one layer', () => {
    // b and c depend on each other; a depends on b; c depends on d.
    const layout = layoutLayers(
      ['a', 'b', 'c', 'd'],
      [dependency('a', 'b'), dependency('b', 'c'), dependency('c', 'b'), dependency('c', 'd')],
      { groups: [['b', 'c']] }
    )
    const layer = (id: string) => layout.nodes.find((node) => node.id === id)!.layer
    expect(['d', 'b', 'c', 'a'].map(layer)).toEqual([0, 1, 1, 2])
    const inside = layout.edges.filter(({ edge }) =>
      [edge.from, edge.to].every((id) => 'bc'.includes(id))
    )
    expect(inside.map(({ sameLayer }) => sameLayer)).toEqual([true, true])
    // Two members of one layer never overlap.
    const [b, c] = [at(layout, 'b'), at(layout, 'c')]
    expect(Math.abs(b.y - c.y)).toBeGreaterThanOrEqual(NODE.height)
  })

  it('draws the nodes no edge touches as well, when asked to', () => {
    const layout = layoutLayers(['a', 'b', 'c'], [dependency('a', 'b')], { keepUnconnected: true })
    expect(layout.nodes.map((node) => node.id)).toEqual(['a', 'b', 'c'])
    expect(layout.unrelated).toBe(0)
  })

  it('leaves out an edge to a node that is not drawn', () => {
    const layout = layoutLayers(['a', 'b'], [dependency('a', 'b'), dependency('a', 'gone')], {
      keepUnconnected: true
    })
    expect(layout.edges.map(({ edge }) => edge.to)).toEqual(['b'])
  })
})
