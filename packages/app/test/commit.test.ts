import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { memoryFileSystem, openRepository } from '@adr-tool/core'
import { commitMessage, planCommitOf } from '../src/main/commit'
import { commitFiles, gitIn } from '../src/main/git'

// docs/plan-roadmap.md, part 7; docs/adr/0012-committing-an-adr-runs-git-commit-for-its-files-only.md

const adr = (...frontmatter: string[]): string =>
  ['---', ...frontmatter, '---', '', '# Use events', ''].join('\n')

describe('the message a commit of an ADR proposes', () => {
  const events = { id: '0012-use-events', number: 12, title: 'Use events' }

  it('says what happened to the ADR', () => {
    expect(commitMessage(events, undefined, adr('status: proposed'))).toBe(
      'Propose ADR 0012: Use events'
    )
    expect(commitMessage(events, undefined, adr('status: accepted'))).toBe(
      'Add ADR 0012: Use events'
    )
    expect(commitMessage(events, adr('status: proposed'), adr('status: accepted'))).toBe(
      'Accept ADR 0012: Use events'
    )
    expect(commitMessage(events, adr('status: proposed'), adr('status: rejected'))).toBe(
      'Reject ADR 0012: Use events'
    )
    expect(commitMessage(events, adr('status: accepted'), adr('status: deprecated'))).toBe(
      'Deprecate ADR 0012: Use events'
    )
    expect(commitMessage(events, adr('status: accepted'), adr('status: superseded'))).toBe(
      'Mark ADR 0012 as superseded: Use events'
    )
    expect(
      commitMessage(events, adr('status: accepted'), adr('status: accepted', 'tags: [x]'))
    ).toBe('Update ADR 0012: Use events')
  })

  it('names the number it had before a Renumber, and the day of a date log', () => {
    expect(
      commitMessage(events, adr('status: accepted'), adr('status: accepted'), '0011-use-events')
    ).toBe('Renumber ADR 0011 to 0012: Use events')
    expect(
      commitMessage(
        { id: '20261102-use-events', title: 'Use events' },
        undefined,
        adr('status: proposed')
      )
    ).toBe('Propose ADR 2026-11-02: Use events')
  })
})

describe('what a commit of an ADR takes', () => {
  const files = {
    '.adr/config.yml': 'logs:\n  - path: docs/adr\n  - path: docs/decisions\n',
    'docs/adr/0002-old.md': adr('status: superseded', 'superseded-by: [docs/decisions/0001-new]'),
    'docs/adr/0003-other.md': adr('status: accepted'),
    'docs/decisions/0001-new.md': adr('status: accepted', 'supersedes: [docs/adr/0002-old]'),
    'docs/decisions/0002-renumbered.md': adr('status: proposed')
  }

  it('is its file, and offers the changed files of the ADRs it names or that name it', async () => {
    const fs = memoryFileSystem(files)
    const repository = await openRepository(fs)
    const head: Record<string, string> = {
      'docs/adr/0002-old.md': adr('status: accepted'),
      'docs/adr/0003-other.md': adr('status: proposed'),
      'docs/decisions/0001-new.md': adr('status: proposed', 'supersedes: [docs/adr/0002-old]')
    }
    const plan = await planCommitOf({
      repository,
      logPath: 'docs/decisions',
      adrId: '0001-new',
      tree: {
        branch: 'main',
        changed: [
          'docs/adr/0002-old.md',
          'docs/adr/0003-other.md',
          'docs/decisions/0001-new.md',
          'notes.txt'
        ],
        deleted: [],
        renamedFrom: {}
      },
      head: async (path) => head[path],
      read: (path) => fs.readText(path)
    })
    if (!plan.ok) throw new Error(plan.reason)
    expect(plan.files.map((file) => file.path)).toEqual(['docs/decisions/0001-new.md'])
    expect(plan.files[0]!.before).toBe(head['docs/decisions/0001-new.md'])
    expect(plan.related.map((one) => [one.file.path, one.logPath, one.adrId])).toEqual([
      ['docs/adr/0002-old.md', 'docs/adr', '0002-old']
    ])
    expect(plan.message).toBe('Accept ADR 0001: Use events')
    expect(plan.others).toBe(2)
  })

  it('is the file it was renumbered from as well, when git has not seen the rename yet', async () => {
    const fs = memoryFileSystem(files)
    const plan = await planCommitOf({
      repository: await openRepository(fs),
      logPath: 'docs/decisions',
      adrId: '0002-renumbered',
      tree: {
        branch: 'main',
        changed: ['docs/decisions/0001-renumbered.md', 'docs/decisions/0002-renumbered.md'],
        deleted: ['docs/decisions/0001-renumbered.md'],
        renamedFrom: {}
      },
      head: async (path) =>
        path === 'docs/decisions/0001-renumbered.md' ? adr('status: proposed') : undefined,
      read: (path) => fs.readText(path)
    })
    if (!plan.ok) throw new Error(plan.reason)
    expect(plan.files).toEqual([
      {
        path: 'docs/decisions/0001-renumbered.md',
        renameTo: 'docs/decisions/0002-renumbered.md',
        before: adr('status: proposed'),
        after: adr('status: proposed')
      }
    ])
    expect(plan.message).toBe('Renumber ADR 0001 to 0002: Use events')
  })

  it('is refused for an ADR without uncommitted changes', async () => {
    const fs = memoryFileSystem(files)
    expect(
      await planCommitOf({
        repository: await openRepository(fs),
        logPath: 'docs/adr',
        adrId: '0003-other',
        tree: { branch: 'main', changed: [], deleted: [], renamedFrom: {} },
        head: async () => undefined,
        read: (path) => fs.readText(path)
      })
    ).toEqual({ ok: false, reason: '0003-other has no uncommitted changes.' })
  })
})

describe('committing the files of an ADR', () => {
  let root: string
  const git = (...args: string[]): string =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8' })
  const write = (path: string, text: string): void => writeFileSync(join(root, path), text)

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'adr-tool-commit-')))
    mkdirSync(join(root, 'docs/adr'), { recursive: true })
    git('init', '-q', '-b', 'main')
    git('config', 'user.name', 'Kim Becker')
    git('config', 'user.email', 'kim@example.com')
    git('config', 'commit.gpgsign', 'false')
    write('docs/adr/0001-a.md', adr('status: proposed'))
    write('notes.txt', 'notes\n')
    write('staged.txt', 'staged\n')
    git('add', '-A')
    git('commit', '-q', '-m', 'Start')
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('commits those files and nothing else that is changed or staged', async () => {
    write('docs/adr/0001-a.md', adr('status: accepted'))
    write('docs/adr/0002-b.md', adr('status: proposed'))
    write('notes.txt', 'notes, changed\n')
    write('staged.txt', 'staged, changed\n')
    git('add', 'staged.txt')
    write('junk.txt', 'junk\n')

    const result = await commitFiles(
      root,
      ['docs/adr/0001-a.md', 'docs/adr/0002-b.md'],
      'Accept ADR 0001: A'
    )
    expect(result).toEqual({ committed: true, sha: git('rev-parse', 'HEAD').trim() })
    expect(git('show', '--name-status', '--format=%s', 'HEAD').trim().split('\n')).toEqual([
      'Accept ADR 0001: A',
      '',
      'M\tdocs/adr/0001-a.md',
      'A\tdocs/adr/0002-b.md'
    ])
    expect(git('status', '--porcelain').split('\n').filter(Boolean)).toEqual([
      ' M notes.txt',
      'M  staged.txt',
      '?? junk.txt'
    ])
    expect((await gitIn(root).workingTree())!.changed).toEqual([
      'junk.txt',
      'notes.txt',
      'staged.txt'
    ])
  })

  it('commits a Renumber as the rename it is', async () => {
    renameSync(join(root, 'docs/adr/0001-a.md'), join(root, 'docs/adr/0002-a.md'))
    const result = await commitFiles(
      root,
      ['docs/adr/0001-a.md', 'docs/adr/0002-a.md'],
      'Renumber ADR 0001 to 0002: A'
    )
    expect(result.committed).toBe(true)
    expect(git('show', '-M', '--name-status', '--format=', 'HEAD').trim()).toBe(
      'R100\tdocs/adr/0001-a.md\tdocs/adr/0002-a.md'
    )
  })

  it('says what git says when a hook refuses, and leaves the index as it was', async () => {
    const hook = join(root, '.git/hooks/pre-commit')
    writeFileSync(hook, '#!/bin/sh\necho "The message needs a ticket." >&2\nexit 1\n')
    chmodSync(hook, 0o755)
    write('docs/adr/0002-b.md', adr('status: proposed'))
    const before = git('rev-parse', 'HEAD')
    const result = await commitFiles(root, ['docs/adr/0002-b.md'], 'Propose ADR 0002: B')
    expect(result).toEqual({ committed: false, reason: 'The message needs a ticket.' })
    expect(git('rev-parse', 'HEAD')).toBe(before)
    expect(git('status', '--porcelain').split('\n').filter(Boolean)).toEqual([
      '?? docs/adr/0002-b.md'
    ])
  })

  it('refuses an empty message and a path outside the directory', async () => {
    write('docs/adr/0001-a.md', adr('status: accepted'))
    expect(await commitFiles(root, ['docs/adr/0001-a.md'], '  \n')).toEqual({
      committed: false,
      reason: 'A commit needs a message.'
    })
    expect((await commitFiles(root, ['../outside.md'], 'x')).committed).toBe(false)
  })
})
