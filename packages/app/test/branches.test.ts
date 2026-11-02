import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  branchAdr,
  branchCache,
  branchOverview,
  numberWarnings,
  treeFileSystem
} from '../src/main/branches'
import { gitIn, MAX_BRANCHES } from '../src/main/git'
import { Repositories } from '../src/main/repositories'
import { openRepository } from '@adr-tool/core'
import { nodeFileSystem } from '../src/main/node-file-system'

/** A scratch repository whose ADRs live in a subdirectory, which is what the app opens. */
let top: string
let root: string
let kafka: string
/** When the next commit is made: each one a day after the one before. */
let day = 1

const run = (...args: string[]): string =>
  execFileSync('git', args, {
    cwd: top,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Kim Becker',
      GIT_AUTHOR_EMAIL: 'kim@example.com',
      GIT_COMMITTER_NAME: 'Kim Becker',
      GIT_COMMITTER_EMAIL: 'kim@example.com',
      GIT_AUTHOR_DATE: `2026-03-0${day}T12:00:00Z`,
      GIT_COMMITTER_DATE: `2026-03-0${day}T12:00:00Z`
    }
  }).trim()

const commit = (message: string): void => {
  run('commit', '-q', '-m', message)
  day++
}

const adr = (status: string, title: string): string =>
  ['---', `status: ${status}`, '---', '', `# ${title}`, ''].join('\n')

const write = (path: string, text: string): void => writeFileSync(join(root, path), text)

beforeAll(() => {
  top = realpathSync(mkdtempSync(join(tmpdir(), 'adr-tool-branches-')))
  root = join(top, 'service')
  mkdirSync(join(root, 'docs/adr'), { recursive: true })
  run('init', '-q', '-b', 'main')
  run('config', 'core.autocrlf', 'false')
  for (let number = 1; number <= 9; number++) {
    write(`docs/adr/000${number}-decision-${number}.md`, adr('accepted', `Decision ${number}`))
  }
  write('docs/adr/0009-decision-9.md', adr('proposed', 'Decision 9'))
  run('add', '-A')
  commit('Nine ADRs')

  // A branch that is merged already, and so does nothing that main has not.
  run('branch', 'done')

  // A branch that adds ADR 0010 and accepts ADR 0009 — and whose name has a slash.
  run('checkout', '-q', '-b', 'feature/kafka')
  write('docs/adr/0010-use-kafka.md', adr('proposed', 'Use Kafka'))
  write('docs/adr/0009-decision-9.md', adr('accepted', 'Decision 9'))
  run('add', '-A')
  commit('Propose Kafka')
  kafka = run('rev-parse', 'HEAD')
  // The same commit under a remote-tracking name, and the remote's HEAD pointing at it.
  run('update-ref', 'refs/remotes/origin/feature/kafka', kafka)
  run('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/feature/kafka')

  // Main moves on: it renames ADR 0001, which the branch still has under its old name.
  run('checkout', '-q', 'main')
  run('mv', 'service/docs/adr/0001-decision-1.md', 'service/docs/adr/0001-decision-one.md')
  commit('Rename ADR 1')
})

afterAll(() => rmSync(top, { recursive: true, force: true }))

describe('The branches git has besides the one checked out', () => {
  it('names each commit once, local branch first, without HEAD and what is merged into it', async () => {
    const branches = await gitIn(root).branches()
    // `done` is merged into main: it does nothing main has not.
    expect(branches).toEqual([
      {
        names: ['feature/kafka', 'origin/feature/kafka'],
        sha: kafka,
        date: '2026-03-02T12:00:00+00:00'
      }
    ])
  })

  it('reads a directory of a commit tree by tree, and blobs by their size first', async () => {
    const git = gitIn(root)
    const directory = await git.directoryTree(kafka)
    const top = await git.treeEntries(directory!)
    expect(top).toEqual([expect.objectContaining({ name: 'docs', kind: 'directory' })])
    const docs = await git.treeEntries(top![0]!.object)
    const adrs = await git.treeEntries(docs!.find((entry) => entry.name === 'adr')!.object)
    const blob = adrs!.find((entry) => entry.name === '0010-use-kafka.md')!
    expect(blob.kind).toBe('file')

    const texts = await git.blobs([blob.object, 'f'.repeat(40), 'not a name'])
    expect([...texts!]).toEqual([[blob.object, adr('proposed', 'Use Kafka')]])
    // A commit that does not have the directory.
    const before = run('commit-tree', '-m', 'empty', run('mktree'))
    expect(await git.directoryTree(before)).toBeNull()
  })

  it('reads a Decision Log from a commit as from the disk, its directory in one read', async () => {
    const git = gitIn(root)
    const reads: number[] = []
    const counting = {
      treeEntries: (tree: string) => git.treeEntries(tree),
      blobs: (names: readonly string[]) => {
        reads.push(names.length)
        return git.blobs(names)
      }
    }
    const fs = treeFileSystem((await git.directoryTree(kafka))!, counting, branchCache())
    const repository = await openRepository(fs)
    expect(repository.logs.map((log) => [log.path, log.adrs.length])).toEqual([['docs/adr', 10]])
    expect(reads).toEqual([10])
    expect(fs.failed).toBe(false)
  })
})

describe('The branch overview (docs/plan-roadmap.md, part 8)', () => {
  it('lists what a branch adds and decides, and nothing it only has from before', async () => {
    const git = gitIn(root)
    const here = await openRepository(nodeFileSystem(root))
    const overview = await branchOverview(git, here, branchCache())

    expect(overview.unread).toEqual([])
    expect(overview.branches).toHaveLength(1)
    expect(overview.branches[0]!.names).toEqual(['feature/kafka', 'origin/feature/kafka'])
    expect(
      overview.branches[0]!.adrs.map((adr) => [adr.id, adr.change, adr.status, adr.statusHere])
    ).toEqual([
      ['0009-decision-9', 'status', 'accepted', 'proposed'],
      ['0010-use-kafka', 'added', 'proposed', undefined]
    ])
  })

  it('reads an ADR of the branch, and no other file', async () => {
    const git = gitIn(root)
    const cache = branchCache()

    const read = await branchAdr(git, kafka, 'docs/adr/0010-use-kafka.md', cache)
    expect(read).toMatchObject({
      id: '0010-use-kafka',
      title: 'Use Kafka',
      body: '\n# Use Kafka\n'
    })
    expect(await branchAdr(git, kafka, '../outside.md', cache)).toBeUndefined()
    expect(await branchAdr(git, kafka, 'docs/adr', cache)).toBeUndefined()
    expect(await branchAdr(git, 'f'.repeat(40), 'docs/adr/0010-use-kafka.md', cache)).toBe(
      undefined
    )
  })

  it('gives the renderer only ADRs of the commits the overview listed', async () => {
    const repositories = new Repositories(() => undefined)
    try {
      const { id } = await repositories.open(root)
      const main = run('rev-parse', 'HEAD')
      const path = 'docs/adr/0010-use-kafka.md'
      expect(await repositories.branchAdr(id, kafka, path)).toBeUndefined()
      // Both asked at once: the second waits for the first, and both are answered.
      const [first, second] = await Promise.all([
        repositories.branches(id),
        repositories.branches(id)
      ])
      expect(second).toEqual(first)
      expect(await repositories.branchAdr(id, kafka, path)).toMatchObject({ id: '0010-use-kafka' })
      expect(await repositories.branchAdr(id, main, 'docs/adr/0002-decision-2.md')).toBeUndefined()
    } finally {
      await repositories.closeAll()
    }
  })

  it('warns when a new ADR on main takes the number the branch gave its ADR', async () => {
    const repositories = new Repositories(() => undefined)
    try {
      const { id } = await repositories.open(root)
      const result = await repositories.planCreate({
        repositoryId: id,
        logPath: 'docs/adr',
        title: 'Use Postgres',
        template: (await repositories.listTemplates(id)).defaultName
      })
      expect(result.ok && result.change.createdId).toBe('0010-use-postgres')
      expect(result.ok && result.change.warnings).toEqual([
        'On the branch feature/kafka, 0010-use-kafka has the number 10 too. Whichever of the two is merged second has to be renumbered.'
      ])
    } finally {
      await repositories.closeAll()
    }
  })

  it('names every branch that has the ADR in one warning', () => {
    const added = {
      log: 'docs/adr',
      id: '0010-use-kafka',
      path: 'docs/adr/0010-use-kafka.md',
      number: 10,
      change: 'added' as const,
      sameNumber: []
    }
    const overview = {
      branches: [
        { names: ['kafka'], sha: 'a'.repeat(40), date: '', adrs: [added] },
        { names: ['origin/kafka'], sha: 'b'.repeat(40), date: '', adrs: [added] }
      ],
      unread: []
    }
    expect(numberWarnings(overview, 'docs/adr', '0010-use-postgres', 'sequential')).toEqual([
      'On the branches kafka and origin/kafka, 0010-use-kafka has the number 10 too. Whichever of the two is merged second has to be renumbered.'
    ])
  })

  it('has nothing to say without git', async () => {
    const plain = realpathSync(mkdtempSync(join(tmpdir(), 'adr-tool-no-git-')))
    try {
      expect(await gitIn(plain).branches()).toBeUndefined()
      expect(await gitIn(plain).directoryTree(kafka)).toBeUndefined()
    } finally {
      rmSync(plain, { recursive: true, force: true })
    }
  })
})

describe('Branches of a repository that is not complete', () => {
  /** A repository of its own, opened at its top. */
  const scratch = (): { dir: string; git: (...args: string[]) => string } => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'adr-tool-branches-')))
    const git = (...args: string[]): string =>
      execFileSync('git', args, {
        cwd: dir,
        encoding: 'utf8',
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: 'Kim Becker',
          GIT_AUTHOR_EMAIL: 'kim@example.com',
          GIT_COMMITTER_NAME: 'Kim Becker',
          GIT_COMMITTER_EMAIL: 'kim@example.com'
        }
      }).trim()
    git('init', '-q', '-b', 'main')
    mkdirSync(join(dir, 'docs/adr'), { recursive: true })
    writeFileSync(join(dir, 'docs/adr/0001-first.md'), adr('accepted', 'First'))
    git('add', '-A')
    git('commit', '-q', '-m', 'First')
    return { dir, git }
  }

  it('fetches nothing a partial clone lacks, and runs nothing its configuration names', async () => {
    const { dir, git } = scratch()
    try {
      // A branch whose ADR is a blob the object store does not have.
      const missing = '1'.repeat(40)
      const tree = (entries: string): string =>
        execFileSync('git', ['mktree', '--missing'], {
          cwd: dir,
          input: entries,
          encoding: 'utf8'
        }).trim()
      const adrTree = tree(`100644 blob ${missing}\t0002-lazy.md\n`)
      const docsTree = tree(`040000 tree ${adrTree}\tadr\n`)
      const rootTree = tree(`040000 tree ${docsTree}\tdocs\n`)
      const commit = git('commit-tree', '-p', 'HEAD', '-m', 'Lazy', rootTree)
      git('update-ref', 'refs/heads/lazy', commit)
      // A promisor remote whose transport would run a program.
      const pwned = join(dir, 'PWNED')
      git('config', 'core.repositoryformatversion', '1')
      git('config', 'extensions.partialClone', 'origin')
      git('config', 'remote.origin.url', 'ssh://example.invalid/repository')
      git('config', 'remote.origin.promisor', 'true')
      git('config', 'core.sshCommand', `touch ${pwned}`)

      const here = await openRepository(nodeFileSystem(dir))
      const overview = await branchOverview(gitIn(dir), here, branchCache())
      expect(existsSync(pwned)).toBe(false)
      expect(overview).toEqual({ branches: [], unread: ['lazy'] })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('lists no Status change in a shallow clone that ends before the merge base', async () => {
    const { dir, git } = scratch()
    const clone = realpathSync(mkdtempSync(join(tmpdir(), 'adr-tool-shallow-')))
    try {
      writeFileSync(join(dir, 'docs/adr/0002-second.md'), adr('proposed', 'Second'))
      git('add', '-A')
      git('commit', '-q', '-m', 'Second')
      git('checkout', '-q', '-b', 'feature')
      writeFileSync(join(dir, 'docs/adr/0003-kafka.md'), adr('proposed', 'Use Kafka'))
      git('add', '-A')
      git('commit', '-q', '-m', 'Kafka')
      git('checkout', '-q', 'main')
      writeFileSync(join(dir, 'docs/adr/0002-second.md'), adr('accepted', 'Second'))
      git('commit', '-q', '-am', 'Accept the second')
      execFileSync('git', [
        'clone',
        '-q',
        '--depth',
        '1',
        '--no-single-branch',
        `file://${dir}`,
        clone
      ])

      const here = await openRepository(nodeFileSystem(clone))
      const overview = await branchOverview(gitIn(clone), here, branchCache())
      // main accepted 0002; the branch did not take it back.
      expect(
        overview.branches.map((branch) => [branch.names, branch.adrs.map((adr) => adr.id)])
      ).toEqual([[['origin/feature'], ['0003-kafka']]])
    } finally {
      rmSync(dir, { recursive: true, force: true })
      rmSync(clone, { recursive: true, force: true })
    }
  })

  it('leaves merged branches out before it counts to the limit', async () => {
    const { dir, git } = scratch()
    try {
      git('checkout', '-q', '-b', 'old-feature')
      writeFileSync(join(dir, 'docs/adr/0002-old.md'), adr('proposed', 'Old'))
      git('add', '-A')
      git('commit', '-q', '-m', 'Old')
      git('checkout', '-q', 'main')
      // More branches than are read, all merged and all newer than old-feature: in one go.
      const now = Math.floor(Date.now() / 1000) + 60
      const commits = Array.from({ length: MAX_BRANCHES + 2 }, (_, number) => {
        const ref = number <= MAX_BRANCHES ? `refs/heads/merged-${number}` : 'refs/heads/main'
        const message = `Merged ${number}`
        return [
          `commit ${ref}`,
          `mark :${number + 1}`,
          `committer Kim Becker <kim@example.com> ${now + number} +0000`,
          `data ${message.length}`,
          message,
          `from ${number === 0 ? git('rev-parse', 'HEAD') : `:${number}`}`,
          ''
        ].join('\n')
      })
      execFileSync('git', ['fast-import', '--quiet'], { cwd: dir, input: commits.join('\n') })

      const branches = await gitIn(dir).branches()
      expect(branches?.map((branch) => branch.names)).toEqual([['old-feature']])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
