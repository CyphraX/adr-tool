import { go } from '@codemirror/lang-go'
import { html } from '@codemirror/lang-html'
import { java } from '@codemirror/lang-java'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { HighlightStyle, syntaxHighlighting, type LanguageSupport } from '@codemirror/language'
import { Compartment, EditorState, RangeSetBuilder, type Text } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  drawSelection,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  type DecorationSet
} from '@codemirror/view'
import { defaultKeymap } from '@codemirror/commands'
import { tags } from '@lezer/highlight'
import {
  annotationTheme,
  annotationsIn,
  selectLineOnNumber,
  selectedLines,
  type CodeAnnotation,
  type Lines
} from './code-annotations'

// The code viewer: read-only, in the languages of the Structure format's section 2, with
// the lines a Dependency points at marked. The colours come from the app's tokens.

/** How a Source File is highlighted, by its extension. A Svelte component reads as HTML whose script is TypeScript. */
export function languageFor(path: string): LanguageSupport | undefined {
  const extension = /\.([^./]+)$/.exec(path)?.[1]
  switch (extension) {
    case 'ts':
    case 'mts':
    case 'cts':
      return javascript({ typescript: true })
    case 'tsx':
      return javascript({ typescript: true, jsx: true })
    case 'js':
    case 'mjs':
    case 'cjs':
      return javascript()
    case 'jsx':
      return javascript({ jsx: true })
    case 'svelte':
      return html()
    case 'java':
      return java()
    case 'py':
      return python()
    case 'go':
      return go()
    default:
      return undefined
  }
}

const marked = Decoration.line({ class: 'cm-marked' })

/**
 * The text as the viewer shows it, line for line as an Anchor counts lines (docs/review-format.md,
 * section 2): a line ends with LF or CRLF. A carriage return that ends no line is shown as ␍
 * inside its line, as git shows it, so that line 12 of the viewer is line 12 of an Annotation.
 */
export const viewedText = (text: string): string =>
  text.replace(/\r\n/g, '\n').replace(/\r/g, '\u240d')

/** Lines `start` to `end` of a text, counted from 1 as an Anchor counts them: what it quotes. */
export const quotedLines = (text: string, start: number, end: number): string[] =>
  viewedText(text)
    .split('\n')
    .slice(start - 1, end)

/**
 * The lines to mark, counted from 1. A line the text no longer has — the file changed since
 * it was analysed — is left out.
 */
export function markLines(doc: Text, lines: readonly number[]): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  for (const line of [...new Set(lines)].sort((a, b) => a - b)) {
    if (line >= 1 && line <= doc.lines)
      builder.add(doc.line(line).from, doc.line(line).from, marked)
  }
  return builder.finish()
}

const theme = EditorView.theme({
  '&': { height: '100%', color: 'var(--ink)', backgroundColor: 'var(--paper)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--code)', fontSize: '12.5px', lineHeight: '1.6' },
  '.cm-content': { padding: '10px 0 48px', caretColor: 'transparent' },
  '.cm-line': { padding: '0 16px 0 10px' },
  '.cm-gutters': {
    backgroundColor: 'var(--panel-raised)',
    color: 'var(--ink-faint)',
    borderRight: '1px solid var(--line)'
  },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 10px 0 14px' },
  '.cm-marked': {
    backgroundColor: 'var(--code-marked)',
    boxShadow: 'inset 3px 0 0 var(--code-marked-edge)'
  },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'var(--selected)'
  }
})

const highlighting = HighlightStyle.define([
  {
    tag: [tags.keyword, tags.controlKeyword, tags.moduleKeyword, tags.definitionKeyword],
    color: 'var(--code-keyword)'
  },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], color: 'var(--code-string)' },
  {
    tag: [tags.comment, tags.lineComment, tags.blockComment],
    color: 'var(--code-comment)',
    fontStyle: 'italic'
  },
  { tag: [tags.typeName, tags.className, tags.namespace, tags.tagName], color: 'var(--code-type)' },
  {
    tag: [tags.number, tags.bool, tags.null, tags.atom, tags.attributeName],
    color: 'var(--code-literal)'
  },
  { tag: [tags.meta, tags.annotation, tags.processingInstruction], color: 'var(--ink-soft)' }
])

export interface CodeViewer {
  /**
   * Show a text, the lines to mark, and the line to bring into view: the one asked for, or
   * else the first marked one. A new text starts from its top.
   */
  show(file: { path: string; text: string }, marks: readonly number[], line?: number): void
  /** Show the Annotations of the file beside their lines, `selected` among them (part 9 of the vision). */
  annotate(annotations: readonly CodeAnnotation[], selected: string | undefined): void
  /** Let go of the lines selected: they were annotated, or an Annotation attached to them. */
  deselect(): void
  /** Take the keyboard: the code is what is read now. */
  focus(): void
  destroy(): void
}

/** What the viewer tells whoever shows it: lines selected, and an Annotation clicked. */
export interface CodeViewerEvents {
  readonly onselect?: (lines: Lines | undefined) => void
  readonly onannotation?: (id: string) => void
}

export function createCodeViewer(parent: HTMLElement, events: CodeViewerEvents = {}): CodeViewer {
  const language = new Compartment()
  const marks = new Compartment()
  const annotations = new Compartment()
  let shownAnnotations: { list: readonly CodeAnnotation[]; selected: string | undefined } = {
    list: [],
    selected: undefined
  }
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: '',
      extensions: [
        EditorState.readOnly.of(true),
        annotations.of([]),
        lineNumbers({
          domEventHandlers: {
            mousedown: (view, line, event) => selectLineOnNumber(view, line.from, event)
          }
        }),
        highlightSpecialChars(),
        drawSelection(),
        syntaxHighlighting(highlighting),
        language.of([]),
        marks.of([]),
        theme,
        annotationTheme,
        keymap.of(defaultKeymap),
        EditorView.contentAttributes.of({ 'aria-readonly': 'true' }),
        EditorView.updateListener.of((update) => {
          if (update.selectionSet || update.docChanged)
            events.onselect?.(selectedLines(update.state))
        })
      ]
    })
  })
  let shown: { path: string; text: string } | undefined
  function open(id: string): void {
    events.onannotation?.(id)
  }

  return {
    show(file, lines, line) {
      if (shown?.path !== file.path || shown.text !== file.text) {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: viewedText(file.text) },
          effects: language.reconfigure(languageFor(file.path) ?? []),
          selection: { anchor: 0 }
        })
        shown = file
      }
      const doc = view.state.doc
      const target = line ?? lines[0]
      view.dispatch({
        effects: [
          marks.reconfigure(EditorView.decorations.of(markLines(doc, lines))),
          // The Annotations of the text as it is now: a line it no longer has has none.
          annotations.reconfigure(
            annotationsIn(doc, shownAnnotations.list, shownAnnotations.selected, open)
          ),
          ...(target !== undefined && target >= 1 && target <= doc.lines
            ? [EditorView.scrollIntoView(doc.line(target).from, { y: 'center' })]
            : [EditorView.scrollIntoView(0, { y: 'start' })])
        ]
      })
    },
    annotate(list, selected) {
      shownAnnotations = { list, selected }
      view.dispatch({
        effects: annotations.reconfigure(annotationsIn(view.state.doc, list, selected, open))
      })
    },
    deselect() {
      if (!view.state.selection.main.empty)
        view.dispatch({ selection: { anchor: view.state.selection.main.head } })
    },
    focus() {
      view.focus()
    },
    destroy() {
      view.destroy()
    }
  }
}
