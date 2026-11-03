import { describe, expect, it } from 'vitest'
import {
  applyChangeSet,
  memoryFileSystem,
  memoryGit,
  type Plan,
  type WritableFileSystem
} from '@adr-tool/kernel'
import {
  anchorAt,
  findAnchor,
  planAnnotation,
  planAttach,
  planCite,
  planRepair,
  planReply,
  planState,
  planUncite,
  planUpdateAnchor,
  readAnnotations,
  traceProblems,
  type AdrReference,
  type NewAnnotation
} from '../src'

const DIR = 'docs/architecture/annotations'
const sha = (n: number): string => n.toString(16).padStart(40, '0')
const HEAD = memoryGit({ commits: [{ commit: sha(7), files: {} }] })

const CART = [
  'export class Cart {',
  '  private lines: Line[] = []',
  '',
  '  total(): number {',
  '    return this.lines.reduce((sum, line) => sum + line.price, 0)',
  '  }',
  '}'
]
const SOURCE = { 'src/cart.ts': `${CART.join('\n')}\n` }
const ADRS: AdrReference[] = [
  { log: 'docs/adr', id: '0003-postgres-write-model' },
  { log: 'docs/adr', id: '0004-events' },
  { log: 'services/billing/docs/adr', id: '0004-events' }
]

/** An Annotation written by hand, in the ways a person writes one. */
const BY_HAND = [
  '---',
  'type: concern # why it matters',
  "author: 'Aylin Demir'",
  'date: 2026-11-02',
  'anchor:',
  '  path: src/cart.ts',
  '  lines: 4-6',
  `  commit: ${sha(1)}`,
  'cites:',
  '  - 0003-postgres-write-model # the write model',
  '  - 0009-gone',
  'nav_order: 3',
  '---',
  '',
  '~~~ts',
  '  total(): number {',
  '    return this.lines.reduce((sum, line) => sum + line.price, 0)',
  '  }',
  '~~~',
  '',
  'Why is the total computed on every call?',
  '',
  '> And not kept with the lines?',
  ''
].join('\n')

async function applied(fs: WritableFileSystem, plan: Plan): Promise<WritableFileSystem> {
  if (!plan.ok) throw new Error(plan.reason)
  await applyChangeSet(fs, plan.changeSet)
  return fs
}

/** The lines of `after` that are not lines of `before`, and those of `before` gone. */
function changedLines(before: string, after: string): { gone: string[]; added: string[] } {
  const [old, now] = [before.split('\n'), after.split('\n')]
  return {
    gone: old.filter((line) => !now.includes(line)),
    added: now.filter((line) => !old.includes(line))
  }
}

const NEW: NewAnnotation = {
  type: 'question',
  author: 'Aylin Demir',
  date: '2026-11-02',
  lines: { path: 'src/cart.ts', start: 4, end: 6 },
  text: 'Why is the total computed on every call?\n\nIt is read on every render.'
}
/** The Anchor of `NEW`, as the disk and HEAD have it. */
const ANCHOR = { path: 'src/cart.ts', start: 4, end: 6, quote: CART.slice(3, 6), commit: sha(7) }

describe('creating an Annotation', () => {
  it('writes a file of its own, its ID the day and a slug of its text', async () => {
    const fs = memoryFileSystem(SOURCE)
    const plan = await planAnnotation(
      fs,
      HEAD,
      { ...NEW, cites: ['0003-postgres-write-model'] },
      ADRS
    )
    expect(plan).toMatchObject({
      ok: true,
      id: '20261102-why-is-the-total-computed-on-every-call-it-is-read-on-every'
    })
    if (!plan.ok) return
    expect(plan.changeSet.files.map((file) => file.path)).toEqual([
      `${DIR}/20261102-why-is-the-total-computed-on-every-call-it-is-read-on-every.md`
    ])
    await applied(fs, plan)
    expect(await fs.readText(`${DIR}/${plan.id}.md`)).toBe(
      [
        '---',
        'type: question',
        'state: open',
        'author: Aylin Demir',
        'date: 2026-11-02',
        'anchor:',
        '  path: src/cart.ts',
        '  lines: 4-6',
        `  commit: ${sha(7)}`,
        'cites: [0003-postgres-write-model]',
        '---',
        '',
        '```ts',
        ...CART.slice(3, 6),
        '```',
        '',
        'Why is the total computed on every call?',
        '',
        'It is read on every render.',
        ''
      ].join('\n')
    )
    const { annotations, problems } = await readAnnotations(fs)
    expect(problems).toEqual([])
    expect(annotations[0]).toMatchObject({
      id: plan.id,
      type: 'question',
      state: 'open',
      author: 'Aylin Demir',
      anchor: ANCHOR,
      cites: ['0003-postgres-write-model']
    })
    expect(await findAnchor(annotations[0]!.anchor!, { fs, git: HEAD })).toMatchObject({
      kind: 'unchanged'
    })
  })

  it('reads the Anchor from the disk, with the commit HEAD points at', async () => {
    const fs = memoryFileSystem(SOURCE)
    expect(await anchorAt(fs, HEAD, './src/cart.ts', 4, 6)).toEqual(ANCHOR)
    expect(await anchorAt(fs, memoryGit({ commits: [] }), 'src/cart.ts', 7, 7)).toEqual({
      path: 'src/cart.ts',
      start: 7,
      end: 7,
      quote: ['}']
    })
    await expect(anchorAt(fs, HEAD, 'src/cart.ts', 6, 8)).rejects.toThrow('lines 6-8')
    await expect(anchorAt(fs, HEAD, 'src/gone.ts', 1, 1)).rejects.toThrow('src/gone.ts')
    await expect(anchorAt(fs, HEAD, '../outside.ts', 1, 1)).rejects.toThrow()
    await expect(anchorAt(fs, HEAD, 'src/cart.ts', 3, 2)).rejects.toThrow()
  })

  it('adds a number where the ID is taken, and takes the line ending most Annotations have', async () => {
    const crlf = BY_HAND.replaceAll('\n', '\r\n')
    const fs = memoryFileSystem({
      ...SOURCE,
      [`${DIR}/20261102-why.md`]: crlf,
      [`${DIR}/20261102-why-2.md`]: crlf,
      [`${DIR}/other.md`]: BY_HAND
    })
    const plan = await planAnnotation(fs, HEAD, { ...NEW, text: 'Why?' })
    expect(plan).toMatchObject({ ok: true, id: '20261102-why-3' })
    await applied(fs, plan)
    const text = (await fs.readText(`${DIR}/20261102-why-3.md`))!
    expect(text.split('\r\n')).toHaveLength(text.split('\n').length)
    expect(text.endsWith('Why?\r\n')).toBe(true)
  })

  it('takes the slug of the Source File for a text without one, and a fence the quote cannot close', async () => {
    const fs = memoryFileSystem({ 'README.md': 'Run:\n```sh\npnpm i\n```\n' })
    const lines = { path: 'README.md', start: 2, end: 4 }
    const plan = await planAnnotation(fs, HEAD, { ...NEW, lines, text: '…' })
    expect(plan).toMatchObject({ ok: true, id: '20261102-readme-md' })
    await applied(fs, plan)
    const { annotations } = await readAnnotations(fs)
    expect(annotations[0]?.anchor?.quote).toEqual(['```sh', 'pnpm i', '```'])
    expect(await fs.readText(`${DIR}/20261102-readme-md.md`)).toContain('\n````md\n```sh\n')
  })

  it('refuses what it cannot write, and writes nothing', async () => {
    const fs = memoryFileSystem(SOURCE)
    const refused = async (annotation: NewAnnotation, adrs = ADRS) => {
      const plan = await planAnnotation(fs, HEAD, annotation, adrs)
      if (plan.ok) throw new Error('planned')
      return plan.said?.code
    }
    expect(await refused({ ...NEW, author: ' ' })).toBe('annotation-needs-author')
    expect(await refused({ ...NEW, date: '2. November' })).toBe('not-a-day')
    expect(await refused({ ...NEW, cites: ['0009-gone'] })).toBe('no-such-adr')
    expect(await refused({ ...NEW, cites: ['0004-events'] })).toBe('adr-in-several-logs')
    // The Anchor is read from the disk: a file that is not there, lines it does not have.
    const lines = (path: string, start: number, end: number) => ({
      ...NEW,
      lines: { path, start, end }
    })
    expect(await refused(lines('no/such/file.ts', 3, 3))).toBe('no-source-file')
    expect(await refused(lines('src/cart.ts', 7, 9))).toBe('lines-outside')
    expect(await refused(lines('src/cart.ts', 0, 1))).toBe('no-lines')
    expect(
      await planAnnotation(fs, HEAD, { ...NEW, cites: ['docs/adr/0004-events'] }, ADRS)
    ).toMatchObject({ ok: true })
    const broken = memoryFileSystem({
      ...SOURCE,
      '.arch/config.yml': 'annotations: ../elsewhere\n'
    })
    expect(await planAnnotation(broken, HEAD, NEW)).toMatchObject({
      ok: false,
      said: { code: 'annotations-unavailable' }
    })
    expect(await fs.list(DIR)).toBeUndefined()
  })

  it('refuses lines with a carriage return that ends no line, which quoted lines cannot keep', async () => {
    const fs = memoryFileSystem({ 'src/old.ts': 'one\rtwo\nthree\n', 'src/a.md': 'x\n' })
    const plan = await planAnnotation(fs, HEAD, {
      ...NEW,
      lines: { path: 'src/old.ts', start: 1, end: 2 }
    })
    expect(plan).toMatchObject({
      ok: false,
      reason:
        'Lines 1-2 of src/old.ts hold a carriage return that ends no line, which quoted lines cannot keep.',
      said: { code: 'carriage-return-in-lines' }
    })
    expect(
      await planAnnotation(fs, HEAD, { ...NEW, lines: { path: 'src/old.ts', start: 2, end: 2 } })
    ).toMatchObject({ ok: true })
    // Nor is such a line written into an Anchor that was found elsewhere.
    const by = memoryFileSystem({ 'src/old.ts': 'one\rtwo\nthree\n', [`${DIR}/why.md`]: BY_HAND })
    const found = {
      kind: 'moved',
      anchor: { path: 'src/old.ts', start: 1, end: 1, quote: ['one\rtwo'] },
      similarity: 0.6
    } as const
    expect(await planUpdateAnchor(by, 'why', found)).toMatchObject({
      said: { code: 'carriage-return-in-lines' }
    })
  })

  it('writes into the directory the configuration names', async () => {
    const fs = memoryFileSystem({
      ...SOURCE,
      '.arch/config.yml': 'diagrams: docs/diagrams\nannotations: docs/reviews\n'
    })
    const plan = await planAnnotation(fs, HEAD, NEW)
    if (!plan.ok) throw new Error(plan.reason)
    expect(plan.changeSet.files.map((file) => file.path)).toEqual([`docs/reviews/${plan.id}.md`])
  })
})

describe('replying, resolving and reopening', () => {
  const ID = 'why'
  const PATH = `${DIR}/${ID}.md`

  it('adds a Reply as a file of its own, numbered after the highest, and leaves the Annotation alone', async () => {
    const fs = memoryFileSystem({
      [PATH]: BY_HAND,
      [`${DIR}/${ID}/0002-lena.md`]: '---\nauthor: Lena\n---\nYes.\n'
    })
    const plan = await planReply(fs, ID, {
      author: 'Jonas Weiß',
      date: '2026-11-03',
      text: 'Because the lines change.'
    })
    if (!plan.ok) throw new Error(plan.reason)
    expect(plan.changeSet.files.map((file) => file.path)).toEqual([
      `${DIR}/${ID}/0003-jonas-weiss.md`
    ])
    await applied(fs, plan)
    expect(await fs.readText(PATH)).toBe(BY_HAND)
    expect(await fs.readText(`${DIR}/${ID}/0003-jonas-weiss.md`)).toBe(
      '---\nauthor: Jonas Weiß\ndate: 2026-11-03\n---\n\nBecause the lines change.\n'
    )
    const { annotations } = await readAnnotations(fs)
    expect(annotations[0]?.replies.map((reply) => reply.author)).toEqual(['Lena', 'Jonas Weiß'])
  })

  it('refuses a Reply without a text, an author or an Annotation', async () => {
    const fs = memoryFileSystem({ [PATH]: BY_HAND })
    const reply = { author: 'Lena', date: '2026-11-03', text: 'Yes.' }
    expect(await planReply(fs, ID, { ...reply, text: ' \n' })).toMatchObject({
      said: { code: 'reply-needs-text' }
    })
    expect(await planReply(fs, ID, { ...reply, author: '' })).toMatchObject({
      said: { code: 'reply-needs-author' }
    })
    expect(await planReply(fs, 'nothing', reply)).toMatchObject({ said: { code: 'no-annotation' } })
    expect(await planReply(fs, '../../../src/cart', reply)).toMatchObject({
      said: { code: 'no-annotation' }
    })
  })

  it('takes no ID that is not one part of a path inside the directory, whatever is on the disk', async () => {
    // On Windows `\` parts a path as `/` does: `..\x` would be the file x.md above the
    // directory. The ID of `..md` is `.`, whose Replies would be Annotations of their own.
    const reply = { author: 'Lena', date: '2026-11-03', text: 'Yes.' }
    const ids = ['..\\x', '.', '..', 'a\\b', 'x\u0000', 'trailing ', 'readme', 'README']
    const fs = memoryFileSystem({
      ...Object.fromEntries(ids.map((id) => [`${DIR}/${id}.md`, BY_HAND])),
      'docs/architecture/x.md': BY_HAND
    })
    for (const id of ids) {
      expect(await planReply(fs, id, reply)).toMatchObject({ said: { code: 'no-annotation' } })
      expect(await planState(fs, id, 'resolved')).toMatchObject({
        said: { code: 'no-annotation' }
      })
    }
    expect((await readAnnotations(fs)).annotations).toEqual([])
  })

  it('resolves and reopens on the line of state, or inserts it after type', async () => {
    const fs = memoryFileSystem({ [PATH]: BY_HAND })
    await applied(fs, await planState(fs, ID, 'resolved'))
    const resolved = (await fs.readText(PATH))!
    expect(changedLines(BY_HAND, resolved)).toEqual({ gone: [], added: ['state: resolved'] })
    expect(resolved.indexOf('state: resolved')).toBe(
      resolved.indexOf('\n', resolved.indexOf('type:')) + 1
    )
    expect(await planState(fs, ID, 'resolved')).toMatchObject({
      ok: false,
      said: { code: 'resolved-already' }
    })
    await applied(fs, await planState(fs, ID, 'open'))
    expect(changedLines(resolved, (await fs.readText(PATH))!)).toEqual({
      gone: ['state: resolved'],
      added: ['state: open']
    })
    expect(await planState(fs, ID, 'open')).toMatchObject({
      ok: false,
      said: { code: 'open-already' }
    })
  })

  it('refuses to write into an Annotation whose frontmatter cannot be read', async () => {
    const fs = memoryFileSystem({ [PATH]: '---\ntype: [note\n---\nText.\n' })
    expect(await planState(fs, ID, 'resolved')).toMatchObject({
      ok: false,
      said: { code: 'annotation-unreadable' }
    })
  })
})

describe('giving an Annotation a new Anchor', () => {
  const ID = 'why'
  const PATH = `${DIR}/${ID}.md`

  it('updates the Anchor of a moved Annotation, on its lines and between its fences only', async () => {
    const moved = ['// The cart.', ...CART]
    const fs = memoryFileSystem({ [PATH]: BY_HAND, 'src/cart.ts': `${moved.join('\n')}\n` })
    const git = memoryGit({
      commits: [
        { commit: sha(1), files: SOURCE },
        { commit: sha(2), files: { 'src/cart.ts': `${moved.join('\n')}\n` } }
      ]
    })
    const { annotations } = await readAnnotations(fs)
    const found = await findAnchor(annotations[0]!.anchor!, { fs, git })
    expect(found).toMatchObject({ kind: 'moved', anchor: { start: 5, end: 7 } })
    await applied(fs, await planUpdateAnchor(fs, ID, found))
    const after = (await fs.readText(PATH))!
    expect(changedLines(BY_HAND, after)).toEqual({
      gone: ['  lines: 4-6', `  commit: ${sha(1)}`],
      added: ['  lines: 5-7', `  commit: ${sha(2)}`]
    })
    expect(after.length).toBe(BY_HAND.length)
    expect(
      await findAnchor((await readAnnotations(fs)).annotations[0]!.anchor!, { fs, git })
    ).toMatchObject({
      kind: 'unchanged'
    })
    expect(await planUpdateAnchor(fs, ID, { kind: 'orphaned', file: 'there' })).toMatchObject({
      said: { code: 'not-moved' }
    })
  })

  it('attaches an Annotation again to lines a person selects, in another file', async () => {
    const fs = memoryFileSystem({
      [PATH]: BY_HAND,
      'src/basket.py': 'class Basket:\n    def total(self):\n        return sum(self.lines)\n'
    })
    await applied(
      fs,
      await planAttach(fs, memoryGit({ commits: [] }), ID, {
        path: 'src/basket.py',
        start: 2,
        end: 3
      })
    )
    const after = (await fs.readText(PATH))!
    expect(changedLines(BY_HAND, after)).toEqual({
      gone: [
        '  path: src/cart.ts',
        '  lines: 4-6',
        `  commit: ${sha(1)}`,
        '~~~ts',
        ...CART.slice(3, 6)
      ],
      added: [
        '  path: src/basket.py',
        '  lines: 2-3',
        '~~~py',
        '    def total(self):',
        '        return sum(self.lines)'
      ]
    })
    const { annotations, problems } = await readAnnotations(fs)
    expect(problems).toEqual([])
    expect(annotations[0]).toMatchObject({
      anchor: {
        path: 'src/basket.py',
        start: 2,
        end: 3,
        quote: ['    def total(self):', '        return sum(self.lines)']
      },
      text: 'Why is the total computed on every call?\n\n> And not kept with the lines?\n'
    })
    expect(annotations[0]?.anchor?.commit).toBeUndefined()
  })

  it('inserts the commit after lines, and lengthens a fence the new lines would close', async () => {
    const without = BY_HAND.replace(`  commit: ${sha(1)}\n`, '').replaceAll('~~~', '```')
    const fs = memoryFileSystem({ [PATH]: without, 'docs/run.md': 'Run:\n```sh\npnpm i\n```\n' })
    await applied(fs, await planAttach(fs, HEAD, ID, { path: 'docs/run.md', start: 2, end: 4 }))
    const after = (await fs.readText(PATH))!
    expect(after).toContain(`  lines: 2-4\n  commit: ${sha(7)}\n`)
    expect(after).toContain('\n````md\n```sh\npnpm i\n```\n````\n')
    expect((await readAnnotations(fs)).annotations[0]?.anchor?.quote).toEqual([
      '```sh',
      'pnpm i',
      '```'
    ])
  })

  it('fills an anchor key with nothing in it where it stands, with its comment', async () => {
    const source = { 'src/a.ts': 'one\ntwo\n' }
    const empty = '---\ntype: note\nstate: open\nanchor:\ncites: [a]\n---\n\nText\n'
    const fs = memoryFileSystem({ ...source, [PATH]: empty })
    await applied(fs, await planAttach(fs, HEAD, ID, { path: 'src/a.ts', start: 2, end: 2 }))
    expect(await fs.readText(PATH)).toBe(
      `---\ntype: note\nstate: open\nanchor:\n  path: src/a.ts\n  lines: 2\n  commit: ${sha(7)}\ncites: [a]\n---\n\n\`\`\`ts\ntwo\n\`\`\`\n\nText\n`
    )
    expect((await readAnnotations(fs)).annotations[0]?.anchor).toMatchObject({
      path: 'src/a.ts',
      start: 2,
      end: 2,
      quote: ['two']
    })

    const spelled = '---\r\nanchor: ~ # to be attached\r\ntype: note\r\n---\r\nText\r\n'
    const crlf = memoryFileSystem({ ...source, [PATH]: spelled })
    await applied(
      crlf,
      await planAttach(crlf, memoryGit({ commits: [] }), ID, {
        path: 'src/a.ts',
        start: 1,
        end: 1
      })
    )
    expect(await crlf.readText(PATH)).toBe(
      '---\r\nanchor: # to be attached\r\n  path: src/a.ts\r\n  lines: 1\r\ntype: note\r\n---\r\n\r\n```ts\r\none\r\n```\r\n\r\nText\r\n'
    )
  })

  it('keeps the quotes a person gave the lines and the commit', async () => {
    const quoted = BY_HAND.replace('  lines: 4-6', "  lines: '4-6'").replace(
      `  commit: ${sha(1)}`,
      `  commit: "${sha(1)}"`
    )
    const fs = memoryFileSystem({ [PATH]: quoted, ...SOURCE })
    await applied(fs, await planAttach(fs, HEAD, ID, { path: 'src/cart.ts', start: 4, end: 5 }))
    const after = (await fs.readText(PATH))!
    expect(after).toContain(`  lines: '4-5'\n  commit: "${sha(7)}"\n`)
    expect((await readAnnotations(fs)).annotations[0]?.anchor).toMatchObject({
      start: 4,
      end: 5,
      commit: sha(7)
    })
  })

  it('gives an Annotation without quoted lines a block at the start of its body', async () => {
    const bare =
      '---\ntype: note\nanchor:\n  path: src/cart.ts\n  lines: 1-1\n---\n\nAbout the class.\n'
    const fs = memoryFileSystem({ ...SOURCE, [PATH]: bare })
    await applied(
      fs,
      await planAttach(fs, memoryGit({ commits: [] }), ID, {
        path: 'src/cart.ts',
        start: 7,
        end: 7
      })
    )
    expect(await fs.readText(PATH)).toBe(
      '---\ntype: note\nanchor:\n  path: src/cart.ts\n  lines: 7\n---\n\n```ts\n}\n```\n\nAbout the class.\n'
    )
    expect((await readAnnotations(fs)).problems).toEqual([])
    const tight = memoryFileSystem({
      ...SOURCE,
      [PATH]: '---\ntype: note\n---\nAbout the class.\n'
    })
    await applied(
      tight,
      await planAttach(tight, HEAD, ID, { path: 'src/cart.ts', start: 1, end: 1 })
    )
    expect(await tight.readText(PATH)).toBe(
      `---\ntype: note\nanchor:\n  path: src/cart.ts\n  lines: 1\n  commit: ${sha(7)}\n---\n\n\`\`\`ts\nexport class Cart {\n\`\`\`\n\nAbout the class.\n`
    )
  })
})

describe('citing ADRs', () => {
  const ID = 'why'
  const PATH = `${DIR}/${ID}.md`

  it('adds to a list in its style and takes an item out where it stands', async () => {
    const fs = memoryFileSystem({ [PATH]: BY_HAND })
    await applied(fs, await planCite(fs, ID, 'docs/adr/0004-events', ADRS))
    const cited = (await fs.readText(PATH))!
    expect(changedLines(BY_HAND, cited)).toEqual({ gone: [], added: ['  - docs/adr/0004-events'] })
    await applied(fs, await planUncite(fs, ID, 'docs/adr/0004-events'))
    expect(await fs.readText(PATH)).toBe(BY_HAND)
    expect(await planCite(fs, ID, '0003-postgres-write-model', ADRS)).toMatchObject({
      said: { code: 'cited-already' }
    })
    expect(await planCite(fs, ID, '0004-events', ADRS)).toMatchObject({
      said: { code: 'adr-in-several-logs' }
    })
    expect(await planUncite(fs, ID, '0004-events')).toMatchObject({ said: { code: 'not-cited' } })
  })

  it('writes a new list in flow style, and takes the key with the last item', async () => {
    const plain = BY_HAND.replace(/cites:\n( {2}- .*\n)+/, '')
    const fs = memoryFileSystem({ [PATH]: plain })
    await applied(fs, await planCite(fs, ID, '0003-postgres-write-model', ADRS))
    expect(changedLines(plain, (await fs.readText(PATH))!).added).toEqual([
      'cites: [0003-postgres-write-model]'
    ])
    await applied(fs, await planUncite(fs, ID, '0003-postgres-write-model'))
    expect(await fs.readText(PATH)).toBe(plain)
  })

  it('repairs a Trace to an ADR that does not exist by taking it out; nothing else has a Repair', async () => {
    const fs = memoryFileSystem({ [PATH]: BY_HAND })
    const { annotations } = await readAnnotations(fs)
    const [problem] = traceProblems(annotations, ADRS)
    expect(problem).toMatchObject({ kind: 'unknown-adr', adr: '0009-gone' })
    await applied(fs, await planRepair(fs, problem!))
    expect(changedLines(BY_HAND, (await fs.readText(PATH))!)).toEqual({
      gone: ['  - 0009-gone'],
      added: []
    })
    const orphaned = {
      kind: 'orphaned',
      path: PATH,
      annotation: ID,
      source: 'src/cart.ts',
      lines: '4-6',
      file: 'there'
    } as const
    expect(await planRepair(fs, orphaned)).toMatchObject({
      ok: false,
      said: { code: 'without-repair' }
    })
  })
})
