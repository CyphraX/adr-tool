import { describe, expect, it } from 'vitest'
import { overlaps, placeLabels, type Box, type Mark } from '../src/renderer/src/lib/labels'

// The names on the main sequence (structure-format.md, section 5; StructureSequence.svelte).

/** The drawing's frame, as StructureSequence draws it: 320 units with a margin of 14. */
const frame: Box = { x: 48, y: 14, width: 320, height: 320 }
const at = (i: number, a: number): { x: number; y: number } => ({
  x: frame.x + 14 + i * (frame.width - 28),
  y: frame.y + 14 + (1 - a) * (frame.height - 28)
})
const room = { bounds: frame, taken: [], charWidth: 6.4, lineHeight: 12 }

/** Every label clear of every other label and of every point. */
function expectClear(marks: readonly Mark[], labels: ReturnType<typeof placeLabels>): void {
  labels.forEach((label, index) => {
    for (const other of labels.slice(index + 1)) expect(overlaps(label.box, other.box)).toBe(false)
    for (const mark of marks) {
      const circle = {
        x: mark.x - mark.radius,
        y: mark.y - mark.radius,
        width: 2 * mark.radius,
        height: 2 * mark.radius
      }
      expect(overlaps(label.box, circle)).toBe(false)
    }
  })
}

describe('the labels of the main sequence', () => {
  it('names every package of this repository where it lies, none over another', () => {
    // A, I and the size of the top level of this repository, as the chart drew them on top of
    // each other: diagrams, conformance and app; structure and core; cli and mcp.
    const packages: [string, number, number, number][] = [
      ['structure', 0.29, 0.21, 7],
      ['kernel', 0.54, 0, 4],
      ['core', 0.28, 0.3, 6],
      ['app', 0.34, 1, 10],
      ['diagrams', 0.35, 0.89, 5],
      ['mcp', 0.2, 1, 4],
      ['conformance', 0.32, 0.67, 5],
      ['cli', 0.21, 0.8, 4]
    ]
    const marks = packages.map(([name, a, i, radius], index) => ({
      ...at(i, a),
      radius,
      name,
      number: index + 1
    }))
    const labels = placeLabels(marks, room)
    expectClear(marks, labels)
    expect(labels.filter((label) => label.numbered)).toEqual([])
    expect(labels.map((label) => label.text)).toEqual(packages.map(([name]) => name))
  })

  it('numbers a point where its name finds no room, as the list beside it does', () => {
    // Twelve points on one spot: names around it while there is room, then numbers, and the
    // last ones, for which no room is left at all, numbered to the right.
    const marks = Array.from({ length: 12 }, (_, index) => ({
      ...at(0.5, 0.5),
      radius: 4,
      name: `component-${index + 1}`,
      number: index + 1
    }))
    const labels = placeLabels(marks, room)
    const named = labels.filter((label) => !label.numbered)
    expect(named.length).toBeGreaterThan(1)
    expect(named.length).toBeLessThan(marks.length)
    expect(labels.slice(named.length).every((label) => label.numbered)).toBe(true)
    expect(labels.at(-1)).toMatchObject({ text: '12', numbered: true })
    named.forEach((label, index) => {
      for (const other of named.slice(index + 1)) expect(overlaps(label.box, other.box)).toBe(false)
    })
    // Nothing is written over what the chart already says.
    const point = at(0.6, 0.5)
    const said: Box = { x: point.x + 6, y: point.y - 10, width: 80, height: 20 }
    const [label] = placeLabels([{ ...point, radius: 4, name: 'beside', number: 1 }], {
      ...room,
      taken: [said]
    })
    expect(label).toMatchObject({ text: 'beside', anchor: 'end' })
    expect(overlaps(label!.box, said)).toBe(false)
  })
})
