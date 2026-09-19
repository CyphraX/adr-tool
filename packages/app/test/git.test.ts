import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { gitIn } from '../src/main/git'
import { historyChangeOf, historyOf } from '../src/main/history'
import { WORKING_TREE } from '../src/shared/ipc'

/** A scratch repository: the ADRs live in a subdirectory, which is what the app opens. */
let top: string
let root: string

const run = (...args: string[]): string =>
  execFileSync('git', args, {
    cwd: top,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Kim Becker',
      GIT_AUTHOR_EMAIL: 'kim@example.com',
      GIT_COMMITTER_NAME: 'Kim Becker',
      GIT_COMMITTER_EMAIL: 'kim@example.com'
    }
  })

const write = (path: string, text: string): void => writeFileSync(join(root, path), text)

beforeAll(() => {
  top = realpathSync(mkdtempSync(join(tmpdir(), 'adr-tool-git-')))
  root = join(top, 'service')
  mkdirSync(join(root, 'docs/adr'), { recursive: true })
  run('init', '-q', '-b', 'trunk')
  run('config', 'core.autocrlf', 'false')

  write('docs/adr/0001-a.md', '# A\n\nFirst.\n')
  write('docs/adr/0002-b.md', '# B\r\n\r\nWith CRLF.\r\n')
  run('add', '-A')
  run('commit', '-q', '-m', 'Add A and B')

  write('docs/adr/0001-a.md', '# A\n\nFirst, corrected.\n')
  run('commit', '-q', '-am', 'Correct A')

  renameSync(join(root, 'docs/adr/0001-a.md'), join(root, 'docs/adr/0003-a.md'))
  run('add', '-A')
  run('commit', '-q', '-m', 'Renumber A — für Ärger')
})

afterAll(() => rmSync(top, { recursive: true, force: true }))

describe('git, read-only', () => {
  it('knows the branch and that nothing is uncommitted', async () => {
    expect(await gitIn(root).state()).toEqual({ branch: 'trunk', changed: [] })
  })

  it('follows the history of a file through a rename, newest first', async () => {
    const history = await gitIn(root).history('docs/adr/0003-a.md')
    expect(history.map(({ subject, author, path }) => [subject, author, path])).toEqual([
      ['Renumber A — für Ärger', 'Kim Becker', 'docs/adr/0003-a.md'],
      ['Correct A', 'Kim Becker', 'docs/adr/0001-a.md'],
      ['Add A and B', 'Kim Becker', 'docs/adr/0001-a.md']
    ])
    expect(history[0]!.sha).toMatch(/^[0-9a-f]{40}$/)
    expect(Number.isNaN(Date.parse(history[0]!.date))).toBe(false)
  })

  it('reads a file as a commit left it, and as it was before', async () => {
    const git = gitIn(root)
    const [renumber, correct, add] = await git.history('docs/adr/0003-a.md')
    expect(await git.change(correct!)).toEqual({
      path: 'docs/adr/0001-a.md',
      before: '# A\n\nFirst.\n',
      after: '# A\n\nFirst, corrected.\n'
    })
    // The first commit of a file has nothing before it; a rename changes no text.
    expect(await git.change(add!)).toMatchObject({ before: '', after: '# A\n\nFirst.\n' })
    const renamed = await git.change(renumber!)
    expect(renamed.before).toBe(renamed.after)
    // Bytes are bytes: no line-ending conversion on the way.
    const [b] = await git.history('docs/adr/0002-b.md')
    expect((await git.change(b!)).after).toBe('# B\r\n\r\nWith CRLF.\r\n')
  })

  it('lists what is uncommitted, relative to the directory that was opened', async () => {
    write('docs/adr/0002-b.md', '# B\r\n\r\nEdited.\r\n')
    write('docs/adr/0004-new.md', '# New\n')
    writeFileSync(join(top, 'outside.txt'), 'not ours\n')
    expect(await gitIn(root).state()).toEqual({
      branch: 'trunk',
      changed: ['docs/adr/0002-b.md', 'docs/adr/0004-new.md']
    })
    expect(await gitIn(root).head('docs/adr/0002-b.md')).toBe('# B\r\n\r\nWith CRLF.\r\n')
    expect(await gitIn(root).head('docs/adr/0004-new.md')).toBeUndefined()
  })

  it('degrades to nothing where there is no repository, or no git', async () => {
    const plain = realpathSync(mkdtempSync(join(tmpdir(), 'adr-tool-plain-')))
    try {
      expect(await gitIn(plain).state()).toBeUndefined()
      expect(await gitIn(plain).history('docs/adr/0001-a.md')).toEqual([])
    } finally {
      rmSync(plain, { recursive: true, force: true })
    }
    const absent = gitIn(root, 'git-is-not-installed-here')
    expect(await absent.state()).toBeUndefined()
    expect(await absent.history('docs/adr/0003-a.md')).toEqual([])
  })
})

describe('the history of an ADR', () => {
  const corrected = [
    '---',
    'corrections:',
    '  - date: 2026-09-19',
    '    note: Spelling',
    '---',
    '',
    '# A',
    '',
    'First, corrected again.',
    ''
  ].join('\n')

  it('puts what is not committed yet on top, and counts the Corrections at every step', async () => {
    write('docs/adr/0003-a.md', corrected)
    const history = await historyOf(gitIn(root), 'docs/adr/0003-a.md', corrected)
    expect(
      history.map(({ id, subject, corrections }) => [id.length, subject, corrections])
    ).toEqual([
      [WORKING_TREE.length, 'Not committed yet', 1],
      [40, 'Renumber A — für Ärger', 0],
      [40, 'Correct A', 0],
      [40, 'Add A and B', 0]
    ])
    expect(history[1]).toMatchObject({ author: 'Kim Becker', renamedFrom: '0001-a.md' })
    expect(history[2]).not.toHaveProperty('renamedFrom')

    expect(
      await historyChangeOf(gitIn(root), 'docs/adr/0003-a.md', corrected, WORKING_TREE)
    ).toEqual({
      path: 'docs/adr/0003-a.md',
      before: '# A\n\nFirst, corrected.\n',
      after: corrected
    })
    const change = await historyChangeOf(
      gitIn(root),
      'docs/adr/0003-a.md',
      corrected,
      history[2]!.id
    )
    expect(change).toMatchObject({ before: '# A\n\nFirst.\n', after: '# A\n\nFirst, corrected.\n' })
  })

  it('has no such entry once everything is committed', async () => {
    run('commit', '-q', '-am', 'Record a Correction')
    const history = await historyOf(gitIn(root), 'docs/adr/0003-a.md', corrected)
    expect(history.map(({ subject, corrections }) => [subject, corrections])).toEqual([
      ['Record a Correction', 1],
      ['Renumber A — für Ärger', 0],
      ['Correct A', 0],
      ['Add A and B', 0]
    ])
    expect(
      await historyChangeOf(gitIn(root), 'docs/adr/0003-a.md', corrected, 'no-such-commit')
    ).toBe(undefined)
  })

  it('is empty without git', async () => {
    const absent = gitIn(root, 'git-is-not-installed-here')
    expect(await historyOf(absent, 'docs/adr/0003-a.md', corrected)).toEqual([])
  })
})
