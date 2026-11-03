import { RangeSetBuilder, type EditorState, type Extension, type Text } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  GutterMarker,
  WidgetType,
  gutter,
  type DecorationSet
} from '@codemirror/view'

// The Annotations in the code viewer (docs/plan-vision.md, part 9): a mark in a gutter of their
// own beside the lines of each, and a card below its last line that says what it is, which a
// click opens. Open ones are amber — they wait for a person —, resolved ones ink. Lines are
// selected by dragging over the code, or by a click on their numbers, Shift to extend.

/** An Annotation where it is now in the file shown, with what its card says. */
export interface CodeAnnotation {
  readonly id: string
  readonly start: number
  readonly end: number
  readonly open: boolean
  /** Its type, as the window names it. */
  readonly type: string
  /** The first line of its text. */
  readonly text: string
  /** Who wrote it and when, and how many Replies it has. */
  readonly about: string
  /** What a screen reader says of its card. */
  readonly label: string
}

/** Lines selected in the viewer: the first and the last, counted from 1. */
export interface Lines {
  readonly start: number
  readonly end: number
}

/**
 * The lines the selection covers, or `undefined` for a cursor alone. A selection that ends at
 * the start of a line, as a drag over whole lines does, does not take that line.
 */
export function selectedLines(state: EditorState): Lines | undefined {
  const { from, to, empty } = state.selection.main
  if (empty) return undefined
  const doc = state.doc
  const start = doc.lineAt(from).number
  let end = doc.lineAt(to).number
  if (end > start && doc.line(end).from === to) end -= 1
  return { start, end }
}

/** At most this many Annotations side by side in the gutter; a card shows each one anyway. */
const COLUMNS = 3

/** Each Annotation's column in the gutter: the first that is free where it starts. */
export function columnsOf(annotations: readonly Lines[]): number[] {
  const order = annotations
    .map((_, index) => index)
    .sort((a, b) => {
      const [x, y] = [annotations[a]!, annotations[b]!]
      return x.start - y.start || y.end - x.end
    })
  const busyUntil: number[] = []
  const columns: number[] = new Array<number>(annotations.length)
  for (const index of order) {
    const { start, end } = annotations[index]!
    let column = busyUntil.findIndex((until) => until < start)
    if (column === -1) column = busyUntil.length
    busyUntil[column] = end
    columns[index] = column
  }
  return columns
}

interface Bar {
  readonly id: string
  readonly column: number
  readonly open: boolean
  readonly first: boolean
  readonly last: boolean
  readonly selected: boolean
}

class Marks extends GutterMarker {
  constructor(private readonly bars: readonly Bar[]) {
    super()
  }

  override eq(other: GutterMarker): boolean {
    return other instanceof Marks && JSON.stringify(other.bars) === JSON.stringify(this.bars)
  }

  override toDOM(): Node {
    const marks = document.createElement('span')
    marks.className = 'cm-annotation-marks'
    for (const bar of this.bars) {
      const element = document.createElement('span')
      element.className = [
        'cm-annotation-bar',
        bar.open ? 'open' : 'resolved',
        bar.first ? 'first' : '',
        bar.last ? 'last' : '',
        bar.selected ? 'selected' : ''
      ]
        .filter(Boolean)
        .join(' ')
      element.dataset['id'] = bar.id
      element.style.left = `${3 + bar.column * 5}px`
      marks.append(element)
    }
    return marks
  }
}

class Card extends WidgetType {
  constructor(
    private readonly annotation: CodeAnnotation,
    private readonly selected: boolean,
    private readonly onopen: (id: string) => void
  ) {
    super()
  }

  override eq(other: WidgetType): boolean {
    return (
      other instanceof Card &&
      other.selected === this.selected &&
      JSON.stringify(other.annotation) === JSON.stringify(this.annotation)
    )
  }

  override toDOM(): HTMLElement {
    const { annotation } = this
    const card = document.createElement('button')
    card.type = 'button'
    card.className = [
      'cm-annotation-card',
      annotation.open ? 'open' : 'resolved',
      this.selected ? 'selected' : ''
    ]
      .filter(Boolean)
      .join(' ')
    card.setAttribute('aria-label', annotation.label)
    card.setAttribute('aria-pressed', String(this.selected))
    const part = (className: string, text: string): void => {
      const span = document.createElement('span')
      span.className = className
      span.textContent = text
      card.append(span)
    }
    part('type', annotation.type)
    part('text', annotation.text)
    part('about', annotation.about)
    card.addEventListener('click', () => this.onopen(annotation.id))
    return card
  }

  override ignoreEvent(): boolean {
    return true
  }
}

/**
 * The gutter of the Annotations and their cards, for the file as `doc` has it. An Annotation
 * whose lines the text no longer has — the file changed since it was found — is left out.
 */
export function annotationsIn(
  doc: Text,
  annotations: readonly CodeAnnotation[],
  selected: string | undefined,
  onopen: (id: string) => void
): Extension {
  const shown = annotations.filter(
    (annotation) => annotation.start >= 1 && annotation.end <= doc.lines
  )
  const columns = columnsOf(shown)
  const bars = new Map<number, Bar[]>()
  shown.forEach((annotation, index) => {
    const column = columns[index]!
    if (column >= COLUMNS) return
    for (let line = annotation.start; line <= annotation.end; line++) {
      const list = bars.get(line) ?? []
      list.push({
        id: annotation.id,
        column,
        open: annotation.open,
        first: line === annotation.start,
        last: line === annotation.end,
        selected: annotation.id === selected
      })
      bars.set(line, list)
    }
  })
  const marks = new RangeSetBuilder<GutterMarker>()
  for (const line of [...bars.keys()].sort((a, b) => a - b)) {
    marks.add(doc.line(line).from, doc.line(line).from, new Marks(bars.get(line)!))
  }
  const markers = marks.finish()

  // Cards below the last line of each, in the order of their lines.
  const cards = new RangeSetBuilder<Decoration>()
  const byEnd = shown
    .map((annotation, index) => ({ annotation, index }))
    .sort((a, b) => a.annotation.end - b.annotation.end || a.index - b.index)
  for (const { annotation } of byEnd) {
    const at = doc.line(annotation.end).to
    cards.add(
      at,
      at,
      Decoration.widget({
        widget: new Card(annotation, annotation.id === selected, onopen),
        block: true,
        side: 1
      })
    )
  }
  const decorations: DecorationSet = cards.finish()

  return [
    gutter({
      class: 'cm-annotations',
      markers: () => markers,
      initialSpacer: () => new Marks([]),
      domEventHandlers: {
        mousedown(view, line, event) {
          const target = (event.target as HTMLElement).closest<HTMLElement>('.cm-annotation-bar')
          const number = view.state.doc.lineAt(line.from).number
          const id =
            target?.dataset['id'] ??
            shown.find((annotation) => annotation.start <= number && number <= annotation.end)?.id
          if (id === undefined) return false
          onopen(id)
          return true
        }
      }
    }),
    EditorView.decorations.of(decorations)
  ]
}

/**
 * A click on the number of a line selects it, a click with Shift extends the selection to it:
 * lines to annotate, or to attach an Annotation to again, are chosen without dragging.
 */
export function selectLineOnNumber(view: EditorView, from: number, event: Event): boolean {
  const doc = view.state.doc
  const clicked = doc.lineAt(from).number
  const current = (event as MouseEvent).shiftKey ? selectedLines(view.state) : undefined
  const start = current ? Math.min(current.start, clicked) : clicked
  const end = current ? Math.max(current.end, clicked) : clicked
  const head = end < doc.lines ? doc.line(end + 1).from : doc.line(end).to
  view.dispatch({ selection: { anchor: doc.line(start).from, head } })
  return true
}

/** How the marks and the cards look, in the app's tokens. */
export const annotationTheme = EditorView.theme({
  '.cm-annotations .cm-gutterElement': { position: 'relative', width: '18px', padding: '0' },
  '.cm-annotation-marks': { display: 'block', position: 'absolute', inset: '0' },
  '.cm-annotation-bar': {
    position: 'absolute',
    top: '0',
    bottom: '0',
    width: '3px',
    cursor: 'pointer'
  },
  '.cm-annotation-bar.open': { backgroundColor: 'var(--waiting)' },
  '.cm-annotation-bar.resolved': { backgroundColor: 'var(--ink-soft)' },
  '.cm-annotation-bar.first': {
    top: '3px',
    borderTopLeftRadius: '2px',
    borderTopRightRadius: '2px'
  },
  '.cm-annotation-bar.last': {
    bottom: '3px',
    borderBottomLeftRadius: '2px',
    borderBottomRightRadius: '2px'
  },
  '.cm-annotation-bar.selected': { width: '4px', boxShadow: '0 0 0 1px var(--paper)' },
  '.cm-annotation-card': {
    display: 'flex',
    alignItems: 'baseline',
    gap: '8px',
    width: 'calc(100% - 26px)',
    margin: '2px 16px 6px 10px',
    padding: '3px 10px',
    border: '1px solid var(--line)',
    borderLeft: '3px solid var(--waiting)',
    borderRadius: '3px',
    background: 'var(--panel-raised)',
    color: 'var(--ink)',
    font: '12px/1.5 var(--ui)',
    textAlign: 'left',
    whiteSpace: 'nowrap',
    cursor: 'pointer'
  },
  '.cm-annotation-card:hover': { background: 'var(--hover)' },
  '.cm-annotation-card.resolved': { borderLeftColor: 'var(--ink-soft)', color: 'var(--ink-soft)' },
  '.cm-annotation-card.selected': { background: 'var(--selected)', borderColor: 'var(--focus)' },
  '.cm-annotation-card .type': { flex: 'none', fontWeight: '600' },
  '.cm-annotation-card.open .type': { color: 'var(--waiting)' },
  '.cm-annotation-card .text': { minWidth: '0', overflow: 'hidden', textOverflow: 'ellipsis' },
  '.cm-annotation-card .about': { flex: 'none', marginLeft: 'auto', color: 'var(--ink-faint)' }
})
