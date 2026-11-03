import { describe, expect, it } from 'vitest'
import { memoryFileSystem, memoryGit, type ScriptedCommit } from '@adr-tool/kernel'
import {
  editDistance,
  findAnchor,
  findAnchors,
  mostSimilarBlock,
  normalized,
  readAnnotations,
  wordingOf,
  type Anchor,
  type Found
} from '../src'

// The done-when of part 8 (docs/plan-vision.md): across commits of fixtures, an Annotation
// follows its lines when they move, when one of them is edited, when their Source File is
// renamed and after a rebase that removes the commit of its Anchor; it is orphaned when they
// are deleted.

const sha = (n: number): string => n.toString(16).padStart(40, '0')

const CART = [
  'export class Cart {', //                                                          1
  '  private lines: Line[] = []', //                                                 2
  '', //                                                                             3
  '  add(line: Line): void {', //                                                    4
  '    this.lines.push(line)', //                                                    5
  '  }', //                                                                          6
  '', //                                                                             7
  '  total(): number {', //                                                          8
  '    return this.lines.reduce((sum, line) => sum + line.price * line.quantity, 0)', // 9
  '  }', //                                                                          10
  '', //                                                                             11
  '  count(): number {', //                                                          12
  '    return this.lines.length', //                                                 13
  '  }', //                                                                          14
  '}' //                                                                             15
]
const text = (lines: readonly string[]): string => `${lines.join('\n')}\n`
const TOTAL = CART.slice(7, 10)

/** The Annotation on `total()`, read at the first commit. */
const ANCHOR: Anchor = { path: 'src/cart.ts', start: 8, end: 10, quote: TOTAL, commit: sha(1) }

const first: ScriptedCommit = {
  commit: sha(1),
  date: '2026-11-02T10:00:00Z',
  subject: 'Start the cart',
  files: { 'src/cart.ts': text(CART), 'src/line.ts': 'export interface Line {}\n' }
}

/** The repository after one more commit, as git and the disk have it. */
function after(files: Record<string, string>, history: ScriptedCommit[] = [first]) {
  const next: ScriptedCommit = {
    commit: sha(history.length + 1),
    date: '2026-11-03T10:00:00Z',
    subject: 'Change the cart',
    files
  }
  return { fs: memoryFileSystem(files), git: memoryGit({ commits: [...history, next] }) }
}

const moved = (found: Found) => {
  if (found.kind !== 'moved') throw new Error(`not moved: ${JSON.stringify(found)}`)
  return found
}

describe('finding an Anchor again', () => {
  it('leaves an Anchor whose lines are where it says unchanged', async () => {
    const repository = after({
      ...first.files,
      'src/line.ts': 'export interface Line { price: number }\n'
    })
    expect(await findAnchor(ANCHOR, repository)).toEqual({ kind: 'unchanged', anchor: ANCHOR })
  })

  it('follows a block of quoted lines that moves', async () => {
    // total() goes below count(), and a method comes in above.
    const lines = [
      ...CART.slice(0, 7),
      '  clear(): void {',
      '    this.lines = []',
      '  }',
      '',
      ...CART.slice(11, 14),
      '',
      ...TOTAL,
      '}'
    ]
    const found = moved(
      await findAnchor(ANCHOR, after({ ...first.files, 'src/cart.ts': text(lines) }))
    )
    expect(found).toEqual({
      kind: 'moved',
      anchor: { path: 'src/cart.ts', start: 16, end: 18, quote: TOTAL, commit: sha(2) },
      similarity: 1
    })
  })

  it('follows its lines when one quoted line is edited', async () => {
    const edited =
      '    return this.lines.reduce((sum, line) => sum + line.price * line.quantity * (1 - line.discount), 0)'
    const lines = ['// The cart of one customer.', ...CART.slice(0, 8), edited, ...CART.slice(9)]
    const found = moved(
      await findAnchor(ANCHOR, after({ ...first.files, 'src/cart.ts': text(lines) }))
    )
    expect(found.anchor).toEqual({
      path: 'src/cart.ts',
      start: 9,
      end: 11,
      quote: [TOTAL[0], edited, TOTAL[2]],
      commit: sha(2)
    })
    expect(found.similarity).toBeGreaterThan(0.75)
    expect(found.similarity).toBeLessThan(1)
  })

  it('keeps the quoted lines the diff kept, and a line inserted among them, in the block', async () => {
    const signature = '  get total(): number {'
    const lines = [
      ...CART.slice(0, 7),
      signature,
      TOTAL[1]!,
      '    // Prices include tax.',
      ...CART.slice(9)
    ]
    const found = moved(
      await findAnchor(ANCHOR, after({ ...first.files, 'src/cart.ts': text(lines) }))
    )
    expect(found.anchor).toMatchObject({ start: 8, end: 11, quote: lines.slice(7, 11) })
  })

  it('is orphaned when the quoted lines are deleted', async () => {
    const lines = [...CART.slice(0, 7), ...CART.slice(11)]
    const repository = after({ ...first.files, 'src/cart.ts': text(lines) })
    expect(await findAnchor(ANCHOR, repository)).toEqual({ kind: 'orphaned', file: 'there' })
  })

  it('follows the Source File when it is renamed', async () => {
    const lines = [
      ...CART.slice(0, 7),
      ...TOTAL.slice(0, 1),
      '    // Prices include tax.',
      ...TOTAL.slice(1),
      ...CART.slice(10)
    ]
    const repository = after({
      'src/basket.ts': text(lines),
      'src/line.ts': first.files['src/line.ts']!
    })
    expect(moved(await findAnchor(ANCHOR, repository))).toMatchObject({
      anchor: { path: 'src/basket.ts', start: 8, end: 11, commit: sha(2) },
      renamedFrom: 'src/cart.ts'
    })
  })

  it('follows its lines after a rebase that removes the commit of the Anchor', async () => {
    // Upstream put a header above the class while the Annotation was written on a branch; the
    // branch was rebased onto it, and its commits replaced: the Anchor's commit is gone.
    const upstream: ScriptedCommit = {
      commit: sha(10),
      parent: null,
      date: '2026-11-01T10:00:00Z',
      files: {
        'src/cart.ts': text([
          '// SPDX-License-Identifier: MIT',
          '',
          ...CART.slice(0, 8),
          ...CART.slice(9)
        ])
      }
    }
    const rebased: ScriptedCommit = {
      commit: sha(11),
      parent: sha(10),
      date: '2026-11-04T10:00:00Z',
      files: { 'src/cart.ts': text(['// SPDX-License-Identifier: MIT', '', ...CART]) }
    }
    const git = memoryGit({ commits: [upstream, rebased] })
    expect(await git.hasCommit(sha(1))).toBe(false)
    const fs = memoryFileSystem(rebased.files)
    expect(moved(await findAnchor(ANCHOR, { fs, git }, '2026-11-02'))).toEqual({
      kind: 'moved',
      anchor: { path: 'src/cart.ts', start: 10, end: 12, quote: TOTAL, commit: sha(11) },
      similarity: 1
    })
  })

  it('follows a rename after a rebase, through the commits since the Annotation was written', async () => {
    const renamed: ScriptedCommit = {
      commit: sha(21),
      parent: sha(20),
      date: '2026-11-05T10:00:00Z',
      files: { 'src/basket.ts': text(CART) }
    }
    const git = memoryGit({
      commits: [{ ...first, commit: sha(20), date: '2026-11-04T09:00:00Z' }, renamed]
    })
    const found = await findAnchor(
      ANCHOR,
      { fs: memoryFileSystem(renamed.files), git },
      '2026-11-02'
    )
    expect(moved(found)).toMatchObject({
      anchor: { path: 'src/basket.ts', start: 8, end: 10 },
      renamedFrom: 'src/cart.ts'
    })
  })

  it('finds a rebased line that was edited too, from a version of the file that stands in for the commit', async () => {
    // The rebased copy of the Anchor's commit has the quoted lines where the Anchor says; the
    // commit after it inserts lines above and edits the line, so the history tells where.
    const standIn: ScriptedCommit = { ...first, commit: sha(30), date: '2026-11-04T09:00:00Z' }
    const edited = [
      ...Array.from({ length: 80 }, (_, line) => `// note ${line}`),
      ...CART.slice(0, 8),
      '    return this.lines.reduce((sum, line) => sum + line.total(), 0)',
      ...CART.slice(9)
    ]
    const later: ScriptedCommit = {
      commit: sha(31),
      date: '2026-11-04T10:00:00Z',
      files: { ...first.files, 'src/cart.ts': text(edited) }
    }
    const git = memoryGit({ commits: [standIn, later] })
    const found = moved(
      await findAnchor(ANCHOR, { fs: memoryFileSystem(later.files), git }, '2026-11-02')
    )
    expect(found.anchor).toMatchObject({ start: 88, end: 90 })
    expect(found.similarity).toBeGreaterThanOrEqual(0.5)
  })
})

describe('what counts as the Anchor’s lines', () => {
  /** total() with a look-alike, subtotal(), right below it. */
  const LOOK_ALIKE = [
    ...CART.slice(0, 11),
    '  subtotal(): number {',
    '    return this.lines.reduce((sum, line) => sum + line.price * line.amount, 0)',
    '  }',
    '}'
  ]
  const withLookAlike: ScriptedCommit = { ...first, files: { 'src/cart.ts': text(LOOK_ALIKE) } }

  it('does not take a look-alike that was there before for lines that were deleted', async () => {
    const deleted = [...LOOK_ALIKE.slice(0, 7), ...LOOK_ALIKE.slice(11)]
    const repository = after({ 'src/cart.ts': text(deleted) }, [withLookAlike])
    expect(await findAnchor(ANCHOR, repository)).toEqual({ kind: 'orphaned', file: 'there' })
  })

  it('does not take the look-alike either when the whole file is re-indented in the same commit', async () => {
    const deleted = [...LOOK_ALIKE.slice(0, 7), ...LOOK_ALIKE.slice(11)]
    for (const indent of [
      (line: string) => (line === '' ? line : `\t${line}`),
      (line: string) => line.replace(/^ +/, (spaces) => '\t'.repeat(spaces.length / 2))
    ]) {
      const repository = after({ 'src/cart.ts': text(deleted.map(indent)) }, [withLookAlike])
      expect(await findAnchor(ANCHOR, repository)).toEqual({ kind: 'orphaned', file: 'there' })
    }
  })

  it('does not take a copy of the quoted lines elsewhere for them when they are deleted', async () => {
    const twice = [
      'class A {',
      '  toString(): string {',
      '    return this.name',
      '  }',
      '  a = 1',
      '}',
      'class B {',
      '  toString(): string {',
      '    return this.name',
      '  }',
      '  b = 2',
      '}'
    ]
    const anchor: Anchor = {
      path: 'src/a.ts',
      start: 2,
      end: 4,
      quote: twice.slice(1, 4),
      commit: sha(1)
    }
    const start = { ...first, files: { 'src/a.ts': text(twice) } }
    const deleted = [...twice.slice(0, 1), ...twice.slice(4)]
    expect(await findAnchor(anchor, after({ 'src/a.ts': text(deleted) }, [start]))).toEqual({
      kind: 'orphaned',
      file: 'there'
    })

    // One line of boilerplate, quoted where it was deleted, and kept in the other function.
    const checks = [
      'function a() {',
      '  validate(input)',
      '  return 1',
      '}',
      'function b() {',
      '  validate(input)',
      '  return 2',
      '}'
    ]
    const line: Anchor = { path: 'src/a.ts', start: 2, end: 2, quote: [checks[1]!], commit: sha(1) }
    const withChecks = { ...first, files: { 'src/a.ts': text(checks) } }
    const without = [...checks.slice(0, 1), ...checks.slice(2)]
    expect(await findAnchor(line, after({ 'src/a.ts': text(without) }, [withChecks]))).toEqual({
      kind: 'orphaned',
      file: 'there'
    })
  })

  it('leaves lines that differ only in whitespace at their end unchanged', async () => {
    const trailing = CART.map((line, index) => (index >= 7 && index < 10 ? `${line}  ` : line))
    const repository = after({ 'src/cart.ts': text(trailing) })
    expect(await findAnchor(ANCHOR, repository)).toEqual({ kind: 'unchanged', anchor: ANCHOR })
    const fewer = { ...ANCHOR, quote: ANCHOR.quote.map((line) => `${line}\t`) }
    expect(await findAnchor(fewer, repository)).toEqual({ kind: 'unchanged', anchor: fewer })
  })

  it('takes the look-alike without history, which is why the new place is previewed', async () => {
    const deleted = [...LOOK_ALIKE.slice(0, 7), ...LOOK_ALIKE.slice(11)]
    const fs = memoryFileSystem({ 'src/cart.ts': text(deleted) })
    const found = moved(
      await findAnchor({ ...ANCHOR, commit: undefined }, { fs, git: memoryGit({ commits: [] }) })
    )
    expect(found.anchor).toMatchObject({ start: 8, end: 10 })
  })

  it('finds the quoted lines nearest to where the history takes them, when they are there twice', async () => {
    // A copy of total() is added at the top; the original moved down by those lines.
    const lines = [...TOTAL, '', ...CART]
    const found = moved(await findAnchor(ANCHOR, after({ 'src/cart.ts': text(lines) })))
    expect(found.anchor).toMatchObject({ start: 12, end: 14, quote: TOTAL })
  })

  it('takes a block re-indented, whitespace aside, for the quoted lines', async () => {
    const lines = [...CART.slice(0, 7), ...TOTAL.map((line) => `  ${line}`), ...CART.slice(10)]
    const found = moved(await findAnchor(ANCHOR, after({ 'src/cart.ts': text(lines) })))
    expect(found).toMatchObject({
      similarity: 1,
      anchor: { start: 8, end: 10, quote: lines.slice(7, 10) }
    })
  })

  it('is orphaned when the quoted lines were rewritten into something else', async () => {
    const lines = [
      ...CART.slice(0, 7),
      '  get sum() { return computeSum(this) }',
      ...CART.slice(10)
    ]
    expect(await findAnchor(ANCHOR, after({ 'src/cart.ts': text(lines) }))).toEqual({
      kind: 'orphaned',
      file: 'there'
    })
  })

  it('works from the quoted lines alone without git, and says when the file is gone', async () => {
    const none = memoryGit({ commits: [] })
    const lines = ['', '', ...CART]
    const found = await findAnchor(
      { ...ANCHOR, commit: undefined },
      { fs: memoryFileSystem({ 'src/cart.ts': text(lines) }), git: none }
    )
    expect(moved(found).anchor).toEqual({ path: 'src/cart.ts', start: 10, end: 12, quote: TOTAL })
    expect(await findAnchor(ANCHOR, { fs: memoryFileSystem({}), git: none })).toEqual({
      kind: 'orphaned',
      file: 'gone'
    })
  })

  it('reads CRLF files as lines like any other', async () => {
    const crlf = `${CART.join('\r\n')}\r\n`
    const repository = after({ 'src/cart.ts': crlf })
    expect((await findAnchor(ANCHOR, repository)).kind).toBe('unchanged')
  })
})

describe('the cost of finding an Anchor again', () => {
  // A file of 3400 lines of words, every one of them different, reformatted in one commit:
  // every line is new, and the similarity search would compare 100 quoted lines with all.
  let seed = 7
  const random = (): number => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const word = (): string =>
    Array.from({ length: 3 + Math.floor(random() * 8) }, () =>
      String.fromCharCode(97 + Math.floor(random() * 26))
    ).join('')
  const before = Array.from(
    { length: 3400 },
    () => `  ${Array.from({ length: 8 }, word).join(' ')}`
  )
  const reformatted = before.map((line) => `    ${line.trim()};`)
  const anchor: Anchor = {
    path: 'src/a.ts',
    start: 1701,
    end: 1800,
    quote: before.slice(1700, 1800),
    commit: sha(1)
  }
  const start: ScriptedCommit = { ...first, files: { 'src/a.ts': text(before) } }

  it('stays well under a second for a long quote in a long file that changed throughout', async () => {
    for (const [now, kind] of [
      [reformatted, 'moved'],
      [[...reformatted.slice(0, 1700), ...reformatted.slice(1800)], 'orphaned']
    ] as const) {
      const repository = after({ 'src/a.ts': text(now) }, [start])
      const begun = performance.now()
      const found = await findAnchor(anchor, repository)
      // Generous for a slow machine; it takes a fraction of that.
      expect(performance.now() - begun).toBeLessThan(3000)
      expect(found.kind).toBe(kind)
    }
  })

  it('reads the log of a file and a file at a commit once for every Annotation on it', async () => {
    const git = memoryGit({
      commits: [
        { ...first, commit: sha(40) },
        { commit: sha(41), files: { ...first.files, 'src/cart.ts': text(['', ...CART]) } }
      ]
    })
    const reads = { log: 0, textAt: 0 }
    const counting = {
      ...git,
      log: (options?: Parameters<typeof git.log>[0]) => (reads.log++, git.log(options)),
      textAt: (commit: string, path: string) => (reads.textAt++, git.textAt(commit, path))
    }
    const annotation = (id: string, date: string) => ({
      id,
      path: `docs/architecture/annotations/${id}.md`,
      type: 'note' as const,
      state: 'open' as const,
      date,
      anchor: { ...ANCHOR, commit: sha(99) },
      cites: [],
      text: '',
      replies: [],
      writable: true
    })
    const fs = memoryFileSystem({ ...first.files, 'src/cart.ts': text(['', ...CART]) })
    const { found } = await findAnchors(
      [annotation('a', '2026-11-02'), annotation('b', '2026-10-01'), annotation('c', '2026-11-01')],
      { fs, git: counting }
    )
    expect([...found.values()].map((one) => one.kind)).toEqual(['moved', 'moved', 'moved'])
    // The last commits twice — the last 1000, and since the earliest day —, the file's log
    // once, and each of its versions once.
    expect(reads).toEqual({ log: 3, textAt: 2 })
  })
})

describe('the Anchors of a repository', () => {
  it('reports each orphaned Annotation as a Problem, and the found ones by their IDs', async () => {
    const annotation = (id: string, lines: string, quote: readonly string[]) =>
      [
        '---',
        'type: note',
        'date: 2026-11-02',
        'anchor:',
        '  path: src/cart.ts',
        `  lines: ${lines}`,
        `  commit: ${sha(1)}`,
        '---',
        '',
        '```ts',
        ...quote,
        '```',
        '',
        `About ${id}.`,
        ''
      ].join('\n')
    const files = {
      ...first.files,
      'src/cart.ts': text([...CART.slice(0, 11), '}']),
      'docs/architecture/annotations/total.md': annotation('total', '8-10', TOTAL),
      'docs/architecture/annotations/count.md': annotation('count', '12-14', CART.slice(11, 14))
    }
    const fs = memoryFileSystem(files)
    const git = memoryGit({ commits: [first, { commit: sha(2), files }] })
    const { annotations } = await readAnnotations(fs)
    const { found, problems } = await findAnchors(annotations, { fs, git })
    expect(found.get('total')?.kind).toBe('unchanged')
    expect(problems.map(wordingOf)).toEqual([
      'count is orphaned: the quoted lines 12-14 of src/cart.ts are no longer found in it. Attach it again to the lines it is about.'
    ])
  })
})

describe('similarity', () => {
  it('measures the edit distance as the table of Levenshtein does, for texts of any length', () => {
    const reference = (a: string, b: string): number => {
      let row = Array.from({ length: b.length + 1 }, (_, j) => j)
      for (let i = 1; i <= a.length; i++) {
        const next = [i]
        for (let j = 1; j <= b.length; j++) {
          const same = a.charCodeAt(i - 1) === b.charCodeAt(j - 1)
          next[j] = Math.min(row[j - 1]! + (same ? 0 : 1), row[j]! + 1, next[j - 1]! + 1)
        }
        row = next
      }
      return row[b.length]!
    }
    let seed = 11
    const random = (below: number): number => {
      seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff
      return seed % below
    }
    // Few characters, so that the texts share many; lengths across several blocks of 32.
    const alphabet = ['a', 'b', 'c', ' ', 'ä', '😀']
    const some = (): string =>
      Array.from({ length: random(110) }, () => alphabet[random(alphabet.length)]).join('')
    for (let pair = 0; pair < 3000; pair++) {
      const [a, b] = [some(), some()]
      expect(editDistance(a, b), `${a} / ${b}`).toBe(reference(a, b))
    }
    expect(editDistance('a'.repeat(64), 'a'.repeat(63) + 'b')).toBe(1)
    expect(editDistance('x'.repeat(33), '')).toBe(33)
  })

  it('is the edit distance in characters, line by line, over the longer of the two', () => {
    expect(editDistance('kitten', 'sitting')).toBe(3)
    expect(normalized('  return   x ;\t')).toBe('return x ;')
    const quote = ['total(): number {', 'return 1', '}']
    const lines = ['x', 'total(): number {', 'return 2', '}', 'y']
    expect(mostSimilarBlock(quote, lines, 0, lines.length, 0)).toEqual({
      start: 1,
      end: 4,
      similarity: 1 - 1 / 26
    })
    // A quoted line missing costs its characters; one more line in the block costs its own.
    expect(mostSimilarBlock(['a', 'bb', 'c'], ['a', 'c'], 0, 2, 0)!.similarity).toBe(1 - 2 / 4)
    expect(mostSimilarBlock(['', ''], ['a'], 0, 1, 0)).toBeUndefined()
    // A pinned quoted line is paired with its line: the block holds it, though a shorter one
    // without it would be more similar.
    const sum = 'return this.lines.reduce((sum, line) => sum + line.price, 0)'
    const kept = ['total(): number {', sum, '}']
    const block = ['total(): number {', '// Prices include the tax.', sum, '}']
    expect(mostSimilarBlock(kept, block, 0, 4, 0)).toMatchObject({ start: 2, end: 4 })
    expect(mostSimilarBlock(kept, block, 0, 4, 0, [0, 2, 3])).toMatchObject({ start: 0, end: 4 })
  })
})
