import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  utimesSync,
  writeFileSync
} from 'node:fs'
import { devNull, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
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

// No configuration of the machine's: neither the helpers' git nor the port's sees any.
beforeAll(() => {
  vi.stubEnv('GIT_CONFIG_GLOBAL', devNull)
  vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1')
})
afterAll(() => vi.unstubAllEnvs())

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

describe('what the configuration says about showing git', () => {
  it('changes nothing of what the port reads', async () => {
    const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'softarch-git-shown-')))
    const service = join(scratch, 'service')
    mkdirSync(service)
    const git = (...args: string[]): string =>
      execFileSync('git', args, { cwd: scratch, encoding: 'utf8' }).trim()
    try {
      git('init', '-q', '-b', 'trunk')
      git('config', 'user.name', 'Jonas Weiß')
      git('config', 'user.email', 'jonas@example.com')
      git('config', 'commit.gpgsign', 'false')
      writeFileSync(join(service, 'a.ts'), 'a\n')
      git('add', '-A')
      git('commit', '-q', '-m', 'Größe')
      const first = git('rev-parse', 'HEAD')
      writeFileSync(join(service, 'a.ts'), 'a\nb\n')
      writeFileSync(join(scratch, 'outside.txt'), 'x\n')
      git('add', '-A')
      git('commit', '-q', '-m', 'Mehr')
      const second = git('rev-parse', 'HEAD')

      const read = async () => {
        const port = gitIn(service)
        return {
          log: await port.log(),
          follow: await port.log({ path: 'a.ts' }),
          changes: await port.changes(first, second)
        }
      }
      const plain = await read()
      expect(plain.log!.map((entry) => [entry.author, entry.subject, entry.changes])).toEqual([
        ['Jonas Weiß', 'Mehr', [{ kind: 'modified', path: 'a.ts' }]],
        ['Jonas Weiß', 'Größe', [{ kind: 'added', path: 'a.ts' }]]
      ])
      git('config', 'diff.relative', 'true')
      git('config', 'log.showRoot', 'false')
      git('config', 'i18n.logOutputEncoding', 'ISO-8859-1')
      // Read from the top of the repository, as the files are relative to the directory.
      expect(await read()).toEqual(plain)
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  it('reads a name or a subject with control characters in it as it is', async () => {
    const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'softarch-git-fields-')))
    const git = (...args: string[]): string =>
      execFileSync('git', args, { cwd: scratch, encoding: 'utf8' }).trim()
    try {
      git('init', '-q', '-b', 'trunk')
      git('config', 'user.email', 'aylin@example.com')
      git('config', 'user.name', 'Aylin\x1fDemir')
      git('config', 'commit.gpgsign', 'false')
      writeFileSync(join(scratch, 'a.ts'), 'a\n')
      git('add', '-A')
      git('commit', '-q', '-m', '\x1eA\x1fM')
      const [entry] = (await gitIn(scratch).log())!
      expect(entry).toMatchObject({
        author: 'Aylin\x1fDemir',
        subject: '\x1eA\x1fM',
        changes: [{ kind: 'added', path: 'a.ts' }]
      })
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  it('runs in the environment of its process: the tests see no configuration of the machine', async () => {
    const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'softarch-git-environment-')))
    try {
      execFileSync('git', ['init', '-q', '-b', 'trunk'], { cwd: scratch })
      expect(await gitIn(scratch).userName()).toBeUndefined()
      writeFileSync(join(scratch, 'global'), '[user]\n\tname = Lena Becker\n')
      vi.stubEnv('GIT_CONFIG_GLOBAL', join(scratch, 'global'))
      expect(await gitIn(scratch).userName()).toBe('Lena Becker')
    } finally {
      vi.stubEnv('GIT_CONFIG_GLOBAL', devNull)
      rmSync(scratch, { recursive: true, force: true })
    }
  })
})

describe('what the repository configures', () => {
  /** A scratch repository, and a script for each program its configuration may name. */
  function hostile() {
    const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'softarch-git-hostile-')))
    const marks = join(scratch, 'marks')
    const bin = join(scratch, 'bin')
    mkdirSync(marks)
    mkdirSync(bin)
    mkdirSync(join(scratch, 'repository', 'src'), { recursive: true })
    const repository = join(scratch, 'repository')
    const git = (...args: string[]): string =>
      execFileSync('git', args, { cwd: repository, encoding: 'utf8' }).trim()
    /** A program that leaves a mark when it runs, and passes its input on. */
    const program = (name: string, exit = 0): string => {
      const path = join(bin, `${name}.sh`)
      writeFileSync(path, `#!/bin/sh\ntouch "${marks}/${name}"\ncat\nexit ${exit}\n`)
      chmodSync(path, 0o755)
      return path
    }
    git('init', '-q', '-b', 'trunk')
    git('config', 'user.name', 'Aylin Demir')
    git('config', 'user.email', 'aylin@example.com')
    git('config', 'commit.gpgsign', 'false')
    const ran = (): string[] => readdirSync(marks).sort()
    return { scratch, repository, git, program, ran }
  }

  it.runIf(process.platform !== 'win32')(
    'runs none of the programs the configuration names, however it is read',
    async () => {
      const { scratch, repository, git, program, ran } = hostile()
      try {
        writeFileSync(join(repository, 'src/a.ts'), 'one\ntwo\nthree\n')
        git('add', '-A')
        git('commit', '-q', '-m', 'One')
        const first = git('rev-parse', 'HEAD')
        git('mv', 'src/a.ts', 'src/b.ts')
        writeFileSync(join(repository, 'src/b.ts'), 'one\ntwo\nthree\nfour\n')
        git('add', '-A')
        git('commit', '-q', '-m', 'Two')
        const second = git('rev-parse', 'HEAD')

        // As a copied working copy would bring them: every file through a filter, a diff
        // driver and a merge driver, and a program for everything git may run.
        writeFileSync(join(repository, '.gitattributes'), '* diff=evil filter=evil merge=evil\n')
        const hooks = join(scratch, 'hooks')
        mkdirSync(hooks)
        for (const hook of ['post-index-change', 'reference-transaction', 'post-checkout']) {
          writeFileSync(join(hooks, hook), `#!/bin/sh\ntouch "${scratch}/marks/hook-${hook}"\n`)
          chmodSync(join(hooks, hook), 0o755)
        }
        for (const [key, value] of [
          ['core.fsmonitor', program('fsmonitor')],
          ['core.pager', program('pager')],
          ['pager.log', program('pager-log')],
          ['diff.external', program('external')],
          ['diff.evil.textconv', program('textconv')],
          ['diff.evil.command', program('diff-command')],
          ['filter.evil.clean', program('clean')],
          ['filter.evil.smudge', program('smudge')],
          ['filter.evil.process', program('process', 1)],
          ['filter.evil.required', 'true'],
          ['log.showSignature', 'true'],
          ['gpg.program', program('gpg')],
          ['core.hooksPath', hooks],
          ['core.sshCommand', program('ssh')],
          ['core.askPass', program('askpass')],
          ['core.editor', program('editor')]
        ]) {
          git('config', key!, value!)
        }
        // Every file stat-dirty, as after an unzip: status would compare it through its filter.
        utimesSync(join(repository, 'src/b.ts'), new Date(2001, 1, 1), new Date(2001, 1, 1))

        const port = gitIn(repository)
        expect(await port.headCommit()).toBe(second)
        expect(await port.hasCommit(first)).toBe(true)
        expect(await port.textAt(first, 'src/a.ts')).toBe('one\ntwo\nthree\n')
        expect(await port.changes(first, second)).toEqual([
          { kind: 'renamed', path: 'src/b.ts', from: 'src/a.ts' }
        ])
        expect(await port.log()).toHaveLength(2)
        expect(await port.log({ path: 'src/b.ts' })).toHaveLength(2)
        expect(await port.history('src/b.ts')).toHaveLength(2)
        expect(await port.files()).toEqual(['.gitattributes', 'src/b.ts'])
        expect(await port.workingTree()).toMatchObject({ changed: ['.gitattributes'] })
        expect(await port.branches()).toEqual([])
        expect(ran()).toEqual([])
      } finally {
        rmSync(scratch, { recursive: true, force: true })
      }
    }
  )

  it('does not run status where a filter cannot be emptied', async () => {
    const { scratch, git } = hostile()
    try {
      git('config', 'filter.a=b.clean', 'cat')
      expect(await gitIn(join(scratch, 'repository')).workingTree()).toBeUndefined()
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  it.runIf(process.platform !== 'win32')(
    'fetches nothing a partial clone lacks, whatever transport it names',
    async () => {
      const { scratch, repository, git, program, ran } = hostile()
      try {
        writeFileSync(join(repository, 'a.ts'), 'a\n')
        git('add', '-A')
        git('commit', '-q', '-m', 'A')
        const head = git('rev-parse', 'HEAD')
        git('config', 'core.repositoryformatversion', '1')
        git('config', 'extensions.partialClone', 'origin')
        git('config', 'remote.origin.url', 'ssh://example.invalid/repository.git')
        git('config', 'remote.origin.promisor', 'true')
        git('config', 'core.sshCommand', program('ssh', 1))
        const port = gitIn(repository)
        expect(await port.hasCommit('1234567890abcdef1234567890abcdef12345678')).toBe(false)
        expect(
          await port.textAt('1234567890abcdef1234567890abcdef12345678', 'a.ts')
        ).toBeUndefined()
        expect(await port.changes(head, '1234567890abcdef1234567890abcdef12345678')).toBeUndefined()
        expect(ran()).toEqual([])
        expect(existsSync(join(scratch, 'marks', 'ssh'))).toBe(false)
      } finally {
        rmSync(scratch, { recursive: true, force: true })
      }
    }
  )
})
