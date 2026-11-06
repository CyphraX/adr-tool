import { EditorSelection, EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { memoryFileSystem, openRepository, type Repository } from '@adr-tool/core'
import type { Anchor } from '@adr-tool/review'
import type { AnnotationView, ReviewOverview, StructureOutline } from '../src/shared/ipc'
import { columnsOf, selectedLines } from '../src/renderer/src/lib/code-annotations'
import { repositoryProblems } from '../src/renderer/src/lib/repository-problems'
import {
  anchorStateOf,
  attachPathOf,
  citationOf,
  citedBy,
  citing,
  facetCounts,
  filtered,
  firstLine,
  linesOf,
  onFile,
  openOf,
  ownersOf,
  placeOf,
  reviewSection,
  searchAnnotations
} from '../src/renderer/src/lib/review'

// docs/plan-vision.md, part 9: what the window makes of the Annotations the main process found.

const anchor = (path: string, start: number, end: number): Anchor => ({
  path,
  start,
  end,
  quote: Array.from({ length: end - start + 1 }, (_, at) => `line ${start + at}`)
})

const annotation = (id: string, fields: Partial<AnnotationView> = {}): AnnotationView => ({
  id,
  path: `docs/architecture/annotations/${id}.md`,
  type: 'note',
  state: 'open',
  author: 'Aylin Demir',
  date: '2026-11-02',
  anchor: anchor('cart/Cart.java', 12, 14),
  cites: [],
  text: 'A note.',
  replies: [],
  writable: true,
  ...fields
})

const OUTLINE: StructureOutline = {
  repositoryId: 'r1',
  current: true,
  analysedAt: 0,
  origin: 'declared',
  components: [
    { id: 'cart', name: 'Cart' },
    { id: 'cart/lines', name: 'Lines' },
    { id: 'web', name: 'Web' }
  ],
  sourceFiles: [
    { path: 'cart/Cart.java', component: 'cart', test: false },
    { path: 'cart/lines/Line.java', component: 'cart/lines', test: false },
    { path: 'web/Page.java', component: 'web', test: false },
    { path: 'tools/Gen.java', test: false }
  ],
  problems: [],
  hints: []
}

const MOVED = annotation('20261102-moved', {
  type: 'concern',
  text: '## Why\n\nThe total is computed on every call.',
  found: {
    kind: 'moved',
    anchor: { ...anchor('cart/Cart.java', 20, 22), commit: 'c'.repeat(40) },
    similarity: 1
  }
})
const ORPHANED = annotation('20261101-orphaned', {
  type: 'question',
  author: 'Lena Becker',
  date: '2026-11-01',
  anchor: anchor('cart/lines/Line.java', 3, 4),
  found: { kind: 'orphaned', file: 'there' }
})
const RESOLVED = annotation('20261103-resolved', {
  state: 'resolved',
  author: undefined,
  date: '2026-11-03',
  anchor: anchor('web/Page.java', 9, 9),
  found: { kind: 'unchanged', anchor: anchor('web/Page.java', 9, 9) },
  replies: [{ path: 'r.md', author: 'Lena Becker', text: 'Cached per cart now.' }]
})
const NOWHERE = annotation('20261103-nowhere', {
  date: '2026-11-03',
  anchor: anchor('tools/Gen.java', 1, 1),
  text: '```java\ncode\n```\n- Generated, never edited.'
})
const ALL = [MOVED, ORPHANED, RESOLVED, NOWHERE]

describe('where an Annotation is now', () => {
  it('is where its Anchor was found again, and nowhere when it is orphaned', () => {
    expect(placeOf(MOVED)).toEqual({ path: 'cart/Cart.java', start: 20, end: 22 })
    expect(placeOf(ORPHANED)).toBeUndefined()
    expect(placeOf(annotation('a'))).toEqual({ path: 'cart/Cart.java', start: 12, end: 14 })
    expect(placeOf(annotation('b', { anchor: undefined }))).toBeUndefined()
    expect(ALL.map(anchorStateOf)).toEqual(['moved', 'orphaned', 'unchanged', 'unchanged'])
    expect(anchorStateOf(annotation('c', { anchor: undefined }))).toBe('unread')
    expect(linesOf({ start: 3, end: 3 })).toBe('3')
    expect(linesOf({ start: 3, end: 5 })).toBe('3–5')
    expect(onFile(ALL, 'cart/Cart.java').map((one) => one.id)).toEqual([MOVED.id])
  })

  it('says its first line without the marks of Markdown and past a code block', () => {
    expect(firstLine(MOVED.text)).toBe('Why')
    expect(firstLine(NOWHERE.text)).toBe('code')
    expect(firstLine('\n\n> 1. Quoted')).toBe('1. Quoted')
    expect(firstLine('   ')).toBe('')
  })
})

describe('the filters of the sidebar', () => {
  const owners = ownersOf(OUTLINE)

  it('leave the Annotations of a Component and those inside it, newest first', () => {
    // On the same day, by ID.
    expect(filtered(ALL, {}, owners).map((one) => one.id)).toEqual([
      NOWHERE.id,
      RESOLVED.id,
      MOVED.id,
      ORPHANED.id
    ])
    // The orphaned Annotation keeps the Component of the file its Anchor names.
    expect(filtered(ALL, { component: 'cart' }, owners).map((one) => one.id)).toEqual([
      MOVED.id,
      ORPHANED.id
    ])
    expect(filtered(ALL, { component: null }, owners).map((one) => one.id)).toEqual([NOWHERE.id])
    expect(filtered(ALL, { anchor: 'orphaned' }, owners).map((one) => one.id)).toEqual([
      ORPHANED.id
    ])
    expect(filtered(ALL, { author: '' }, owners).map((one) => one.id)).toEqual([RESOLVED.id])
    expect(openOf('cart', ALL, owners).map((one) => one.id)).toEqual([MOVED.id, ORPHANED.id])
    expect(openOf('web', ALL, owners)).toEqual([])
  })

  it('count each row with the other facets applied, a Component at the top', () => {
    const counts = facetCounts(ALL, { state: 'open' }, owners)
    expect(counts.all).toBe(3)
    // The states are counted as if no state were chosen: a click on one shows that many.
    expect([...counts.states]).toEqual([
      ['open', 3],
      ['resolved', 1]
    ])
    expect([...counts.components]).toEqual([
      ['cart', 2],
      [null, 1]
    ])
    expect([...counts.anchors]).toEqual([
      ['moved', 1],
      ['orphaned', 1]
    ])
    expect(counts.authors.get('Aylin Demir')).toBe(2)
    expect(counts.authors.get('')).toBeUndefined()
  })

  it('know no Component before Structure has analysed the code', () => {
    expect(ownersOf(undefined).size).toBe(0)
    expect(ownersOf(OUTLINE)).toBe(ownersOf(OUTLINE))
  })
})

async function repository(): Promise<Repository> {
  return openRepository(
    memoryFileSystem({
      '.adr/config.yml': 'logs:\n  - path: docs/adr\n  - path: billing/adr\n',
      'docs/adr/0001-cart.md': '---\nstatus: accepted\n---\n\n# Cart\n',
      'docs/adr/0002-shared.md': '---\nstatus: accepted\n---\n\n# Shared\n',
      'billing/adr/0002-shared.md': '---\nstatus: proposed\n---\n\n# Shared too\n'
    })
  )
}

describe('the Traces of Annotations to ADRs', () => {
  it('name an ADR by its bare ID where only one log has it, and with its log otherwise', async () => {
    const repo = await repository()
    expect(citationOf(repo, 'docs/adr', '0001-cart')).toBe('0001-cart')
    expect(citationOf(repo, 'billing/adr', '0002-shared')).toBe('billing/adr/0002-shared')
    const cites = annotation('a', {
      cites: ['0001-cart', 'billing/adr/0002-shared', '0009-gone']
    })
    expect(citedBy(cites, repo)).toEqual([
      { item: '0001-cart', found: { logPath: 'docs/adr', id: '0001-cart' } },
      { item: 'billing/adr/0002-shared', found: { logPath: 'billing/adr', id: '0002-shared' } },
      { item: '0009-gone' }
    ])
    expect(citing([cites, MOVED], repo, 'billing/adr', '0002-shared')).toEqual([cites])
    expect(citing([cites, MOVED], repo, 'docs/adr', '0002-shared')).toEqual([])
  })
})

describe('the search', () => {
  it('finds Annotations by every word, the ID and the first line first', () => {
    expect(searchAnnotations(ALL, 'cached').map((hit) => hit.annotation.id)).toEqual([RESOLVED.id])
    expect(searchAnnotations(ALL, 'ORPHANED').map((hit) => hit.annotation.id)).toEqual([
      ORPHANED.id
    ])
    expect(searchAnnotations(ALL, 'line.java').map((hit) => hit.annotation.id)).toEqual([
      ORPHANED.id
    ])
    expect(searchAnnotations(ALL, 'total why').map((hit) => hit.score)).toEqual([11])
    expect(searchAnnotations(ALL, 'note nothing')).toEqual([])
    expect(searchAnnotations(ALL, '  ')).toEqual([])
  })
})

describe('the Problems of Review among those of the repository', () => {
  const overview = (fields: Partial<ReviewOverview> = {}): ReviewOverview => ({
    repositoryId: 'r1',
    directory: 'docs/architecture/annotations',
    configUnreadable: false,
    annotations: [ORPHANED],
    problems: [
      {
        kind: 'orphaned',
        path: ORPHANED.path,
        annotation: ORPHANED.id,
        source: 'cart/lines/Line.java',
        lines: '3-4',
        file: 'there'
      },
      { kind: 'unknown-adr', path: ORPHANED.path, annotation: ORPHANED.id, adr: '0009-gone' }
    ],
    head: undefined,
    foundAt: 0,
    finding: false,
    ...fields
  })

  it('wait for the Annotations, and say why they could not be read', () => {
    expect(reviewSection(undefined)).toEqual({ state: 'reading' })
    expect(reviewSection({ known: undefined, reading: true, failed: 'x' })).toEqual({
      state: 'reading'
    })
    expect(reviewSection({ known: undefined, reading: false, failed: 'x' })).toEqual({
      state: 'failed',
      reason: 'x'
    })
  })

  it('count the orphaned and the Trace to a missing ADR, which alone has a Repair', async () => {
    const section = reviewSection({
      known: overview({ finding: true }),
      reading: false,
      failed: undefined
    })
    expect(section.state === 'known' && section.entries.map((entry) => entry.repairable)).toEqual([
      false,
      true
    ])
    expect(section.state === 'known' && section.entries[0]!.annotation).toBe(ORPHANED)
    expect(section.state === 'known' && section.again).toBe(true)

    const repo = await repository()
    const open = { id: 'r1', root: '/r1', name: 'shop', repository: repo }
    const outline = { known: OUTLINE, reading: false, failed: undefined }
    const known = { known: overview(), reading: false, failed: undefined }
    expect(repositoryProblems(open, outline, known).count).toBe(2)
    // An unreadable `.arch/config.yml` is one Problem more.
    const unreadable = {
      known: overview({ configUnreadable: true, directory: undefined, problems: [] }),
      reading: false,
      failed: undefined
    }
    expect(repositoryProblems(open, outline, unreadable).count).toBe(1)
  })
})

describe('lines selected in the code viewer', () => {
  const state = (from: number, to: number): EditorState =>
    EditorState.create({
      doc: 'one\ntwo\nthree\nfour\n',
      selection: EditorSelection.single(from, to)
    })

  it('are the lines the selection covers, without the line a drag ends at the start of', () => {
    expect(selectedLines(state(0, 0))).toBeUndefined()
    expect(selectedLines(state(1, 5))).toEqual({ start: 1, end: 2 })
    // From the start of line 2 to the start of line 4: lines 2 and 3.
    expect(selectedLines(state(4, 14))).toEqual({ start: 2, end: 3 })
    expect(selectedLines(state(14, 4))).toEqual({ start: 2, end: 3 })
    expect(selectedLines(state(4, 5))).toEqual({ start: 2, end: 2 })
  })

  it('give overlapping Annotations columns of their own in the gutter', () => {
    expect(
      columnsOf([
        { start: 5, end: 9 },
        { start: 1, end: 6 },
        { start: 7, end: 8 },
        { start: 10, end: 12 }
      ])
    ).toEqual([1, 0, 0, 0])
    expect(columnsOf([])).toEqual([])
  })
})

describe('Attach again', () => {
  // It opened the Source File the Anchor names, which a rename had taken away.
  it('opens the Source File where the lines are now, or where a rename took it', () => {
    const renamed = annotation('20261102-renamed', {
      found: {
        kind: 'moved',
        anchor: { ...anchor('cart/Basket.java', 20, 22), commit: 'c'.repeat(40) },
        similarity: 0.8,
        renamedFrom: 'cart/Cart.java'
      }
    })
    expect(attachPathOf(renamed)).toBe('cart/Basket.java')
    expect(attachPathOf(annotation('20261102-here'))).toBe('cart/Cart.java')
    const lost = (found: AnnotationView['found']): AnnotationView =>
      annotation('20261102-lost', { found })
    expect(attachPathOf(lost({ kind: 'orphaned', file: 'there', path: 'cart/Basket.java' }))).toBe(
      'cart/Basket.java'
    )
    expect(attachPathOf(lost({ kind: 'orphaned', file: 'there' }))).toBe('cart/Cart.java')
    expect(attachPathOf(lost({ kind: 'orphaned', file: 'gone' }))).toBeUndefined()
  })
})
