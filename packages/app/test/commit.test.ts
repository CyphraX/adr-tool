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
import { Repositories } from '../src/main/repositories'

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

  it('reads the Status from the frontmatter only, not from a block further down', () => {
    const body = ['# Use events', '', '---', 'status: accepted', '---', ''].join('\n')
    expect(commitMessage(events, body, body.replace('Use events', 'Use events!'))).toBe(
      'Update ADR 0012: Use events'
    )
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

  /** A plan of `0002-renumbered` with these files at HEAD and on disk, and this tree. */
  async function planOf(
    tree: { deleted: string[]; renamedFrom?: Record<string, string>; changed?: string[] },
    head: Record<string, string>,
    disk: Record<string, string> = {}
  ) {
    const fs = memoryFileSystem({ ...files, ...disk })
    const plan = await planCommitOf({
      repository: await openRepository(fs),
      logPath: 'docs/decisions',
      adrId: '0002-renumbered',
      tree: {
        branch: 'main',
        changed: tree.changed ?? ['docs/decisions/0002-renumbered.md', ...tree.deleted],
        deleted: tree.deleted,
        renamedFrom: tree.renamedFrom ?? {}
      },
      head: async (path) => head[path],
      read: (path) => fs.readText(path)
    })
    if (!plan.ok) throw new Error(plan.reason)
    return plan
  }

  it('is a new file where the deleted file of the same slug said something else', async () => {
    const other = ['---', 'status: accepted', '---', '', '# Something else', '', 'Entirely.', '']
    const plan = await planOf(
      { deleted: ['docs/decisions/0001-renumbered.md'] },
      { 'docs/decisions/0001-renumbered.md': other.join('\n') }
    )
    expect(plan.files).toEqual([
      expect.objectContaining({ path: 'docs/decisions/0002-renumbered.md', creates: true })
    ])
    expect(plan.message).toBe('Propose ADR 0002: Use events')
    expect(plan.others).toBe(1)
  })

  it('is no rename where git saw a copy, or the file it came from is back on disk', async () => {
    const was = { 'docs/decisions/0001-renumbered.md': adr('status: proposed') }
    const back = await planOf({ deleted: ['docs/decisions/0001-renumbered.md'] }, was, was)
    expect(back.files[0]).toMatchObject({
      path: 'docs/decisions/0002-renumbered.md',
      creates: true
    })

    const staged = await planOf(
      {
        deleted: [],
        renamedFrom: { 'docs/decisions/0002-renumbered.md': 'docs/decisions/0001-renumbered.md' }
      },
      was,
      was
    )
    expect(staged.files[0]).not.toHaveProperty('renameTo')
  })

  it('takes a rename git already sees, whatever the slug', async () => {
    const plan = await planOf(
      {
        deleted: [],
        renamedFrom: { 'docs/decisions/0002-renumbered.md': 'docs/decisions/0001-before.md' }
      },
      { 'docs/decisions/0001-before.md': adr('status: proposed') }
    )
    expect(plan.files[0]).toMatchObject({
      path: 'docs/decisions/0001-before.md',
      renameTo: 'docs/decisions/0002-renumbered.md'
    })
  })

  it('shows the last commit with the line breaks of the disk', async () => {
    const crlf = (text: string): string => text.replaceAll('\n', '\r\n')
    const fs = memoryFileSystem({
      ...files,
      'docs/adr/0003-other.md': crlf(adr('status: accepted'))
    })
    const plan = await planCommitOf({
      repository: await openRepository(fs),
      logPath: 'docs/adr',
      adrId: '0003-other',
      tree: {
        branch: undefined,
        changed: ['docs/adr/0003-other.md'],
        deleted: [],
        renamedFrom: {}
      },
      head: async () => adr('status: proposed'),
      read: (path) => fs.readText(path)
    })
    if (!plan.ok) throw new Error(plan.reason)
    expect(plan.files[0]!.before).toBe(crlf(adr('status: proposed')))
    expect(plan.message).toBe('Accept ADR 0003: Use events')
    expect(plan.branch).toBeUndefined()
  })

  it('offers a related ADR with the file it was renumbered from', async () => {
    // 0001-new supersedes docs/adr/0002-old, which was 0001-old before a Renumber.
    const fs = memoryFileSystem(files)
    const plan = await planCommitOf({
      repository: await openRepository(fs),
      logPath: 'docs/decisions',
      adrId: '0001-new',
      tree: {
        branch: 'main',
        changed: ['docs/adr/0001-old.md', 'docs/adr/0002-old.md', 'docs/decisions/0001-new.md'],
        deleted: ['docs/adr/0001-old.md'],
        renamedFrom: {}
      },
      head: async (path) =>
        path === 'docs/adr/0001-old.md'
          ? files['docs/adr/0002-old.md']
          : path === 'docs/decisions/0001-new.md'
            ? adr('status: proposed', 'supersedes: [docs/adr/0002-old]')
            : undefined,
      read: (path) => fs.readText(path)
    })
    if (!plan.ok) throw new Error(plan.reason)
    expect(plan.related.map((one) => one.file)).toEqual([
      expect.objectContaining({ path: 'docs/adr/0001-old.md', renameTo: 'docs/adr/0002-old.md' })
    ])
    expect(plan.others).toBe(0)
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

  it('is made when git fails after the commit, and the files stay in it', async () => {
    const hook = join(root, '.git/hooks/post-commit')
    writeFileSync(hook, '#!/bin/sh\necho "Could not notify the team." >&2\nexit 1\n')
    chmodSync(hook, 0o755)
    // A hook that fails after the commit does not fail it; one that is killed does. Both
    // leave HEAD moved: a commit that fails is told apart by HEAD alone.
    const failing = join(root, 'git-that-fails-after-committing')
    writeFileSync(
      failing,
      `#!/bin/sh\ngit "$@" || exit $?\ncase "$*" in *" commit "*) echo "killed" >&2; exit 1;; esac\n`
    )
    chmodSync(failing, 0o755)
    write('docs/adr/0002-b.md', adr('status: proposed'))

    const result = await commitFiles(root, ['docs/adr/0002-b.md'], 'Propose ADR 0002: B', failing)
    expect(result).toEqual({
      committed: true,
      sha: git('rev-parse', 'HEAD').trim(),
      said: 'Could not notify the team.\nkilled'
    })
    expect(git('show', '--name-status', '--format=%s', 'HEAD').trim().split('\n')).toEqual([
      'Propose ADR 0002: B',
      '',
      'A\tdocs/adr/0002-b.md'
    ])
    expect(git('status', '--porcelain', '--', 'docs')).toBe('')
  })

  it('commits no Renumber whose old file came back after the preview', async () => {
    renameSync(join(root, 'docs/adr/0001-a.md'), join(root, 'docs/adr/0002-a.md'))
    const repositories = new Repositories(() => undefined)
    try {
      const { id } = await repositories.open(root)
      const planned = await repositories.planCommit(id, 'docs/adr', '0002-a')
      if (!planned.ok) throw new Error(planned.reason)
      expect(planned.plan.message).toBe('Renumber ADR 0001 to 0002: Use events')

      git('checkout', '--', 'docs/adr/0001-a.md')
      const before = git('rev-parse', 'HEAD')
      const result = await repositories.commit(planned.plan.planId, [], planned.plan.message)
      expect(result).toEqual({
        committed: false,
        reason:
          'Nothing was committed: docs/adr/0001-a.md changed on disk after the preview was made. Try again to see what would be committed now.'
      })
      expect(git('rev-parse', 'HEAD')).toBe(before)
    } finally {
      await repositories.closeAll()
    }
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
