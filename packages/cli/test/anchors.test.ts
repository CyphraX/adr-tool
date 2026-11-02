import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { findAnchor, findAnchors, readAnnotations, type Anchor } from '@adr-tool/review'
import { repositoryFiles } from '../src/files'
import { gitIn } from '../src/git'

// The done-when of part 8 against git itself: an Annotation follows its lines across commits
// when they move, when one of them is edited, when their Source File is renamed and after a
// rebase that removes the commit of its Anchor; it is orphaned when they are deleted.

const CART = [
  'export class Cart {',
  '  private lines: Line[] = []',
  '',
  '  add(line: Line): void {',
  '    this.lines.push(line)',
  '  }',
  '',
  '  total(): number {',
  '    return this.lines.reduce((sum, line) => sum + line.price * line.quantity, 0)',
  '  }',
  '',
  '  count(): number {',
  '    return this.lines.length',
  '  }',
  '}'
]
const TOTAL = CART.slice(7, 10)
const text = (lines: readonly string[]): string => `${lines.join('\n')}\n`

const made: string[] = []
afterAll(() => {
  for (const top of made) rmSync(top, { recursive: true, force: true })
})

/** A scratch repository whose commits are made by an example person, never a real one. */
function repository() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'softarch-anchors-')))
  made.push(root)
  const run = (...args: string[]): string =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Aylin Demir',
        GIT_AUTHOR_EMAIL: 'aylin@example.com',
        GIT_COMMITTER_NAME: 'Aylin Demir',
        GIT_COMMITTER_EMAIL: 'aylin@example.com'
      }
    }).trim()
  run('init', '-q', '-b', 'trunk')
  run('config', 'user.name', 'Aylin Demir')
  run('config', 'user.email', 'aylin@example.com')
  run('config', 'core.autocrlf', 'false')
  run('config', 'commit.gpgsign', 'false')
  const commit = (files: Record<string, string>, subject: string): string => {
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true })
      writeFileSync(join(root, path), content)
    }
    run('add', '-A')
    run('commit', '-q', '-m', subject)
    return run('rev-parse', 'HEAD')
  }
  const finding = () => ({ fs: repositoryFiles(root), git: gitIn(root) })
  return { root, run, commit, finding }
}

/** A repository at the commit an Annotation on `total()` was written at, and that Anchor. */
function annotated() {
  const repo = repository()
  const commit = repo.commit(
    { 'src/cart.ts': text(CART), 'src/line.ts': 'export interface Line {}\n' },
    'Start the cart'
  )
  const anchor: Anchor = { path: 'src/cart.ts', start: 8, end: 10, quote: TOTAL, commit }
  return { ...repo, anchor }
}

describe('finding an Anchor again in a git repository', () => {
  it('follows a block of quoted lines that moves', async () => {
    const { commit, finding, anchor } = annotated()
    const lines = [...CART.slice(0, 7), ...CART.slice(11, 14), '', ...TOTAL, '}']
    const head = commit({ 'src/cart.ts': text(lines) }, 'Count first')
    expect(await findAnchor(anchor, finding())).toEqual({
      kind: 'moved',
      anchor: { path: 'src/cart.ts', start: 12, end: 14, quote: TOTAL, commit: head },
      similarity: 1
    })
  })

  it('follows its lines when one quoted line is edited', async () => {
    const { commit, finding, anchor } = annotated()
    const edited = '    return this.lines.reduce((sum, line) => sum + line.total(), 0)'
    const lines = ['// The cart of one customer.', ...CART.slice(0, 8), edited, ...CART.slice(9)]
    const head = commit({ 'src/cart.ts': text(lines) }, 'Let a line know its total')
    const found = await findAnchor(anchor, finding())
    expect(found).toMatchObject({
      kind: 'moved',
      anchor: {
        path: 'src/cart.ts',
        start: 9,
        end: 11,
        quote: [TOTAL[0], edited, TOTAL[2]],
        commit: head
      }
    })
  })

  it('is orphaned when the quoted lines are deleted', async () => {
    const { commit, finding, anchor } = annotated()
    commit({ 'src/cart.ts': text([...CART.slice(0, 7), ...CART.slice(11)]) }, 'No total')
    expect(await findAnchor(anchor, finding())).toEqual({ kind: 'orphaned', file: 'there' })
  })

  it('follows the Source File when it is renamed', async () => {
    const { run, commit, finding, anchor } = annotated()
    run('mv', 'src/cart.ts', 'src/basket.ts')
    const lines = [...CART.slice(0, 7), '  // In cents.', ...TOTAL, ...CART.slice(10)]
    const head = commit({ 'src/basket.ts': text(lines) }, 'Call it a basket')
    expect(await findAnchor(anchor, finding())).toEqual({
      kind: 'moved',
      anchor: { path: 'src/basket.ts', start: 9, end: 11, quote: TOTAL, commit: head },
      similarity: 1,
      renamedFrom: 'src/cart.ts'
    })
  })

  it('follows its lines after a rebase that removes the commit of the Anchor', async () => {
    const { run, commit, finding } = repository()
    commit({ 'src/cart.ts': text(CART) }, 'Start the cart')
    run('checkout', '-q', '-b', 'feature')
    const written = commit(
      { 'src/line.ts': 'export interface Line { price: number }\n' },
      'Price a line'
    )
    const anchor: Anchor = { path: 'src/cart.ts', start: 8, end: 10, quote: TOTAL, commit: written }

    // Upstream puts a header above the class; the branch is rebased onto it and its old
    // commits are gone for good, as in a fresh clone of the rebased branch.
    run('checkout', '-q', 'trunk')
    commit(
      { 'src/cart.ts': text(['// SPDX-License-Identifier: MIT', '', ...CART]) },
      'License the cart'
    )
    run('checkout', '-q', 'feature')
    run('rebase', '-q', 'trunk')
    run('reflog', 'expire', '--expire=now', '--all')
    run('gc', '-q', '--prune=now')
    const { fs, git } = finding()
    expect(await git.hasCommit(written)).toBe(false)

    const head = run('rev-parse', 'HEAD')
    const today = new Date().toISOString().slice(0, 10)
    expect(await findAnchor(anchor, { fs, git }, today)).toEqual({
      kind: 'moved',
      anchor: { path: 'src/cart.ts', start: 10, end: 12, quote: TOTAL, commit: head },
      similarity: 1
    })
  })

  it('reads the Annotations of the repository and finds each of their Anchors', async () => {
    const { commit, finding, anchor } = annotated()
    const annotation = [
      '---',
      'type: question',
      'author: Aylin Demir',
      'date: 2026-11-02',
      'anchor:',
      '  path: src/cart.ts',
      '  lines: 8-10',
      `  commit: ${anchor.commit}`,
      '---',
      '',
      '```ts',
      ...TOTAL,
      '```',
      '',
      'Why is the total computed on every call?',
      ''
    ].join('\n')
    commit(
      {
        'src/cart.ts': text(['// The cart.', ...CART]),
        'docs/architecture/annotations/20261102-why.md': annotation
      },
      'Ask about the total'
    )
    const { fs, git } = finding()
    const { annotations, problems } = await readAnnotations(fs)
    expect(problems).toEqual([])
    const { found } = await findAnchors(annotations, { fs, git })
    expect(found.get('20261102-why')).toMatchObject({
      kind: 'moved',
      anchor: { start: 9, end: 11 }
    })
  })
})
