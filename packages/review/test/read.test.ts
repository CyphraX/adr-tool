import { describe, expect, it } from 'vitest'
import { memoryFileSystem, sentenceOf } from '@adr-tool/kernel'
import {
  annotationsCiting,
  readAnnotations,
  REVIEW_PROBLEM_CODES,
  REVIEW_SENTENCES,
  saidOf,
  traceProblems,
  wordingOf,
  type AdrReference,
  type ReviewProblem
} from '../src'

const DIR = 'docs/architecture/annotations'
const SHA = 'a'.repeat(40)

const ANNOTATION = [
  '---',
  'type: concern',
  'state: resolved',
  'author: Aylin Demir',
  'date: 2026-11-02',
  'anchor:',
  '  path: src/cart.ts',
  '  lines: 8-10',
  `  commit: ${SHA}`,
  'cites: [0003-postgres-write-model]',
  'nav_order: 3',
  '---',
  '',
  '```ts',
  '  total(): number {',
  '    return 1',
  '  }',
  '```',
  '',
  'Why is the total computed on every call?',
  ''
].join('\n')

const ADRS: AdrReference[] = [
  { log: 'docs/adr', id: '0003-postgres-write-model' },
  { log: 'docs/adr', id: '0004-events' },
  { log: 'docs/decisions', id: '0004-events' }
]

describe('reading the Annotations of a repository', () => {
  it('reads an Annotation with its Anchor, its quoted lines, its text and its Traces', async () => {
    const fs = memoryFileSystem({ [`${DIR}/20261102-why-is-the-total.md`]: ANNOTATION })
    const { directory, annotations, problems } = await readAnnotations(fs)
    expect(directory).toBe(DIR)
    expect(problems).toEqual([])
    expect(annotations).toEqual([
      {
        id: '20261102-why-is-the-total',
        path: `${DIR}/20261102-why-is-the-total.md`,
        type: 'concern',
        state: 'resolved',
        author: 'Aylin Demir',
        date: '2026-11-02',
        anchor: {
          path: 'src/cart.ts',
          start: 8,
          end: 10,
          quote: ['  total(): number {', '    return 1', '  }'],
          commit: SHA
        },
        cites: ['0003-postgres-write-model'],
        text: 'Why is the total computed on every call?\n',
        replies: [],
        writable: true
      }
    ])
  })

  it('reads the smallest Annotation, written by hand, with every default', async () => {
    const fs = memoryFileSystem({
      [`${DIR}/rounding.md`]:
        '---\nanchor:\n  path: src/cart.ts\n  lines: 3\n---\n\n```\n  return price * quantity\n```\n\nRounding?\n'
    })
    const [annotation] = (await readAnnotations(fs)).annotations
    expect(annotation).toMatchObject({
      id: 'rounding',
      type: 'note',
      state: 'open',
      anchor: { path: 'src/cart.ts', start: 3, end: 3, quote: ['  return price * quantity'] },
      cites: [],
      text: 'Rounding?\n'
    })
    expect(annotation!.anchor!.commit).toBeUndefined()
    expect(annotation!.author).toBeUndefined()
  })

  it('reads the Replies beside an Annotation, in the order of their file names', async () => {
    const fs = memoryFileSystem({
      [`${DIR}/a.md`]: ANNOTATION,
      [`${DIR}/a/0002-aylin-demir.md`]:
        '---\nauthor: Aylin Demir\ndate: 2026-11-04\n---\n\nThanks.\n',
      [`${DIR}/a/0001-lena-becker.md`]:
        '---\nauthor: Lena Becker\ndate: 2026-11-03\n---\n\nWe cache it.\n',
      [`${DIR}/a/0002-kim-becker.md`]:
        '---\nauthor: Kim Becker\ndate: 2026-11-04\n---\n\nMe too.\n',
      [`${DIR}/a/notes.txt`]: 'not a Reply',
      [`${DIR}/README.md`]: '# Annotations\n'
    })
    const { annotations, problems } = await readAnnotations(fs)
    expect(problems).toEqual([])
    expect(annotations.map((annotation) => annotation.id)).toEqual(['a'])
    expect(annotations[0]!.replies).toEqual([
      {
        path: `${DIR}/a/0001-lena-becker.md`,
        author: 'Lena Becker',
        date: '2026-11-03',
        text: 'We cache it.\n'
      },
      {
        path: `${DIR}/a/0002-aylin-demir.md`,
        author: 'Aylin Demir',
        date: '2026-11-04',
        text: 'Thanks.\n'
      },
      {
        path: `${DIR}/a/0002-kim-becker.md`,
        author: 'Kim Becker',
        date: '2026-11-04',
        text: 'Me too.\n'
      }
    ])
  })

  it('reads them where .arch/config.yml says, and nothing while it cannot be used', async () => {
    const elsewhere = memoryFileSystem({
      '.arch/config.yml': '# Review\nannotations: docs/reviews/\nother: kept\n',
      'docs/reviews/a.md': ANNOTATION
    })
    const read = await readAnnotations(elsewhere)
    expect(read.directory).toBe('docs/reviews')
    expect(read.annotations).toHaveLength(1)

    const problemOf = async (config: string) => {
      const reading = await readAnnotations(
        memoryFileSystem({ '.arch/config.yml': config, [`${DIR}/a.md`]: ANNOTATION })
      )
      expect(reading.directory).toBeUndefined()
      expect(reading.annotations).toEqual([])
      return reading.problems.map(wordingOf)
    }
    expect(await problemOf('annotations: ../outside\n')).toEqual([
      '"annotations" in .arch/config.yml must be a relative path inside the repository, not "../outside". No Annotation is read until it is fixed.'
    ])
    expect(await problemOf('annotations: [a, b]\n')).toHaveLength(1)
    expect(await problemOf('- a list\n')).toEqual([
      '.arch/config.yml cannot be read: its top level must be a mapping. No Annotation is read until it is fixed.'
    ])
    expect((await problemOf('annotations: [\n'))[0]).toMatch(
      /^\.arch\/config\.yml cannot be read: it is not valid YAML: .*\. No Annotation is read until it is fixed\.$/
    )
    // Without the key, or with an empty one, the default.
    const empty = await readAnnotations(memoryFileSystem({ '.arch/config.yml': 'annotations:\n' }))
    expect(empty.directory).toBe(DIR)
  })
})

describe('the Problems of an Annotation', () => {
  const problemsOf = async (files: Record<string, string>): Promise<string[]> =>
    (await readAnnotations(memoryFileSystem(files))).problems.map(wordingOf)
  const one = (text: string) => problemsOf({ [`${DIR}/a.md`]: text })
  const replace = (from: string, to: string) => ANNOTATION.replace(from, to)

  it('names a file it cannot read', async () => {
    expect(await one('# Just text\n')).toEqual([
      `${DIR}/a.md cannot be read: it has no frontmatter.`
    ])
    expect(await one('---\ntype: note\n')).toEqual([
      `${DIR}/a.md cannot be read: its frontmatter is never closed.`
    ])
    expect(await one('---\n- a\n---\n')).toEqual([
      `${DIR}/a.md cannot be read: its frontmatter must be a mapping.`
    ])
    expect((await one('---\ntype: [\n---\n'))[0]).toMatch(
      /^docs\/architecture\/annotations\/a\.md cannot be read: its frontmatter is not valid YAML: /
    )
    const [unreadable] = (await readAnnotations(memoryFileSystem({ [`${DIR}/a.md`]: '# x\n' })))
      .annotations
    expect(unreadable).toMatchObject({ writable: false, type: undefined, state: undefined })
  })

  it('names a type, a state, an author or a date it cannot use', async () => {
    expect(await one(replace('type: concern', 'type: nit'))).toEqual([
      `${DIR}/a.md: "type" must be note, question or concern, not "nit".`
    ])
    expect(await one(replace('state: resolved', 'state: done'))).toEqual([
      `${DIR}/a.md: "state" must be open or resolved, not "done".`
    ])
    expect(await one(replace('author: Aylin Demir', 'author: [Aylin, Lena]'))).toEqual([
      `${DIR}/a.md: "author" must be a text.`
    ])
    expect(await one(replace('date: 2026-11-02', 'date: 2.11.2026'))).toEqual([
      `${DIR}/a.md: "date" must be a date of the form YYYY-MM-DD.`
    ])
    expect(await one(replace('cites: [0003-postgres-write-model]', 'cites: {a: b}'))).toEqual([
      `${DIR}/a.md: "cites" must be a list of ADRs.`
    ])
  })

  it('names an Anchor it cannot use', async () => {
    expect(await one(replace('anchor:', 'place:'))).toEqual([
      `${DIR}/a.md has no Anchor: "anchor" needs "path" and "lines".`
    ])
    expect(await one(replace('  path: src/cart.ts', '  path: ../cart.ts'))).toEqual([
      `${DIR}/a.md: the Anchor names a path that is absolute or leaves the repository.`
    ])
    expect(await one(replace('lines: 8-10', 'lines: 10-8'))).toEqual([
      `${DIR}/a.md: the Anchor must give its lines as a number or a range such as 12-18.`
    ])
    expect(await one(replace(SHA, 'abc1234'))).toEqual([
      `${DIR}/a.md: the Anchor must name its commit by its full name of 40 or 64 hexadecimal digits.`
    ])
    expect(await one(replace('lines: 8-10', 'lines: 8-11'))).toEqual([
      `${DIR}/a.md quotes 3 lines for lines 8-11, which are 4.`
    ])
    expect(await one(replace('```\n\nWhy', '\nWhy'))).toEqual([
      `${DIR}/a.md does not begin its text with the quoted lines, as a fenced code block that is closed.`
    ])
    expect(await one(replace('\n```ts', '\nText first.\n\n```ts'))).toEqual([
      `${DIR}/a.md does not begin its text with the quoted lines, as a fenced code block that is closed.`
    ])
  })

  it('reads a quote that holds a fence of its own, inside a longer one', async () => {
    const text = replace('```ts', '````md')
      .replace('    return 1', '```')
      .replace('```\n\nWhy', '````\n\nWhy')
    const [annotation] = (await readAnnotations(memoryFileSystem({ [`${DIR}/a.md`]: text })))
      .annotations
    expect(annotation!.anchor!.quote).toEqual(['  total(): number {', '```', '  }'])
  })

  it('names Replies it cannot read, and Replies without their Annotation', async () => {
    expect(
      await problemsOf({
        [`${DIR}/a.md`]: ANNOTATION,
        [`${DIR}/a/0001-lena.md`]: 'Just text.\n',
        [`${DIR}/a/0002-kim.md`]: '---\nauthor: Kim\ndate: tomorrow\n---\n\nYes.\n',
        [`${DIR}/gone/0001-lena.md`]: '---\nauthor: Lena\n---\n\nAnd this?\n'
      })
    ).toEqual([
      `${DIR}/a/0001-lena.md cannot be read: it has no frontmatter.`,
      `${DIR}/a/0002-kim.md: "date" must be a date of the form YYYY-MM-DD.`,
      `${DIR}/gone holds Replies to gone, and there is no Annotation gone.`
    ])
  })
})

describe('Traces to ADRs', () => {
  const annotationCiting = async (...cites: string[]) => {
    const text = ANNOTATION.replace(
      'cites: [0003-postgres-write-model]',
      `cites: [${cites.join(', ')}]`
    )
    return (await readAnnotations(memoryFileSystem({ [`${DIR}/a.md`]: text }))).annotations
  }

  it('names an ADR that does not exist, and a bare ID that several Decision Logs have', async () => {
    const annotations = await annotationCiting(
      '0003-postgres-write-model',
      'docs/decisions/0004-events',
      '0009-gone',
      '0004-events',
      'payments:docs/adr/0001-x'
    )
    expect(traceProblems(annotations, ADRS).map(wordingOf)).toEqual([
      `${DIR}/a.md cites 0009-gone, which is no ADR of this repository.`,
      `${DIR}/a.md cites 0004-events, which several Decision Logs have: docs/adr/0004-events and docs/decisions/0004-events. Name it with its log.`,
      `${DIR}/a.md cites payments:docs/adr/0001-x, which is no ADR of this repository.`
    ])
  })

  it('computes which Annotations cite an ADR, by either of its names', async () => {
    const annotations = await annotationCiting('docs/adr/0003-postgres-write-model')
    expect(annotationsCiting(ADRS[0]!, annotations, ADRS)).toHaveLength(1)
    expect(annotationsCiting(ADRS[1]!, annotations, ADRS)).toEqual([])
  })
})

describe('the sentences of review', () => {
  it('have one for every Problem, and say what saidOf says', () => {
    for (const code of REVIEW_PROBLEM_CODES) expect(REVIEW_SENTENCES).toHaveProperty([code])
    const problem: ReviewProblem = {
      kind: 'orphaned',
      path: `${DIR}/a.md`,
      annotation: 'a',
      source: 'src/cart.ts',
      lines: '8-10',
      file: 'there'
    }
    expect(wordingOf(problem)).toBe(
      'a is orphaned: the quoted lines 8-10 of src/cart.ts are no longer found in it. Attach it again to the lines it is about.'
    )
    expect(wordingOf({ ...problem, file: 'gone' })).toBe(
      'a is orphaned: src/cart.ts is gone, and no file it was renamed to has its quoted lines. Attach it again to the lines it is about.'
    )
    expect(sentenceOf(REVIEW_SENTENCES, saidOf(problem))).toBe(wordingOf(problem))
  })
})
