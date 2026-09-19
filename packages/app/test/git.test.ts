import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs'
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

const A = 'docs/adr/0003-a.md'
const clean = { branch: 'trunk', changed: [], deleted: [], renamedFrom: {} }

beforeAll(() => {
  top = realpathSync(mkdtempSync(join(tmpdir(), 'adr-tool-git-')))
  root = join(top, 'service')
  mkdirSync(join(root, 'docs/adr'), { recursive: true })
  run('init', '-q', '-b', 'trunk')
  run('config', 'core.autocrlf', 'false')
  run('config', 'user.name', 'Kim Becker')

  write('docs/adr/0001-a.md', '# A\n\nFirst.\n')
  write('docs/adr/0002-b.md', '# B\r\n\r\nWith CRLF.\r\n')
  run('add', '-A')
  run('commit', '-q', '-m', 'Add A and B')

  write('docs/adr/0001-a.md', '# A\n\nFirst, corrected.\n')
  run('commit', '-q', '-am', 'Correct A')

  renameSync(join(root, 'docs/adr/0001-a.md'), join(root, A))
  run('add', '-A')
  run('commit', '-q', '-m', 'Renumber A — für Ärger')
})

afterAll(() => rmSync(top, { recursive: true, force: true }))

describe('git, read-only', () => {
  it('knows the branch, the user, and that nothing is uncommitted', async () => {
    expect(await gitIn(root).workingTree()).toEqual(clean)
    expect(await gitIn(root).userName()).toBe('Kim Becker')
  })

  it('follows the history of a file through a rename, newest first', async () => {
    const history = await gitIn(root).history(A)
    expect(
      history.map(({ subject, author, path, previousPath }) => [
        subject,
        author,
        path,
        previousPath
      ])
    ).toEqual([
      ['Renumber A — für Ärger', 'Kim Becker', A, 'docs/adr/0001-a.md'],
      ['Correct A', 'Kim Becker', 'docs/adr/0001-a.md', 'docs/adr/0001-a.md'],
      ['Add A and B', 'Kim Becker', 'docs/adr/0001-a.md', 'docs/adr/0001-a.md']
    ])
    expect(history[0]!.sha).toMatch(/^[0-9a-f]{40}$/)
    expect(Number.isNaN(Date.parse(history[0]!.date))).toBe(false)
  })

  it('reads a file as a commit left it, and as it was before', async () => {
    const git = gitIn(root)
    const [renumber, correct, add] = await git.history(A)
    expect(await git.text(correct!, 'before')).toBe('# A\n\nFirst.\n')
    expect(await git.text(correct!, 'after')).toBe('# A\n\nFirst, corrected.\n')
    // The first commit of a file has nothing before it; a rename changes no text.
    expect(await git.text(add!, 'before')).toBeUndefined()
    expect(await git.text(renumber!, 'before')).toBe(await git.text(renumber!, 'after'))
    // No line-ending conversion on the way.
    const [b] = await git.history('docs/adr/0002-b.md')
    expect(await git.text(b!, 'after')).toBe('# B\r\n\r\nWith CRLF.\r\n')
  })

  it('takes a file name for a file name, never for a pattern or an option', async () => {
    const git = gitIn(root)
    expect(await git.history('docs/adr/0002-[ab].md')).toEqual([])
    expect(await git.history('--all')).toEqual([])
    expect(await git.head('docs/adr/*.md')).toBeUndefined()
  })

  it('lists what is uncommitted, relative to the directory that was opened', async () => {
    write('docs/adr/0002-b.md', '# B\r\n\r\nEdited.\r\n')
    write('docs/adr/0004-new.md', '# New\n')
    writeFileSync(join(top, 'outside.txt'), 'not ours\n')
    expect(await gitIn(root).workingTree()).toEqual({
      ...clean,
      changed: ['docs/adr/0002-b.md', 'docs/adr/0004-new.md']
    })
    expect(await gitIn(root).head('docs/adr/0002-b.md')).toBe('# B\r\n\r\nWith CRLF.\r\n')
    expect(await gitIn(root).head('docs/adr/0004-new.md')).toBeUndefined()
    run('checkout', '-q', '--', 'service/docs/adr/0002-b.md')
    rmSync(join(root, 'docs/adr/0004-new.md'))
  })

  it('degrades to nothing where there is no repository, or no git', async () => {
    const plain = realpathSync(mkdtempSync(join(tmpdir(), 'adr-tool-plain-')))
    try {
      expect(await gitIn(plain).workingTree()).toBeUndefined()
      expect(await gitIn(plain).history('docs/adr/0001-a.md')).toEqual([])
    } finally {
      rmSync(plain, { recursive: true, force: true })
    }
    const absent = gitIn(root, 'git-is-not-installed-here')
    expect(await absent.workingTree()).toBeUndefined()
    expect(await absent.history(A)).toEqual([])
    expect(await absent.userName()).toBeUndefined()
  })
})

describe('the history of an ADR', () => {
  const correction = { date: '2026-09-19', note: 'Spelling' }
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

  it('puts what is not committed yet on top, and says which Corrections the file records at every step', async () => {
    write(A, corrected)
    const history = await historyOf(gitIn(root), A, corrected)
    expect(
      history.map(({ id, subject, corrections }) => [id.length, subject, corrections])
    ).toEqual([
      [WORKING_TREE.length, 'Not committed yet', [correction]],
      [40, 'Renumber A — für Ärger', []],
      [40, 'Correct A', []],
      [40, 'Add A and B', []]
    ])
    expect(history[1]).toMatchObject({ author: 'Kim Becker', renamedFrom: '0001-a.md' })
    expect(history[2]).not.toHaveProperty('renamedFrom')

    expect(await historyChangeOf(gitIn(root), A, corrected, WORKING_TREE)).toEqual({
      path: A,
      before: '# A\n\nFirst, corrected.\n',
      after: corrected
    })
    expect(await historyChangeOf(gitIn(root), A, corrected, history[2]!.id)).toEqual({
      path: 'docs/adr/0001-a.md',
      before: '# A\n\nFirst.\n',
      after: '# A\n\nFirst, corrected.\n'
    })
    // A commit that renamed the file says so.
    expect(await historyChangeOf(gitIn(root), A, corrected, history[1]!.id)).toMatchObject({
      path: 'docs/adr/0001-a.md',
      renameTo: A
    })
  })

  it('has no such entry once everything is committed', async () => {
    run('commit', '-q', '-am', 'Record a Correction')
    const history = await historyOf(gitIn(root), A, corrected)
    expect(history.map(({ subject, corrections }) => [subject, corrections.length])).toEqual([
      ['Record a Correction', 1],
      ['Renumber A — für Ärger', 0],
      ['Correct A', 0],
      ['Add A and B', 0]
    ])
    expect(await historyChangeOf(gitIn(root), A, corrected, 'no-such-commit')).toBeUndefined()
  })

  it('does not take line endings that git converts for a change', async () => {
    run('config', 'core.autocrlf', 'true')
    rmSync(join(root, A))
    run('checkout', '-q', '--', `service/${A}`)
    const onDisk = readFileSync(join(root, A), 'utf8')
    expect(onDisk).toBe(corrected.replaceAll('\n', '\r\n'))
    expect((await historyOf(gitIn(root), A, onDisk))[0]!.subject).toBe('Record a Correction')

    // And a real edit of that file shows as the one line it is.
    const edited = onDisk.replace('again.', 'again and again.')
    write(A, edited)
    expect((await historyChangeOf(gitIn(root), A, edited, WORKING_TREE))!.before).toBe(onDisk)

    run('config', 'core.autocrlf', 'false')
    rmSync(join(root, A))
    run('checkout', '-q', '--', `service/${A}`)
  })

  it('keeps the history of a file that was renamed and not committed yet', async () => {
    const renumbered = 'docs/adr/0009-a.md'
    renameSync(join(root, A), join(root, renumbered))
    const history = await historyOf(gitIn(root), renumbered, corrected)
    expect(history.map(({ subject, renamedFrom }) => [subject, renamedFrom])).toEqual([
      ['Not committed yet', '0003-a.md'],
      ['Record a Correction', undefined],
      ['Renumber A — für Ärger', '0001-a.md'],
      ['Correct A', undefined],
      ['Add A and B', undefined]
    ])
    expect(await historyChangeOf(gitIn(root), renumbered, corrected, WORKING_TREE)).toEqual({
      path: A,
      before: corrected,
      after: corrected,
      renameTo: renumbered
    })
    // Staged, git says itself where the file came from.
    run('add', '-A')
    expect((await gitIn(root).workingTree())!.renamedFrom).toEqual({ [renumbered]: A })
    expect((await historyOf(gitIn(root), renumbered, corrected))[0]!.renamedFrom).toBe('0003-a.md')
    run('reset', '-q', '--hard')
  })

  it('is not fooled by a commit message that looks like its own output', async () => {
    write(A, corrected + '\nMore.\n')
    const forged = 'innocent\x1e--output=pwned\x1fMallory\x1f2026-01-01T00:00:00Z\x1ffake'
    run('commit', '-q', '-am', forged)
    const history = await gitIn(root).history(A)
    expect(history).toHaveLength(5)
    expect(history.every(({ sha }) => /^[0-9a-f]{40}$/.test(sha))).toBe(true)
    expect(history[0]).toMatchObject({ author: 'Kim Becker', subject: forged })
    expect(await historyChangeOf(gitIn(root), A, undefined, '--output=pwned')).toBeUndefined()
  })

  it('is empty without git', async () => {
    const absent = gitIn(root, 'git-is-not-installed-here')
    expect(await historyOf(absent, A, corrected)).toEqual([])
  })
})
