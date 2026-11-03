import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { ensureSyntaxTree } from '@codemirror/language'
import { EditorSelection, EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import {
  liveDiagrams,
  liveMarks,
  liveTables,
  stepIntoTable,
  type LiveMark
} from '../src/renderer/src/lib/live'

/** The text with the cursor at `‸`, as the live mode sees it. */
function stateOf(text: string): EditorState {
  const cursor = text.indexOf('‸')
  const doc = text.replace('‸', '')
  const state = EditorState.create({
    doc,
    selection: EditorSelection.cursor(cursor === -1 ? doc.length : cursor),
    extensions: [markdown({ base: markdownLanguage })]
  })
  ensureSyntaxTree(state, state.doc.length, 5000)
  return state
}

function marksOf(text: string): { doc: string; marks: LiveMark[] } {
  const state = stateOf(text)
  return { doc: state.doc.toString(), marks: liveMarks(state) }
}

/** The source of each table the live mode draws as a table. */
function tablesOf(text: string): string[] {
  const state = stateOf(text)
  return liveTables(state).map((table) => state.doc.sliceString(table.from, table.to))
}

/** What a reader sees of each line: the hidden marks taken out, bullets as `•`. */
function rendered(text: string): string {
  const { doc, marks } = marksOf(text)
  const gone = new Set<number>()
  const bullets = new Set<number>()
  for (const mark of marks) {
    if (mark.kind !== 'hide' && mark.kind !== 'bullet') continue
    if (mark.kind === 'bullet') bullets.add(mark.from)
    for (let at = mark.from; at < mark.to; at++) gone.add(at)
  }
  let out = ''
  for (let at = 0; at < doc.length; at++) {
    if (bullets.has(at)) out += '•'
    if (!gone.has(at)) out += doc[at]
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

  it('leaves the marks inside a table alone: the table is drawn as a whole', () => {
    const table = '| a | b |\n| - | - |\n| **1** | 2 |'
    expect(rendered(`${table}\n\n‸`)).toBe(`${table}\n\n`)
  })

  // docs/plan-roadmap.md, part 11
  it('draws a table as a table while the cursor is outside it, and as source inside', () => {
    const table = '| Option | Cost |\n| :----- | ---: |\n| **A** | 1 |\n| B | 2 |'
    expect(tablesOf(`# T\n\n${table}\n\nAfter.‸`)).toEqual([table])
    expect(tablesOf(`# T\n\n${table}`)).toEqual([])
    expect(tablesOf(`# T‸\n\n${table}\n`)).toEqual([table])
    // Any line of it, the delimiter row too, shows the whole table's source.
    const inside = table.replace(':-----', ':--‸---')
    expect(tablesOf(`# T\n\n${inside}\n\nAfter.`)).toEqual([])
    // Two tables: only the one with the cursor shows its source.
    expect(tablesOf(`${table}\n\n${table}\n\n| x |\n| - |\n| y‸ |`)).toEqual([table, table])
    // Without a delimiter row, it is no table.
    expect(tablesOf('| a | b |\n| 1 | 2 |\n\n‸')).toEqual([])
    // In a quote or a list, a table stays text, as the lines around it do.
    expect(tablesOf('> | a |\n> | - |\n> | 1 |\n\nAfter.‸')).toEqual([])
    expect(tablesOf('- item\n\n  | a |\n  | - |\n  | 1 |\n\nAfter.‸')).toEqual([])
  })

  it('moves the cursor a line down or up into a table, not over it', () => {
    const table = '| a | b |\n| - | - |\n| 1 | 2 |'
    const step = (text: string, direction: 1 | -1): number | undefined => {
      const state = stateOf(text)
      return stepIntoTable(state, liveTables(state), direction)
    }
    const doc = `Above‸\n${table}\nBelow`
    // Down from the line above: the start of the table's first line.
    expect(step(doc, 1)).toBe('Above\n'.length)
    // Up from the blank line below: the start of its last line.
    expect(step(`Above\n${table}\n‸\nBelow`, -1)).toBe(`Above\n${table}`.lastIndexOf('\n') + 1)
    // Away from a table, or with a selection, it is an ordinary move.
    expect(step(doc, -1)).toBeUndefined()
    expect(step(`Ab‸ove\n\n${table}`, 1)).toBeUndefined()
  })

  it('hides a closing sequence of a heading with the space before it', () => {
    expect(rendered('## Context ##\n\n‸')).toBe('Context\n\n')
  })

  it('renders ATX and setext headings, also in a quote', () => {
    expect(rendered('> # Heard\n\n‸')).toBe('Heard\n\n')
    expect(rendered('Title\n=====\n\nPart\n----\n\n‸')).toBe('Title\n\n\nPart\n\n\n')
    expect(styles('Title\n=====\n\n‸')).toEqual(['h1'])
    expect(rendered('Ti‸tle\n=====')).toBe('Title\n=====')
  })

  it('renders the text of a link, emphasis in it included', () => {
    expect(rendered('See [**the** other](0002.md).\n\n‸')).toBe('See the other.\n\n')
  })

  it('takes brackets for a link only where the label is defined', () => {
    expect(rendered('Pick [x] or [y][].\n\n‸')).toBe('Pick [x] or [y][].\n\n')
    const defined = 'Pick [x] or [y][].\n\n[x]: a.md\n[Y]: b.md\n\n‸'
    expect(rendered(defined)).toBe('Pick x or y.\n\n[x]: a.md\n[Y]: b.md\n\n')
  })

  it('hides a link over two lines on each of them, and never the line break', () => {
    const text = 'See [the\nother](0002.md "a\nb").\n\n‸'
    expect(rendered(text)).toBe('See the\nother\n.\n\n')
    const { doc, marks } = marksOf(text)
    for (const mark of marks) {
      if (mark.kind === 'hide') expect(doc.slice(mark.from, mark.to)).not.toContain('\n')
    }
  })

  it('draws no span for a link without text', () => {
    const { marks } = marksOf('An empty [](0002.md) link.\n\n‸')
    expect(marks.filter((mark) => mark.kind === 'span')).toEqual([])
  })

  it('hides the backslash of an escape, and leaves indented code as it is', () => {
    expect(rendered('Not \\*emphasis\\*.\n\n‸')).toBe('Not *emphasis*.\n\n')
    expect(rendered('Not \\*emph‸asis\\*.')).toBe('Not \\*emphasis\\*.')
    expect(rendered('    **code**\n\n‸')).toBe('    **code**\n\n')
    expect(styles('    code\n\n‸')).toEqual(['code-block'])
  })

  it('only ever hides within a line and draws spans with text, wherever the cursor is', () => {
    const corpus = [
      '# A decision #',
      '',
      'Title',
      '=====',
      '',
      '> # Heard',
      '> over **two',
      '> lines**',
      '',
      'See [the',
      'other](0002.md "a',
      'b") and [](x.md), [x], [y][] and <https://example.org>.',
      '',
      '[y]: y.md',
      '',
      '- one',
      '-',
      '  * nested',
      '',
      '```',
      'code',
      '```',
      '',
      '    indented',
      '',
      '***',
      '',
      '| a | b |',
      '| - | - |',
      '',
      'Escaped \\# and `` ` `` and ~~gone~~.'
    ].join('\n')
    const lines = corpus.split('\n')
    let start = 0
    for (const line of lines) {
      const { doc, marks } = marksOf(corpus.slice(0, start) + '‸' + corpus.slice(start))
      for (const mark of marks) {
        if (mark.kind === 'line') continue
        expect(mark.to, `${mark.kind} at ${mark.from}`).toBeGreaterThan(mark.from)
        if (mark.kind !== 'span') {
          expect(doc.slice(mark.from, mark.to), `${mark.kind} at ${mark.from}`).not.toContain('\n')
        }
      }
      start += line.length + 1
    }
  })
})

describe('a Mermaid block in the live mode (docs/plan-vision.md, part 2)', () => {
  const diagramsOf = (text: string): { lines: string; source: string }[] => {
    const state = stateOf(text)
    return liveDiagrams(state).map((diagram) => ({
      lines: state.doc.sliceString(diagram.from, diagram.to),
      source: diagram.source
    }))
  }
  const BLOCK = '```mermaid\nflowchart LR\n  a --> b\n```'

  it('is drawn in place of its lines while the cursor is elsewhere', () => {
    expect(diagramsOf(`‸# A\n\n${BLOCK}\n\nText.\n`)).toEqual([
      { lines: BLOCK, source: 'flowchart LR\n  a --> b' }
    ])
  })

  it('shows its source, all of it, while the cursor is in one of its lines', () => {
    expect(diagramsOf('# A\n\n```mermaid\nflowchart LR\n  a -‸-> b\n```\n')).toEqual([])
    expect(diagramsOf('# A\n\n```mermaid\nflowchart LR\n  a --> b\n```‸\n')).toEqual([])
  })

  it('is only a block whose info string starts with mermaid, and not one in a quote', () => {
    expect(diagramsOf('‸\n```ts\nconst a = 1\n```\n')).toEqual([])
    expect(diagramsOf('‸\n```mermaid title="x"\ngraph TD\n```\n')).toEqual([
      { lines: '```mermaid title="x"\ngraph TD\n```', source: 'graph TD' }
    ])
    expect(diagramsOf('‸\n> ```mermaid\n> graph TD\n> ```\n')).toEqual([])
  })

  it('runs to the end of the text when it is never closed', () => {
    expect(diagramsOf('‸\n```mermaid\ngraph TD\n  a\n')).toEqual([
      { lines: '```mermaid\ngraph TD\n  a', source: 'graph TD\n  a' }
    ])
  })

  it('is stepped into from the line above and below, as a table is', () => {
    const state = stateOf(`Above‸\n${BLOCK}\nBelow\n`)
    expect(stepIntoTable(state, liveDiagrams(state), 1)).toBe('Above\n'.length)
  })
})
