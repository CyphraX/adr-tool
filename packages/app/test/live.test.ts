import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { ensureSyntaxTree } from '@codemirror/language'
import { EditorSelection, EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { liveMarks, type LiveMark } from '../src/renderer/src/lib/live'

/** The text with the cursor at `‸`, as the live mode sees it. */
function marksOf(text: string): { doc: string; marks: LiveMark[] } {
  const cursor = text.indexOf('‸')
  const doc = text.replace('‸', '')
  const state = EditorState.create({
    doc,
    selection: EditorSelection.cursor(cursor === -1 ? doc.length : cursor),
    extensions: [markdown({ base: markdownLanguage })]
  })
  ensureSyntaxTree(state, state.doc.length, 5000)
  return { doc, marks: liveMarks(state) }
}

/** What a reader sees of each line: the hidden marks taken out, bullets as `•`. */
function rendered(text: string): string {
  const { doc, marks } = marksOf(text)
  const cuts = marks
    .filter((mark) => mark.kind === 'hide' || mark.kind === 'bullet')
    .sort((a, b) => b.from - a.from)
  let out = doc
  for (const cut of cuts) {
    out = out.slice(0, cut.from) + (cut.kind === 'bullet' ? '•' : '') + out.slice(cut.to)
  }
  return out
}

const styles = (text: string): string[] =>
  marksOf(text)
    .marks.filter((mark) => mark.kind === 'line' || mark.kind === 'span')
    .map((mark) => (mark.kind === 'span' ? `${mark.style} ${mark.from}-${mark.to}` : mark.style))

describe('the live mode of the editor (docs/plan-roadmap.md, part 3)', () => {
  it('renders headings, emphasis, code, links and lists where the cursor is not', () => {
    const text = [
      '# A decision',
      '',
      'It is **firm**, *mostly*, ~~never~~ and `code`; see [the other](0002-other.md).',
      '',
      '- one',
      '* two',
      '1. first',
      '',
      '> A quote',
      '',
      '‸'
    ].join('\n')
    expect(rendered(text)).toBe(
      [
        'A decision',
        '',
        'It is firm, mostly, never and code; see the other.',
        '',
        '• one',
        '• two',
        '1. first',
        '',
        'A quote',
        '',
        ''
      ].join('\n')
    )
  })

  it('shows the source of the line the cursor is in, and only of that line', () => {
    expect(rendered('# A ‸decision\n\nIt is **firm**.')).toBe('# A decision\n\nIt is firm.')
    expect(rendered('# A decision\n\nIt is **fi‸rm**.')).toBe('A decision\n\nIt is **firm**.')
  })

  it('shows all of a fenced code block while the cursor is in one of its lines', () => {
    const block = '```ts\nconst a = 1\n```'
    expect(rendered(`${block}\n\n‸`)).toBe('\nconst a = 1\n\n\n')
    expect(rendered('```ts\nconst ‸a = 1\n```')).toBe(block)
    expect(styles(`${block}\n\n‸`)).toEqual(['code-block', 'code-block', 'code-block'])
  })

  it('gives lines and spans their look', () => {
    expect(styles('## Context\n\nSee `x` and [y](z.md).\n\n---\n\n‸')).toEqual([
      'h2',
      'code 17-18',
      'link 25-26',
      'rule'
    ])
  })

  it('leaves tables as their source', () => {
    const table = '| a | b |\n| - | - |\n| **1** | 2 |'
    expect(rendered(`${table}\n\n‸`)).toBe(`${table}\n\n`)
  })

  it('hides a closing sequence of a heading with the space before it', () => {
    expect(rendered('## Context ##\n\n‸')).toBe('Context\n\n')
  })
})
