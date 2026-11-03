/**
 * The picture of a Diagram as SVG (docs/diagrams-format.md, section 6), drawn without a browser:
 * the boxes where the file puts them, the arrows between them, the legend at the foot. The same
 * Diagram and declaration give the same bytes, so that a committed SVG diffs cleanly.
 *
 * What the picture holds is inert: no script, no link, no image, no foreign object, no reference
 * to anything outside the file. Every text in it is escaped. Drift is not drawn: the picture is
 * the Diagram as it is meant.
 */
import { everyComponent } from '@adr-tool/structure/model'
import type { Declared } from './check'
import { connectionsOf, elementsOf, type Diagram, type Element, type ElementKind } from './diagram'

/** A font as the picture uses it: its size and the height of one of its lines, in px. */
interface Font {
  readonly size: number
  readonly line: number
  readonly bold?: true
}

const NAME: Font = { size: 14, line: 18, bold: true }
const SMALL: Font = { size: 12, line: 16 }
const TITLE: Font = { size: 16, line: 20, bold: true }

/** The room around the text of a box, and its size without a `size` of its own. */
const BOX = { padX: 12, padY: 10, gap: 4, minWidth: 120, maxDescription: 240, minHeight: 48 }
/** How far the room around everything reaches, and how far the title and legend stand off. */
const MARGIN = 24
const TITLE_GAP = 16
const LEGEND_GAP = 24
/** How far apart two connections between the same two elements, one each way, are drawn. */
const PARALLEL = 6
/** How far the arrowhead reaches beyond the end of its line. */
const ARROW = 4

/** Which characters are wide, as East Asian scripts and emoji write them. */
const WIDE: readonly (readonly [number, number])[] = [
  [0x1100, 0x115f],
  [0x2e80, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe30, 0xfe4f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x1f300, 0x1faff],
  [0x20000, 0x3fffd]
]

/** The estimated width of a character, in ems (docs/diagrams-format.md, section 6). */
function advanceOf(char: string): number {
  const code = char.codePointAt(0)!
  if (code >= 0x300 && code <= 0x36f) return 0
  if (" ijlI'|.,:;!".includes(char)) return 0.3
  if ('frt()[]{}/\\-"'.includes(char)) return 0.4
  if ('mwMW@%'.includes(char)) return 0.9
  if (char >= 'A' && char <= 'Z') return 0.7
  if (code >= 0x21 && code <= 0x7e) return 0.6
  if (WIDE.some(([first, last]) => code >= first && code <= last)) return 1
  return 0.65
}

/**
 * The estimated width of a text in px: each character's width in ems times the size of the
 * font, 5 % more in bold. No browser measures it, so that every caller gets the same picture.
 */
export function textWidth(text: string, font: Pick<Font, 'size' | 'bold'>): number {
  let ems = 0
  for (const char of oneLine(text)) ems += advanceOf(char)
  return ems * font.size * (font.bold ? 1.05 : 1)
}

/** Line breaks and tabs inside a text are blanks; a character XML does not allow is U+FFFD. */
function oneLine(text: string): string {
  return text
    .replace(/[^\t\n\r -\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, '\uFFFD')
    .replace(/[\t\n\r]/g, ' ')
}

/** A text as a sentence ends: with a full stop, unless it ends with one, or with ?, ! or …. */
const sentence = (text: string): string => (/[.!?…]$/.test(text) ? text : `${text}.`)

/** A text as XML has it, in content and in attributes alike. */
function xml(text: string): string {
  return oneLine(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

/** A number as the picture writes it: whole numbers as they are, others to two places. */
function num(value: number): string {
  return String(Math.round(value * 100) / 100 + 0)
}

/** A text wrapped at blanks to a width; a word longer than that stands on a line of its own. */
function wrap(text: string, width: number, font: Font): string[] {
  const lines: string[] = []
  for (const word of oneLine(text)
    .split(' ')
    .filter((part) => part !== '')) {
    const last = lines.at(-1)
    if (last !== undefined && textWidth(`${last} ${word}`, font) <= width) {
      lines[lines.length - 1] = `${last} ${word}`
    } else lines.push(word)
  }
  return lines
}

/** Where the first line of a font's text stands, the top of its line given. */
const baseline = (top: number, font: Font): number =>
  top + (font.line - font.size) / 2 + font.size * 0.8

export interface Rect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

interface Box extends Rect {
  readonly element: Element
  readonly name: string
  readonly lines: readonly string[]
}

/** The box of an element: where its file puts it, as large as its file says or its text needs. */
function boxOf(element: Element, name: string, description: string | undefined): Box {
  const wanted = Math.max(
    BOX.minWidth,
    Math.ceil(textWidth(name, NAME)) + 2 * BOX.padX,
    description === undefined
      ? 0
      : Math.min(BOX.maxDescription, Math.ceil(textWidth(description, SMALL)) + 2 * BOX.padX)
  )
  const width = element.size?.width ?? wanted
  const lines = description === undefined ? [] : wrap(description, width - 2 * BOX.padX, SMALL)
  const block = NAME.line + (lines.length > 0 ? BOX.gap + lines.length * SMALL.line : 0)
  const height = element.size?.height ?? Math.max(BOX.minHeight, block + 2 * BOX.padY)
  return { element, name, lines, x: element.at.x, y: element.at.y, width, height }
}

interface Point {
  readonly x: number
  readonly y: number
}

/** How far along `direction` a line from `point` leaves `rect`, as a share of `direction`. */
function exitOf(rect: Rect, point: Point, direction: Point): number {
  let t = Infinity
  if (direction.x > 0) t = Math.min(t, (rect.x + rect.width - point.x) / direction.x)
  if (direction.x < 0) t = Math.min(t, (rect.x - point.x) / direction.x)
  if (direction.y > 0) t = Math.min(t, (rect.y + rect.height - point.y) / direction.y)
  if (direction.y < 0) t = Math.min(t, (rect.y - point.y) / direction.y)
  return Number.isFinite(t) ? Math.max(0, t) : 0
}

const middleOf = (rect: Rect): Point => ({
  x: rect.x + rect.width / 2,
  y: rect.y + rect.height / 2
})

export interface Line {
  /** Where the line leaves the border of the box of `from`. */
  readonly from: Point
  /** Where it ends, short of the border of the other box by the length of the arrowhead. */
  readonly to: Point
  readonly label?: { readonly text: string; readonly ground: Rect }
}

/**
 * The line of a connection, from the border of one box to the border of the other, with the
 * ground of its label in its middle; `undefined` between two boxes with the same middle. The
 * window draws a Dependency the Diagram leaves out the same way.
 */
export function lineBetween(
  from: Rect,
  to: Rect,
  both: boolean,
  label: string | undefined
): Line | undefined {
  let start = middleOf(from)
  let end = middleOf(to)
  const direction = { x: end.x - start.x, y: end.y - start.y }
  // Math.sqrt is exact to the last bit everywhere, Math.hypot only as the engine has it.
  const length = Math.sqrt(direction.x * direction.x + direction.y * direction.y)
  if (length === 0) return undefined
  if (both) {
    // Each of the two is moved to its own right, so that both show.
    const shift = { x: (-direction.y / length) * PARALLEL, y: (direction.x / length) * PARALLEL }
    start = { x: start.x + shift.x, y: start.y + shift.y }
    end = { x: end.x + shift.x, y: end.y + shift.y }
  }
  const leaves = exitOf(from, start, direction)
  const arrives = exitOf(to, end, { x: -direction.x, y: -direction.y })
  // Boxes that overlap along the line: it runs from middle to middle, beneath them.
  const [a, b] = leaves + arrives >= 1 ? [0, 0] : [leaves, arrives]
  const p0 = { x: start.x + a * direction.x, y: start.y + a * direction.y }
  const p1 = { x: end.x - b * direction.x, y: end.y - b * direction.y }
  const middle = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 }
  // The arrowhead reaches beyond the end of its line, to the border.
  const along = { x: p1.x - p0.x, y: p1.y - p0.y }
  const span = Math.sqrt(along.x * along.x + along.y * along.y)
  const pull = span > ARROW ? ARROW / span : 0
  const lineEnd = { x: p1.x - pull * along.x, y: p1.y - pull * along.y }
  if (label === undefined || oneLine(label).trim() === '') return { from: p0, to: lineEnd }
  const width = Math.ceil(textWidth(label, SMALL)) + 8
  return {
    from: p0,
    to: lineEnd,
    label: {
      text: label,
      ground: { x: middle.x - width / 2, y: middle.y - SMALL.line / 2, width, height: SMALL.line }
    }
  }
}

/** The words of the picture. English, whoever exports, so that the file does not change with them. */
const WORDS: Record<ElementKind, string> = {
  component: 'Component',
  external: 'External System',
  repository: 'This repository'
}
const USES = 'uses; the arrow points at what is used'

/** The palette of the window's tokens (packages/app/src/renderer/src/main.css), light and dark. */
const STYLE = [
  "svg { font-family: 'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif; }",
  '.background, .ground { fill: #eef1f5; }',
  '.box { fill: #fcfcfd; stroke: #8891a3; stroke-width: 1.2; }',
  '.external .box { stroke-dasharray: 6 4; }',
  '.repository .box { stroke-width: 2; }',
  '.name { fill: #1c2230; font-size: 14px; font-weight: 600; }',
  '.title { fill: #1c2230; font-size: 16px; font-weight: 600; }',
  '.description, .label, .legend { fill: #566075; font-size: 12px; }',
  '.line { fill: none; stroke: #566075; stroke-width: 1.4; }',
  '.arrowhead { fill: #566075; }',
  '@media (prefers-color-scheme: dark) {',
  '  .background, .ground { fill: #1f222a; }',
  '  .box { fill: #181a20; stroke: #737d91; }',
  '  .name, .title { fill: #e4e7ee; }',
  '  .description, .label, .legend { fill: #a5aec0; }',
  '  .line { stroke: #a5aec0; }',
  '  .arrowhead { fill: #a5aec0; }',
  '}'
]

/** A box of the picture, where it stands, with its name and the lines of its description. */
export interface PlacedBox extends Rect {
  readonly id: string
  readonly kind: ElementKind
  readonly name: string
  readonly lines: readonly string[]
}

/** The line of a connection of the picture, between the borders of its two boxes. */
export interface PlacedLine extends Line {
  /** The element IDs it joins, as the connection names them. */
  readonly ends: { readonly from: string; readonly to: string }
}

/** Where the picture puts its boxes and lines: what the window draws, as the export does. */
export interface Geometry {
  /** In the order they are drawn: of `elements`, the first of each ID. */
  readonly boxes: readonly PlacedBox[]
  /** In the order of `connections`: those that are drawn. */
  readonly lines: readonly PlacedLine[]
}

/**
 * The boxes and lines of a Diagram as its picture draws them — the same sizes, the same
 * wrapping of descriptions, the same ends of lines —, for the window, which draws them itself.
 */
export function geometryOf(
  diagram: Pick<Diagram, 'elements' | 'connections'>,
  structure: Declared
): Geometry {
  const { boxes, lines } = layout(diagram, structure)
  return {
    boxes: boxes.map(({ element, name, lines: text, x, y, width, height }) => ({
      id: element.id,
      kind: element.kind,
      name,
      lines: text,
      x,
      y,
      width,
      height
    })),
    lines: lines.map(({ ends, line }) => ({ ...line, ends }))
  }
}

/** The boxes, and the lines of the connections that are drawn, each with its connection. */
function layout(
  diagram: Pick<Diagram, 'elements' | 'connections'>,
  structure: Declared
): { boxes: Box[]; lines: { ends: { from: string; to: string }; line: Line }[] } {
  const declared = new Map(
    (structure.origin === 'declared' ? everyComponent(structure.components) : []).map(
      (component) => [component.id, component]
    )
  )
  const boxes = elementsOf(diagram).map((element) => {
    if (element.kind !== 'component') return boxOf(element, element.name, element.description)
    const component = declared.get(element.id)
    return boxOf(element, component?.name ?? element.id, component?.description)
  })
  const boxOfId = new Map(boxes.map((box) => [box.element.id, box]))
  const connections = connectionsOf(diagram)
  const pairs = new Set(connections.map(({ from, to }) => `${from}\n${to}`))
  const lines = connections.flatMap((connection) => {
    const both = pairs.has(`${connection.to}\n${connection.from}`)
    const line = lineBetween(
      boxOfId.get(connection.from)!,
      boxOfId.get(connection.to)!,
      both,
      connection.label
    )
    return line ? [{ ends: { from: connection.from, to: connection.to }, line }] : []
  })
  return { boxes, lines }
}

/**
 * The picture of a Diagram, as the text of an SVG file. The names and descriptions of
 * Components come from their declaration; a Component that is not declared is drawn under its
 * ID, and so is every Component of a Draft, whose names nobody wrote.
 */
export function drawDiagram(diagram: Diagram, structure: Declared): string {
  const { boxes, lines: placed } = layout(diagram, structure)
  const boxOfId = new Map(boxes.map((box) => [box.element.id, box]))
  const connections = connectionsOf(diagram)
  const lines = placed.map((one) => one.line)

  // What the picture holds: the boxes and the grounds of the labels.
  const rects: Rect[] = [
    ...boxes,
    ...lines.flatMap((line) => (line.label ? [line.label.ground] : []))
  ]
  const bounds =
    rects.length === 0
      ? { left: 0, top: 0, right: 0, bottom: 0 }
      : {
          left: Math.min(...rects.map((rect) => rect.x)),
          top: Math.min(...rects.map((rect) => rect.y)),
          right: Math.max(...rects.map((rect) => rect.x + rect.width)),
          bottom: Math.max(...rects.map((rect) => rect.y + rect.height))
        }

  // The title and the description, above.
  const headerWidth = Math.max(bounds.right - bounds.left, 360)
  const description =
    diagram.description === undefined ? [] : wrap(diagram.description, headerWidth, SMALL)
  const titled = diagram.title !== undefined && oneLine(diagram.title).trim() !== ''
  const headerHeight =
    (titled ? TITLE.line : 0) +
    (titled && description.length > 0 ? BOX.gap : 0) +
    description.length * SMALL.line
  const headerTop = bounds.top - (headerHeight > 0 ? TITLE_GAP + headerHeight : 0)
  const headerRight =
    bounds.left +
    Math.max(
      titled ? textWidth(diagram.title!, TITLE) : 0,
      ...description.map((line) => textWidth(line, SMALL))
    )

  // The legend, at the foot: what the picture holds.
  const kinds = (['component', 'external', 'repository'] as const).filter((kind) =>
    boxes.some((box) => box.element.kind === kind)
  )
  const legendTop = bounds.bottom + LEGEND_GAP
  const legend: string[] = []
  let cursor = bounds.left
  for (const kind of kinds) {
    legend.push(
      `    <g class="${kind}"><rect class="box" x="${num(cursor)}" y="${num(legendTop + 1)}" width="24" height="14" rx="3"/></g>`,
      `    <text x="${num(cursor + 30)}" y="${num(baseline(legendTop, SMALL))}">${xml(WORDS[kind])}</text>`
    )
    cursor += 30 + textWidth(WORDS[kind], SMALL) + 18
  }
  if (lines.length > 0) {
    const middle = legendTop + SMALL.line / 2
    legend.push(
      `    <path class="line" d="M${num(cursor)} ${num(middle)}H${num(cursor + 28 - ARROW)}" marker-end="url(#arrow)"/>`,
      `    <text x="${num(cursor + 34)}" y="${num(baseline(legendTop, SMALL))}">${xml(USES)}</text>`
    )
    cursor += 34 + textWidth(USES, SMALL) + 18
  }
  const legendRight = legend.length > 0 ? cursor - 18 : bounds.left

  const left = Math.floor(bounds.left - MARGIN)
  const top = Math.floor(headerTop - MARGIN)
  const right = Math.ceil(Math.max(bounds.right, headerRight, legendRight) + MARGIN)
  const bottom = Math.ceil((legend.length > 0 ? legendTop + SMALL.line : bounds.bottom) + MARGIN)
  const width = right - left
  const height = bottom - top

  const nameOf = (id: string): string => boxOfId.get(id)!.name
  const sentences = [
    ...(diagram.description === undefined || oneLine(diagram.description).trim() === ''
      ? []
      : [sentence(diagram.description.trim())]),
    ...connections.map(({ from, to, label }) =>
      sentence(
        `${nameOf(from)} uses ${nameOf(to)}${label === undefined || oneLine(label).trim() === '' ? '' : `: ${label.trim()}`}`
      )
    )
  ]

  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${left} ${top} ${width} ${height}" role="img">`,
    `  <title>${xml(titled ? diagram.title! : diagram.id)}</title>`,
    ...(sentences.length > 0 ? [`  <desc>${xml(sentences.join(' '))}</desc>`] : []),
    '  <style>',
    ...STYLE.map((rule) => `    ${rule}`),
    '  </style>',
    '  <defs>',
    `    <marker id="arrow" viewBox="0 0 8 8" refX="${num(7.5 - ARROW)}" refY="4" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto">`,
    '      <path class="arrowhead" d="M0 0.5L7.5 4L0 7.5z"/>',
    '    </marker>',
    '  </defs>',
    `  <rect class="background" x="${left}" y="${top}" width="${width}" height="${height}"/>`
  ]
  if (headerHeight > 0) {
    let lineTop = headerTop
    if (titled) {
      out.push(
        `  <text class="title" x="${num(bounds.left)}" y="${num(baseline(lineTop, TITLE))}">${xml(diagram.title!)}</text>`
      )
      lineTop += TITLE.line + (description.length > 0 ? BOX.gap : 0)
    }
    for (const line of description) {
      out.push(
        `  <text class="description" x="${num(bounds.left)}" y="${num(baseline(lineTop, SMALL))}">${xml(line)}</text>`
      )
      lineTop += SMALL.line
    }
  }
  if (lines.length > 0) {
    out.push('  <g class="connections">')
    for (const line of lines) {
      out.push(
        `    <path class="line" d="M${num(line.from.x)} ${num(line.from.y)}L${num(line.to.x)} ${num(line.to.y)}" marker-end="url(#arrow)"/>`
      )
    }
    out.push('  </g>')
  }
  if (boxes.length > 0) {
    out.push('  <g class="elements">')
    for (const box of boxes) out.push(...drawBox(box))
    out.push('  </g>')
  }
  const labelled = lines.filter((line) => line.label !== undefined)
  if (labelled.length > 0) {
    out.push('  <g class="labels">')
    for (const { label } of labelled) {
      const { ground, text } = label!
      out.push(
        `    <rect class="ground" x="${num(ground.x)}" y="${num(ground.y)}" width="${num(ground.width)}" height="${num(ground.height)}"/>`,
        `    <text class="label" x="${num(ground.x + ground.width / 2)}" y="${num(baseline(ground.y, SMALL))}" text-anchor="middle">${xml(text)}</text>`
      )
    }
    out.push('  </g>')
  }
  if (legend.length > 0) out.push('  <g class="legend">', ...legend, '  </g>')
  out.push('</svg>')
  return out.map((line) => `${line}\n`).join('')
}

/** One box: its rectangle, its name, the lines of its description, centred in it. */
function drawBox(box: Box): string[] {
  const block = NAME.line + (box.lines.length > 0 ? BOX.gap + box.lines.length * SMALL.line : 0)
  const centre = num(box.x + box.width / 2)
  let lineTop = box.y + (box.height - block) / 2
  const out = [
    `    <g class="element ${box.element.kind}">`,
    `      <rect class="box" x="${num(box.x)}" y="${num(box.y)}" width="${num(box.width)}" height="${num(box.height)}" rx="5"/>`,
    `      <text class="name" x="${centre}" y="${num(baseline(lineTop, NAME))}" text-anchor="middle">${xml(box.name)}</text>`
  ]
  lineTop += NAME.line + BOX.gap
  for (const line of box.lines) {
    out.push(
      `      <text class="description" x="${centre}" y="${num(baseline(lineTop, SMALL))}" text-anchor="middle">${xml(line)}</text>`
    )
    lineTop += SMALL.line
  }
  out.push('    </g>')
  return out
}
