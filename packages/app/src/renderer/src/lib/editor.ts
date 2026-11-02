import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { HighlightStyle, syntaxHighlighting, syntaxTree } from '@codemirror/language'
import { Compartment, EditorState, Facet, Prec, StateField, type Range } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  drawSelection,
  keymap,
  type DecorationSet,
  type ViewUpdate
} from '@codemirror/view'
import { tags } from '@lezer/highlight'
import { liveDiagrams, liveMarks, liveTables, stepIntoTable, type LiveTable } from './live'

// The source of an ADR is its raw material: monospace, quiet, with just enough emphasis to
// find one's way. The colours come from the app's tokens, so light and dark follow.
const theme = EditorView.theme({
  '&': { height: '100%', color: 'var(--ink)', backgroundColor: 'var(--paper)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'var(--code)',
    fontSize: '13.5px',
    lineHeight: '1.65',
    fontVariantNumeric: 'normal'
  },
  '.cm-content': { padding: '28px 40px 64px', maxWidth: '52rem', caretColor: 'var(--ink)' },
  '.cm-line': { padding: '0' },
  '.cm-cursor': { borderLeftColor: 'var(--ink)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'var(--selected)'
  }
})

const highlighting = HighlightStyle.define([
  { tag: tags.heading, fontWeight: '600' },
  { tag: tags.strong, fontWeight: '600' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: [tags.link, tags.url], color: 'var(--focus)' },
  { tag: tags.monospace, color: 'var(--ink-soft)' },
  { tag: tags.quote, color: 'var(--ink-soft)' },
  { tag: [tags.processingInstruction, tags.meta, tags.contentSeparator], color: 'var(--ink-faint)' }
])

class Bullet extends WidgetType {
  override eq(): boolean {
    return true
  }

  // A click on the bullet puts the cursor there, as on any other text.
  override ignoreEvent(): boolean {
    return false
  }

  toDOM(): HTMLElement {
    const bullet = document.createElement('span')
    bullet.className = 'cm-live-bullet'
    bullet.textContent = '•'
    return bullet
  }
}

const hidden = Decoration.replace({})
const bullet = Decoration.replace({ widget: new Bullet() })

function decorationsOf(state: EditorState): DecorationSet {
  // A Mermaid block drawn as its diagram has no lines to mark.
  const drawn = state.facet(diagramRenderer) ? liveDiagrams(state) : []
  const marks = liveMarks(state).filter(
    (mark) => !drawn.some((diagram) => mark.from >= diagram.from && mark.from <= diagram.to)
  )
  const ranges: Range<Decoration>[] = marks.map((mark) => {
    switch (mark.kind) {
      case 'hide':
        return hidden.range(mark.from, mark.to)
      case 'bullet':
        return bullet.range(mark.from, mark.to)
      case 'line':
        return Decoration.line({ class: `cm-live-${mark.style}` }).range(mark.from)
      case 'span':
        return Decoration.mark({ class: `cm-live-${mark.style}` }).range(mark.from, mark.to)
    }
  })
  return Decoration.set(ranges, true)
}

/** The lines a selection touches, the ones that show their source, as one key. */
function activeLines(state: EditorState): string {
  return state.selection.ranges
    .map((range) => `${state.doc.lineAt(range.from).number}-${state.doc.lineAt(range.to).number}`)
    .join(' ')
}

/**
 * Decorations of the live mode, recomputed as the text or the parse changes, or the cursor
 * moves to another line; moving within a line changes nothing.
 */
const livePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    lines: string
    constructor(view: EditorView) {
      this.decorations = decorationsOf(view.state)
      this.lines = activeLines(view.state)
    }
    update(update: ViewUpdate): void {
      const lines = activeLines(update.state)
      if (
        update.docChanged ||
        lines !== this.lines ||
        syntaxTree(update.startState) !== syntaxTree(update.state)
      ) {
        this.decorations = decorationsOf(update.state)
      }
      this.lines = lines
    }
  },
  { decorations: (plugin) => plugin.decorations }
)

// The live mode reads like the preview: the document's typeface, its sizes, its quiet marks.
const liveTheme = EditorView.theme({
  '&.cm-live .cm-scroller': {
    fontFamily: 'var(--document)',
    fontSize: '16px',
    lineHeight: '1.62'
  },
  '.cm-live-h1': { fontSize: '1.75em', fontWeight: '600', lineHeight: '1.3' },
  '.cm-live-h2': { fontFamily: 'var(--ui)', fontSize: '0.9em', color: 'var(--ink-soft)' },
  '.cm-live-h3, .cm-live-h4, .cm-live-h5, .cm-live-h6': { fontWeight: '600' },
  '.cm-live-code': {
    fontFamily: 'var(--code)',
    fontSize: '0.86em',
    backgroundColor: 'var(--panel)',
    borderRadius: '3px'
  },
  '.cm-live-code-block': {
    fontFamily: 'var(--code)',
    fontSize: '13.5px',
    backgroundColor: 'var(--panel)'
  },
  '.cm-live-quote': {
    borderLeft: '3px solid var(--line-strong)',
    paddingLeft: '12px !important',
    color: 'var(--ink-soft)'
  },
  '.cm-live-rule': { borderBottom: '1px solid var(--line-strong)' },
  '.cm-live-link': { color: 'var(--focus)', textDecoration: 'underline' },
  '.cm-live-bullet': { color: 'var(--ink-soft)' },
  // A table reads as in the preview: the interface's typeface, quiet lines between the cells.
  '.cm-live-table': {
    padding: '4px 0 8px',
    fontFamily: 'var(--ui)',
    fontSize: '14px',
    lineHeight: '1.5',
    cursor: 'text',
    overflowX: 'auto'
  },
  '.cm-live-table table': { borderCollapse: 'collapse' },
  '.cm-live-table th, .cm-live-table td': {
    border: '1px solid var(--line-strong)',
    padding: '4px 10px',
    verticalAlign: 'top'
  },
  // A column the delimiter row aligns keeps its alignment.
  '.cm-live-table th:not([align])': { textAlign: 'left' },
  '.cm-live-table th': { fontWeight: '600', background: 'var(--panel)' },
  '.cm-live-table code': { fontFamily: 'var(--code)', fontSize: '0.9em' },
  // A Mermaid block reads as in the preview: its diagram, or its source and why it is not drawn.
  '.cm-live-diagram': { padding: '4px 0 8px', cursor: 'text', overflowX: 'auto' },
  '.cm-live-diagram svg': { display: 'block', maxWidth: '100%', height: 'auto' },
  '.cm-live-diagram figure': { margin: '0' },
  '.cm-live-diagram pre': {
    margin: '0',
    fontFamily: 'var(--code)',
    fontSize: '13.5px',
    whiteSpace: 'pre-wrap',
    backgroundColor: 'var(--panel)'
  },
  '.cm-live-diagram .diagram-error': {
    fontFamily: 'var(--ui)',
    fontSize: '12.5px',
    color: 'var(--problem)'
  }
})

/** How the live mode renders a table: as the preview does, sanitized. Without one, tables stay source. */
const tableRenderer = Facet.define<
  (markdown: string) => string,
  ((markdown: string) => string) | undefined
>({
  combine: (values) => values[0]
})

/** A table of the text, drawn in place of its lines. A click into it puts the cursor there. */
class Table extends WidgetType {
  constructor(
    readonly source: string,
    readonly render: (markdown: string) => string
  ) {
    super()
  }
  override eq(other: Table): boolean {
    return other.source === this.source
  }
  toDOM(): HTMLElement {
    const box = document.createElement('div')
    box.className = 'cm-live-table'
    box.innerHTML = this.render(this.source)
    // A link in the table is text to edit here, as everywhere in the editor: neither a click,
    // nor a click of the middle button, nor a drag opens it.
    const inert = (event: Event): void => {
      if ((event.target as Element).closest('a, img')) event.preventDefault()
    }
    for (const type of ['click', 'auxclick', 'dragstart']) box.addEventListener(type, inert)
    return box
  }
  override ignoreEvent(): boolean {
    return false
  }
}

function tablesOf(state: EditorState): DecorationSet {
  const render = state.facet(tableRenderer)
  if (!render) return Decoration.none
  return Decoration.set(
    liveTables(state).map((table) =>
      Decoration.replace({
        widget: new Table(state.doc.sliceString(table.from, table.to), render),
        block: true
      }).range(table.from, table.to)
    )
  )
}

/**
 * How the live mode draws a Mermaid block into a box: its diagram, or its source with the
 * sentence that says why there is none; `done` once the box has its size. Without one, the
 * blocks stay source.
 */
const diagramRenderer = Facet.define<
  (source: string, box: HTMLElement, done: () => void) => void,
  ((source: string, box: HTMLElement, done: () => void) => void) | undefined
>({
  combine: (values) => values[0]
})

/** A Mermaid block of the text, drawn in place of its lines. A click into it puts the cursor there. */
class Diagram extends WidgetType {
  constructor(
    readonly source: string,
    readonly render: (source: string, box: HTMLElement, done: () => void) => void
  ) {
    super()
  }
  override eq(other: Diagram): boolean {
    return other.source === this.source
  }
  toDOM(view: EditorView): HTMLElement {
    const box = document.createElement('div')
    box.className = 'cm-live-diagram'
    // Until it is drawn, the block is its source.
    const pre = document.createElement('pre')
    pre.textContent = this.source
    box.append(pre)
    this.render(this.source, box, () => view.requestMeasure())
    const inert = (event: Event): void => {
      if ((event.target as Element).closest('a')) event.preventDefault()
    }
    for (const type of ['click', 'auxclick', 'dragstart']) box.addEventListener(type, inert)
    return box
  }
  override ignoreEvent(): boolean {
    return false
  }
}

function diagramsOf(state: EditorState): DecorationSet {
  const render = state.facet(diagramRenderer)
  if (!render) return Decoration.none
  return Decoration.set(
    liveDiagrams(state).map((diagram) =>
      Decoration.replace({ widget: new Diagram(diagram.source, render), block: true }).range(
        diagram.from,
        diagram.to
      )
    )
  )
}

/** The Mermaid blocks of the live mode, replaced as the tables are, by a field of the state. */
const diagrams = StateField.define<DecorationSet>({
  create: diagramsOf,
  update: (value, transaction) =>
    transaction.docChanged ||
    transaction.selection ||
    syntaxTree(transaction.startState) !== syntaxTree(transaction.state)
      ? diagramsOf(transaction.state)
      : value,
  provide: (field) => EditorView.decorations.from(field)
})

/**
 * The tables of the live mode. A table spans lines, and only a field of the state may replace
 * whole lines; a plugin may not (docs/plan-roadmap.md, part 11).
 */
const tables = StateField.define<DecorationSet>({
  create: tablesOf,
  update: (value, transaction) =>
    transaction.docChanged ||
    transaction.selection ||
    syntaxTree(transaction.startState) !== syntaxTree(transaction.state)
      ? tablesOf(transaction.state)
      : value,
  provide: (field) => EditorView.decorations.from(field)
})

/** The cursor moves a line down or up into a table or a diagram, rather than over it. */
const intoTable =
  (direction: 1 | -1) =>
  (view: EditorView): boolean => {
    const drawn: LiveTable[] = []
    for (const field of [tables, diagrams]) {
      view.state.field(field).between(0, view.state.doc.length, (from, to) => {
        drawn.push({ from, to })
      })
    }
    const to = stepIntoTable(view.state, drawn, direction)
    if (to === undefined) return false
    view.dispatch({ selection: { anchor: to }, scrollIntoView: true })
    return true
  }

const tableKeys = Prec.high(
  keymap.of([
    { key: 'ArrowDown', run: intoTable(1) },
    { key: 'ArrowUp', run: intoTable(-1) }
  ])
)

const live = [
  livePlugin,
  tables,
  diagrams,
  tableKeys,
  liveTheme,
  EditorView.editorAttributes.of({ class: 'cm-live' })
]

/** Where the live mode is switched on and off, per editor. */
const liveMode = new Compartment()

/** Switch the live mode of an editor on or off. The text stays as it is. */
export function setLive(view: EditorView, on: boolean): void {
  view.dispatch({ effects: liveMode.reconfigure(on ? live : []) })
}

export interface BodyEditorOptions {
  parent: HTMLElement
  text: string
  onChange: (text: string) => void
  onSave: () => void
  /** Start in the live mode. */
  live?: boolean
  /** How the live mode renders a table, as sanitized HTML. */
  renderTable?: (markdown: string) => string
  /** How the live mode draws a Mermaid block into a box, sanitized. */
  renderDiagram?: (source: string, box: HTMLElement, done: () => void) => void
}

/** A CodeMirror 6 editor for the body of an ADR. It holds plain text; nothing is ever re-serialized. */
export function createBodyEditor(options: BodyEditorOptions): EditorView {
  return new EditorView({
    parent: options.parent,
    state: EditorState.create({
      doc: options.text,
      extensions: [
        history(),
        drawSelection(),
        EditorView.lineWrapping,
        markdown({ base: markdownLanguage }),
        liveMode.of(options.live ? live : []),
        options.renderTable ? tableRenderer.of(options.renderTable) : [],
        options.renderDiagram ? diagramRenderer.of(options.renderDiagram) : [],
        syntaxHighlighting(highlighting),
        theme,
        keymap.of([
          {
            key: 'Mod-s',
            run: () => {
              options.onSave()
              return true
            }
          },
          ...defaultKeymap,
          ...historyKeymap
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) options.onChange(update.state.doc.toString())
        })
      ]
    })
  })
}

/** Put another text into the editor, e.g. the version from disk. Does nothing when it is there already. */
export function replaceText(view: EditorView, text: string): void {
  if (view.state.doc.toString() === text) return
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } })
}
