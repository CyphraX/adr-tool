import { syntaxTree } from '@codemirror/language'
import type { EditorState } from '@codemirror/state'

/**
 * What the live mode of the editor does to the text (docs/plan-roadmap.md, part 3): which marks
 * of the Markdown it hides, where a bullet stands for a list mark, and how lines and spans look.
 * It decorates and never writes: the text in the editor is the text that is saved.
 *
 * The line the cursor is in — every line a selection touches, and all of a fenced code block
 * when one of its lines is — shows its source. Tables stay source.
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

  syntaxTree(state).iterate({
    enter: (ref) => {
      const node = ref.node
      const heading = HEADING.exec(node.name)
      if (heading) {
        const line = doc.lineAt(node.from)
        marks.push({ kind: 'line', from: line.from, style: `h${Number(heading[1])}` as LineStyle })
        if (!shown(node.from, node.to)) {
          for (const mark of children(node, 'HeaderMark')) {
            // A closing sequence takes the space before it along.
            if (mark.from > line.from && doc.sliceString(mark.from - 1, mark.from) === ' ') {
              hide(mark.from - 1, mark.to)
            } else hideWithSpace(mark)
          }
        }
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
          return false
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

  /** `[text](url "title")`, `[text][label]`, `[text]`: the text stays, styled as a link. */
  function link(node: SyntaxNode): void {
    const linkMarks = children(node, 'LinkMark')
    const open = linkMarks[0]
    const close = linkMarks[1]
    if (!open || !close || doc.sliceString(open.from, open.to) !== '[') return
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

  return marks
}
