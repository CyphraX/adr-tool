import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, win32 } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { gitExecutable, listRepository, walk } from '../src/listing'

const scratch: string[] = []
afterAll(() => scratch.forEach((dir) => rmSync(dir, { recursive: true, force: true })))

/** A directory on disk with `files` (path → text) in it. */
function folder(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'adr-listing-'))
  scratch.push(root)
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  return root
}

/** git as the test runs it: on its own configuration, never the user's. */
const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' }
  })

const hasGit = (() => {
  try {
    execFileSync('git', ['--version'])
    return true
  } catch {
    return false
  }
})()

describe('gitExecutable', () => {
  it('is git on the PATH, except on Windows', () => {
    expect(gitExecutable('linux', '/usr/bin', () => false)).toBe('git')
    expect(gitExecutable('darwin', undefined, () => true)).toBe('git')
  })

  it('is looked up by its full path on Windows, never in the directory it runs in', () => {
    const found = new Set([win32.join('C:\\Program Files\\Git\\cmd', 'git.exe'), 'git.exe'])
    const exists = (path: string): boolean => found.has(path)
    // A relative entry would be the checkout itself: a git.exe the repository brings along.
    expect(gitExecutable('win32', '.;bin;"C:\\Program Files\\Git\\cmd";C:\\Windows', exists)).toBe(
      'C:\\Program Files\\Git\\cmd\\git.exe'
    )
    expect(gitExecutable('win32', '.;C:\\Windows', exists)).toBe('git')
    expect(gitExecutable('win32', undefined, exists)).toBe('git')
  })
})

describe.runIf(hasGit && process.platform !== 'win32')('listRepository in a git repository', () => {
  it('lists what git tracks and what it neither tracks nor ignores, without what is deleted', () => {
    const root = folder({
      '.gitignore': 'build/\n*.log\n',
      'src/a.ts': 'export const a = 1\n',
      'src/gone.ts': 'export const gone = 1\n',
      'build/out.js': '',
      'debug.log': ''
    })
    git(root, 'init', '-q')
    git(root, 'add', '.')
    git(root, 'commit', '-qm', 'init')
    rmSync(join(root, 'src/gone.ts'))
    writeFileSync(join(root, 'src/new.ts'), 'export const n = 1\n')
    return expect(listRepository(root)).resolves.toEqual(['.gitignore', 'src/a.ts', 'src/new.ts'])
  })

  it('runs nothing the repository configures: no file system monitor', async () => {
    const root = folder({ 'src/a.ts': '' })
    const marker = join(folder({}), 'ran')
    const monitor = join(folder({}), 'monitor.sh')
    writeFileSync(monitor, `#!/bin/sh\ntouch '${marker}'\necho\n`)
    chmodSync(monitor, 0o755)
    git(root, 'init', '-q')
    git(root, 'add', '.')
    git(root, 'commit', '-qm', 'init')
    git(root, 'config', 'core.fsmonitor', monitor)
    // git itself would run it: the guard is what keeps it from running.
    git(root, 'status', '--porcelain')
    expect(existsSync(marker)).toBe(true)
    rmSync(marker)

    expect(await listRepository(root)).toEqual(['src/a.ts'])
    expect(existsSync(marker)).toBe(false)
  })

  it('lists the files below a directory of a repository, relative to it', async () => {
    const root = folder({ 'service/src/a.ts': '', 'other/b.ts': '' })
    git(root, 'init', '-q')
    expect(await listRepository(join(root, 'service'))).toEqual(['src/a.ts'])
  })
})

describe('walk, for a folder without git', () => {
  it('honours .gitignore where it lies and below, the deeper one with the last word', async () => {
    const root = folder({
      '.gitignore': '*.log\nsecret/\n',
      'a.ts': '',
      'debug.log': '',
      'secret/key.ts': '',
      'src/.gitignore': '!keep.log\n',
      'src/keep.log': '',
      'src/drop.log.ts': '',
      'src/other.log': ''
    })
    expect(await walk(root)).toEqual([
      '.gitignore',
      'a.ts',
      'src/.gitignore',
      'src/drop.log.ts',
      'src/keep.log'
    ])
  })

  it('leaves out build output beside a build file, node_modules and .git anywhere', async () => {
    const root = folder({
      'package.json': '{}',
      'dist/bundle.js': '',
      'docs/dist/page.md': '',
      'java/pom.xml': '',
      'java/target/App.class': '',
      'node_modules/x/index.js': '',
      'deep/node_modules/y/index.js': '',
      '.git/config': ''
    })
    expect(await walk(root)).toEqual(['docs/dist/page.md', 'java/pom.xml', 'package.json'])
  })

  it('does not follow a symbolic link', async () => {
    const outside = folder({ 'secret.ts': '' })
    const root = folder({ 'a.ts': '' })
    symlinkSync(outside, join(root, 'linked'))
    symlinkSync(join(outside, 'secret.ts'), join(root, 'file.ts'))
    expect(await walk(root)).toEqual(['a.ts'])
  })
})
