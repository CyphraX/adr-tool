import { syntaxTree } from '@codemirror/language'
import type { EditorState } from '@codemirror/state'

/**
 * What the live mode of the editor does to the text (docs/plan-roadmap.md, part 3): which marks
 * of the Markdown it hides, where a bullet stands for a list mark, and how lines and spans look.
 * It decorates and never writes: the text in the editor is the text that is saved.
 *
 * The line the cursor is in shows its source — every line a selection touches, and all of a
 * construct that one of its lines belongs to: a fenced code block, a quote, emphasis or a link
 * over several lines. Tables, images and task markers stay source.
 *
 * Every hidden range and every bullet lies within one line, and every styled span has text:
 * the editor cannot hide a line break from a plugin, and does not draw an empty mark.
 */
export type LiveMark =
  | { readonly kind: 'hide'; readonly from: number; readonly to: number }
  | { readonly kind: 'bullet'; readonly from: number; readonly to: number }
  | { readonly kind: 'line'; readonly from: number; readonly style: LineStyle }
  | { readonly kind: 'span'; readonly from: number; readonly to: number; readonly style: SpanStyle }

export type LineStyle = `h${1 | 2 | 3 | 4 | 5 | 6}` | 'code-block' | 'quote' | 'rule'
export type SpanStyle = 'code' | 'link'

type SyntaxNode = ReturnType<typeof syntaxTree>['topNode']

const HEADING = /^ATXHeading([1-6])$/
const SETEXT = /^SetextHeading([12])$/

/** A link label as Markdown compares them: case folded, runs of white space as one space. */
const labelOf = (text: string): string => text.trim().replace(/\s+/g, ' ').toLowerCase()

export function liveMarks(state: EditorState): LiveMark[] {
  const marks: LiveMark[] = []
  const doc = state.doc
  const active = new Set<number>()
  for (const range of state.selection.ranges) {
    const first = doc.lineAt(range.from).number
    const last = doc.lineAt(range.to).number
    for (let line = first; line <= last; line++) active.add(line)
  }
  /** Whether any line from `from` to `to` shows its source. */
  const shown = (from: number, to: number): boolean => {
    const last = doc.lineAt(to).number
    for (let line = doc.lineAt(from).number; line <= last; line++) {
      if (active.has(line)) return true
    }
    return false
  }
  const hide = (from: number, to: number): void => {
    if (to > from) marks.push({ kind: 'hide', from, to })
  }
  /** A mark with the one space that follows it, as after `#` or `>`. */
  const hideWithSpace = (node: SyntaxNode): void => {
    const next = doc.sliceString(node.to, node.to + 1)
    hide(node.from, next === ' ' ? node.to + 1 : node.to)
  }
  const children = (node: SyntaxNode, name: string): SyntaxNode[] => node.getChildren(name)
  const tree = syntaxTree(state)

  // `[x]` is a link only where a definition `[x]: …` says so; otherwise it is text in brackets.
  const defined = new Set<string>()
  tree.iterate({
    enter: (ref) => {
      if (ref.name !== 'LinkReference') return
      const label = ref.node.getChild('LinkLabel')
      if (label) defined.add(labelOf(doc.sliceString(label.from + 1, label.to - 1)))
      return false
    }
  })

  tree.iterate({
    enter: (ref) => {
      const node = ref.node
      const heading = HEADING.exec(node.name)
      if (heading) {
        const line = doc.lineAt(node.from)
        marks.push({ kind: 'line', from: line.from, style: `h${Number(heading[1])}` as LineStyle })
        if (!shown(node.from, node.to)) {
          children(node, 'HeaderMark').forEach((mark, position) => {
            // The opening sequence takes the space after it along, a closing one the space before.
            if (position === 0) hideWithSpace(mark)
            else
              hide(
                doc.sliceString(mark.from - 1, mark.from) === ' ' ? mark.from - 1 : mark.from,
                mark.to
              )
          })
        }
        return
      }
      const setext = SETEXT.exec(node.name)
      if (setext) {
        const underline = node.getChild('HeaderMark')
        const style = `h${Number(setext[1])}` as LineStyle
        for (let at = node.from; at <= (underline?.from ?? node.to) - 1;) {
          const line = doc.lineAt(at)
          marks.push({ kind: 'line', from: line.from, style })
          at = line.to + 1
        }
        if (underline && !shown(node.from, node.to)) hide(underline.from, underline.to)
        return
      }
      switch (node.name) {
        case 'Emphasis':
        case 'StrongEmphasis':
          if (!shown(node.from, node.to)) {
            for (const mark of children(node, 'EmphasisMark')) hide(mark.from, mark.to)
          }
          return
        case 'Strikethrough':
          if (!shown(node.from, node.to)) {
            for (const mark of children(node, 'StrikethroughMark')) hide(mark.from, mark.to)
          }
          return
        case 'InlineCode': {
          const codeMarks = children(node, 'CodeMark')
          const start = codeMarks[0]?.to ?? node.from
          const end = codeMarks.at(-1)?.from ?? node.to
          if (!shown(node.from, node.to)) {
            for (const mark of codeMarks) hide(mark.from, mark.to)
          }
          if (end > start) marks.push({ kind: 'span', from: start, to: end, style: 'code' })
          return false
        }
        case 'Link':
          link(node)
          // Emphasis and code in the text of a link are rendered as anywhere else.
          return
        case 'Autolink': {
          const linkMarks = children(node, 'LinkMark')
          if (!shown(node.from, node.to)) for (const mark of linkMarks) hide(mark.from, mark.to)
          const start = linkMarks[0]?.to ?? node.from
          const end = linkMarks.at(-1)?.from ?? node.to
          marks.push({ kind: 'span', from: start, to: end, style: 'link' })
          return false
        }
        case 'ListMark': {
          const item = node.parent
          const bullet = item?.parent?.name === 'BulletList'
          if (bullet && !shown(node.from, node.to)) {
            marks.push({ kind: 'bullet', from: node.from, to: node.to })
          }
          return
        }
        case 'Blockquote':
          for (let at = node.from; at <= node.to;) {
            const line = doc.lineAt(at)
            marks.push({ kind: 'line', from: line.from, style: 'quote' })
            at = line.to + 1
          }
          if (!shown(node.from, node.to)) {
            for (const mark of quoteMarks(node)) hideWithSpace(mark)
          }
          return
        case 'CodeBlock':
          for (let at = node.from; at <= node.to;) {
            const line = doc.lineAt(at)
            marks.push({ kind: 'line', from: line.from, style: 'code-block' })
            at = line.to + 1
          }
          return false
        case 'Escape':
          if (!shown(node.from, node.to)) hide(node.from, node.from + 1)
          return
        case 'FencedCode': {
          for (let at = node.from; at <= node.to;) {
            const line = doc.lineAt(at)
            marks.push({ kind: 'line', from: line.from, style: 'code-block' })
            at = line.to + 1
          }
          if (!shown(node.from, node.to)) {
            for (const mark of [...children(node, 'CodeMark'), ...children(node, 'CodeInfo')]) {
              hide(mark.from, mark.to)
            }
          }
          return false
        }
        case 'HorizontalRule':
          marks.push({ kind: 'line', from: doc.lineAt(node.from).from, style: 'rule' })
          if (!shown(node.from, node.to)) hide(node.from, node.to)
          return
        case 'Table':
          return false
        default:
          return
      }
    }
  })

  /**
   * `[text](url "title")`, and `[text][label]`, `[text][]`, `[text]` where the label is
   * defined: the text stays, styled as a link. Brackets that are no link stay as they are.
   */
  function link(node: SyntaxNode): void {
    const linkMarks = children(node, 'LinkMark')
    const open = linkMarks[0]
    const close = linkMarks[1]
    if (!open || !close || doc.sliceString(open.from, open.to) !== '[') return
    const inline = linkMarks.some((mark) => doc.sliceString(mark.from, mark.to) === '(')
    if (!inline) {
      const label = node.getChild('LinkLabel')
      const name = label
        ? doc.sliceString(label.from + 1, label.to - 1)
        : doc.sliceString(open.to, close.from)
      // `[text][]` names itself.
      const named =
        labelOf(name) === '' ? labelOf(doc.sliceString(open.to, close.from)) : labelOf(name)
      if (!defined.has(named)) return
    }
    marks.push({ kind: 'span', from: open.to, to: close.from, style: 'link' })
    if (shown(node.from, node.to)) return
    hide(open.from, open.to)
    hide(close.from, node.to)
  }

  function quoteMarks(node: SyntaxNode): SyntaxNode[] {
    const found: SyntaxNode[] = []
    const cursor = node.cursor()
    cursor.iterate((child) => {
      if (child.name === 'QuoteMark') found.push(child.node)
    })
    return found
  }

  return onLines(marks, state)
}

/**
 * What the editor can draw: a hidden range is cut where a line ends — the line break itself
 * stays —, a bullet that is not on one line and a span without text are left out.
 */
function onLines(marks: readonly LiveMark[], state: EditorState): LiveMark[] {
  const doc = state.doc
  return marks.flatMap((mark): LiveMark[] => {
    switch (mark.kind) {
      case 'hide': {
        const pieces: LiveMark[] = []
        for (let from = mark.from; from < mark.to;) {
          const line = doc.lineAt(from)
          const to = Math.min(mark.to, line.to)
          if (to > from) pieces.push({ kind: 'hide', from, to })
          from = line.to + 1
        }
        return pieces
      }
      case 'bullet':
        return mark.to > mark.from && doc.lineAt(mark.from).to >= mark.to ? [mark] : []
      case 'span':
        return mark.to > mark.from ? [mark] : []
      case 'line':
        return [mark]
    }
  })
}
