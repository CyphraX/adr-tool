import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { gitExecutable, gitIn } from '../src/git'

// The kernel's git port, as the app and the command line run it: on a scratch repository whose
// code lives in a subdirectory, which is what is opened.
let top: string
let root: string

const run = (...args: string[]): string =>
  execFileSync('git', args, {
    cwd: top,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Aylin Demir',
      GIT_AUTHOR_EMAIL: 'aylin@example.com',
      GIT_COMMITTER_NAME: 'Aylin Demir',
      GIT_COMMITTER_EMAIL: 'aylin@example.com'
    }
  }).trim()
const write = (path: string, text: string): void => writeFileSync(join(root, path), text)

const CART = 'class Cart {\n  total() {\n    return 1\n  }\n}\n'
let first: string
let renamed: string
let side: string

beforeAll(() => {
  top = realpathSync(mkdtempSync(join(tmpdir(), 'softarch-git-port-')))
  root = join(top, 'service')
  mkdirSync(join(root, 'src'), { recursive: true })
  run('init', '-q', '-b', 'trunk')
  run('config', 'user.name', 'Aylin Demir')
  run('config', 'user.email', 'aylin@example.com')
  run('config', 'core.autocrlf', 'false')
  run('config', 'commit.gpgsign', 'false')

  write('src/cart.ts', CART)
  writeFileSync(join(top, 'outside.txt'), 'not ours\n')
  run('add', '-A')
  run('commit', '-q', '-m', 'Start the cart')
  first = run('rev-parse', 'HEAD')

  run('mv', 'service/src/cart.ts', 'service/src/basket.ts')
  write('src/basket.ts', `${CART}// moved\n`)
  run('add', '-A')
  run('commit', '-q', '-m', 'Call it a basket')
  renamed = run('rev-parse', 'HEAD')

  run('checkout', '-q', '-b', 'side')
  write('src/price.ts', 'export const price = 2\n')
  run('add', '-A')
  run('commit', '-q', '-m', 'Price on the side')
  side = run('rev-parse', 'HEAD')
  run('checkout', '-q', 'trunk')
  run('merge', '-q', '--no-ff', '--no-edit', 'side')
})

afterAll(() => rmSync(top, { recursive: true, force: true }))

describe('git as the kernel’s port', () => {
  it('knows HEAD and which commits there are', async () => {
    const git = gitIn(root)
    expect(await git.headCommit()).toBe(run('rev-parse', 'HEAD'))
    expect(await git.hasCommit(first)).toBe(true)
    expect(await git.hasCommit('0'.repeat(40))).toBe(false)
    // Only a full object name goes to git, never a revision it would work out.
    expect(await git.hasCommit('HEAD')).toBe(false)
    expect(await git.hasCommit(first.slice(0, 12))).toBe(false)
  })

  it('reads a file as a commit has it, relative to the directory', async () => {
    const git = gitIn(root)
    expect(await git.textAt(first, 'src/cart.ts')).toBe(CART)
    expect(await git.textAt(renamed, 'src/cart.ts')).toBeUndefined()
    // Nothing outside the directory, and nothing that is not a path of it.
    expect(await git.textAt(first, '../outside.txt')).toBeUndefined()
    expect(await git.textAt(first, '/etc/passwd')).toBeUndefined()
  })

  it('tells the changes between two commits, with the rename', async () => {
    const git = gitIn(root)
    expect(await git.changes(first, side)).toEqual([
      { kind: 'renamed', path: 'src/basket.ts', from: 'src/cart.ts' },
      { kind: 'added', path: 'src/price.ts' }
    ])
    expect(await git.changes(first, '0'.repeat(40))).toBeUndefined()
  })

  it('logs the commits HEAD reaches, without the merge, newest first', async () => {
    const log = (await gitIn(root).log())!
    expect(log.map((entry) => entry.subject)).toEqual([
      'Price on the side',
      'Call it a basket',
      'Start the cart'
    ])
    expect(log[0]).toMatchObject({
      commit: side,
      parent: renamed,
      author: 'Aylin Demir',
      changes: [{ kind: 'added', path: 'src/price.ts' }]
    })
    expect(log[2]!.parent).toBeUndefined()
    // What happens outside the directory is not in its history.
    expect(log[2]!.changes).toEqual([{ kind: 'added', path: 'src/cart.ts' }])
    expect(Number.isNaN(Date.parse(log[0]!.date))).toBe(false)
  })

  it('follows one file back through its rename', async () => {
    const log = (await gitIn(root).log({ path: 'src/basket.ts' }))!
    expect(log.map((entry) => entry.changes)).toEqual([
      [{ kind: 'renamed', path: 'src/basket.ts', from: 'src/cart.ts' }],
      [{ kind: 'added', path: 'src/cart.ts' }]
    ])
  })

  it('logs since a day, and at most so many commits', async () => {
    const git = gitIn(root)
    expect(await git.log({ since: '2099-01-01' })).toEqual([])
    expect((await git.log({ limit: 1 }))!.map((entry) => entry.commit)).toEqual([side])
    expect(await git.log({ since: 'yesterday' })).toBeUndefined()
    expect(await git.log({ path: '--all' })).toEqual([])
  })

  it('no longer has a commit that a rebase replaced, once git let it go', async () => {
    const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'softarch-git-rebase-')))
    const git = (...args: string[]): string =>
      execFileSync('git', args, { cwd: scratch, encoding: 'utf8' }).trim()
    try {
      git('init', '-q', '-b', 'trunk')
      git('config', 'user.name', 'Aylin Demir')
      git('config', 'user.email', 'aylin@example.com')
      git('config', 'commit.gpgsign', 'false')
      writeFileSync(join(scratch, 'a.ts'), 'a\n')
      git('add', '-A')
      git('commit', '-q', '-m', 'A')
      const old = git('rev-parse', 'HEAD')
      git('commit', '-q', '--amend', '-m', 'A, reworded')
      // Kept while the reflog remembers it; gone after the garbage collection.
      expect(await gitIn(scratch).hasCommit(old)).toBe(true)
      git('reflog', 'expire', '--expire=now', '--all')
      git('gc', '-q', '--prune=now')
      expect(await gitIn(scratch).hasCommit(old)).toBe(false)
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  it('degrades to nothing where there is no repository, or no git', async () => {
    const plain = realpathSync(mkdtempSync(join(tmpdir(), 'softarch-plain-')))
    try {
      expect(await gitIn(plain).headCommit()).toBeUndefined()
      expect(await gitIn(plain).log()).toBeUndefined()
    } finally {
      rmSync(plain, { recursive: true, force: true })
    }
    const absent = gitIn(root, 'git-is-not-installed-here')
    expect(await absent.headCommit()).toBeUndefined()
    expect(await absent.hasCommit(first)).toBe(false)
    expect(await absent.changes(first, side)).toBeUndefined()
  })

  it('finds git on the PATH by its full name on Windows, never in the directory it runs in', () => {
    const exists = (path: string): boolean => path === 'C:\\Git\\cmd\\git.exe'
    expect(gitExecutable('win32', 'relative;"C:\\Git\\cmd";D:\\x', exists)).toBe(
      'C:\\Git\\cmd\\git.exe'
    )
    expect(gitExecutable('win32', 'relative', exists)).toBe('git')
    expect(gitExecutable('linux', 'C:\\Git\\cmd', exists)).toBe('git')
  })
})
