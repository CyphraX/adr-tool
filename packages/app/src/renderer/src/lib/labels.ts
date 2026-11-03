// Where the names of the points of a chart go, so that none covers another, a point or what is
// written on the chart already (the main sequence, structure-format.md, section 5). Each name
// tries the places around its point in turn, the first point first; one that finds no free
// place shows the point's number instead, which the list beside the chart shows too.

/** A box on the drawing, in its units: from its top left corner. */
export interface Box {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/** A point to be named: its centre and radius, its name, and its number in the list. */
export interface Mark {
  readonly x: number
  readonly y: number
  readonly radius: number
  readonly name: string
  readonly number: number
}

/** Where a mark's label is written: the text, its anchor and baseline, and whether it is the number. */
export interface Label {
  readonly text: string
  readonly x: number
  readonly y: number
  readonly anchor: 'start' | 'middle' | 'end'
  readonly numbered: boolean
  readonly box: Box
}

export interface Room {
  /** Where labels may be: the frame of the plot. */
  readonly bounds: Box
  /** What is written there already. */
  readonly taken: readonly Box[]
  /** The width of one character, and the height of a line, of the labels' font. */
  readonly charWidth: number
  readonly lineHeight: number
}

const GAP = 3

export const overlaps = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

const within = (outer: Box, inner: Box): boolean =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height

/** The places a label of the given width can take around a mark, the most natural first. */
function placesAround(
  mark: Mark,
  width: number,
  height: number
): Omit<Label, 'text' | 'numbered'>[] {
  const { x, y, radius } = mark
  const near = radius + GAP
  const diagonal = radius * Math.SQRT1_2 + GAP
  // A box from its top left corner; the text's baseline lies a quarter of a line above its bottom.
  const at = (
    left: number,
    top: number,
    anchor: Label['anchor']
  ): Omit<Label, 'text' | 'numbered'> => ({
    x: anchor === 'start' ? left : anchor === 'end' ? left + width : left + width / 2,
    y: top + height * 0.75,
    anchor,
    box: { x: left, y: top, width, height }
  })
  return [
    at(x + near, y - height / 2, 'start'),
    at(x - near - width, y - height / 2, 'end'),
    at(x - width / 2, y - near - height, 'middle'),
    at(x - width / 2, y + near, 'middle'),
    at(x + diagonal, y - diagonal - height, 'start'),
    at(x + diagonal, y + diagonal, 'start'),
    at(x - diagonal - width, y - diagonal - height, 'end'),
    at(x - diagonal - width, y + diagonal, 'end')
  ]
}

/**
 * The labels of the marks, in their order: each at the first place around its mark that lies in
 * the frame and covers no mark, no label placed before it and nothing taken. Where its name
 * finds none, its number does; where that finds none either, the number stands to the right.
 */
export function placeLabels(marks: readonly Mark[], room: Room): Label[] {
  const taken: Box[] = [
    ...room.taken,
    ...marks.map(({ x, y, radius }) => ({
      x: x - radius,
      y: y - radius,
      width: 2 * radius,
      height: 2 * radius
    }))
  ]
  return marks.map((mark) => {
    for (const [text, numbered] of [
      [mark.name, false],
      [String(mark.number), true]
    ] as const) {
      const width = text.length * room.charWidth + 2
      const free = placesAround(mark, width, room.lineHeight).find(
        ({ box }) => within(room.bounds, box) && !taken.some((other) => overlaps(other, box))
      )
      if (free) {
        taken.push(free.box)
        return { ...free, text, numbered }
      }
    }
    const text = String(mark.number)
    const [right] = placesAround(mark, text.length * room.charWidth + 2, room.lineHeight)
    taken.push(right!.box)
    return { ...right!, text, numbered: true }
  })
}
