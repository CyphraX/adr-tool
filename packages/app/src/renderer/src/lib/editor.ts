import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import { EditorView, drawSelection, keymap } from '@codemirror/view'
import { tags } from '@lezer/highlight'

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

export interface BodyEditorOptions {
  parent: HTMLElement
  text: string
  onChange: (text: string) => void
  onSave: () => void
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
        markdown(),
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
