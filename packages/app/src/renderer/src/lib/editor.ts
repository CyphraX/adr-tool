import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { HighlightStyle, syntaxHighlighting, syntaxTree } from '@codemirror/language'
import { Compartment, EditorState, type Range } from '@codemirror/state'
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
import { liveMarks } from './live'

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
  const ranges: Range<Decoration>[] = liveMarks(state).map((mark) => {
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

/** Decorations of the live mode, recomputed as the text, the cursor or the parse moves. */
const livePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = decorationsOf(view.state)
    }
    update(update: ViewUpdate): void {
      if (
        update.docChanged ||
        update.selectionSet ||
        syntaxTree(update.startState) !== syntaxTree(update.state)
      ) {
        this.decorations = decorationsOf(update.state)
      }
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
  '.cm-live-bullet': { color: 'var(--ink-soft)' }
})

const live = [livePlugin, liveTheme, EditorView.editorAttributes.of({ class: 'cm-live' })]

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
