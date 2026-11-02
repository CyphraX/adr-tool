import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { branchAdr, branchCache, branchOverview, treeFileSystem } from '../src/main/branches'
import { gitIn } from '../src/main/git'
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
  it('names each commit once, local branch first, without HEAD and what points at it', async () => {
    const branches = await gitIn(root).branches()
    // The most recent commit first.
    expect(branches).toEqual([
      {
        names: ['feature/kafka', 'origin/feature/kafka'],
        sha: kafka,
        date: '2026-03-02T12:00:00+00:00'
      },
      expect.objectContaining({ names: ['done'], date: '2026-03-01T12:00:00+00:00' })
    ])
  })

  it('reads a commit below the opened directory, and its blobs in one go', async () => {
    const git = gitIn(root)
    const files = await git.tree(kafka)
    expect(files?.map((file) => file.path)).toContain('docs/adr/0010-use-kafka.md')
    const blob = files!.find((file) => file.path === 'docs/adr/0010-use-kafka.md')!.blob
    const texts = await git.blobs([blob, 'f'.repeat(40), 'not a name'])
    expect([...texts]).toEqual([[blob, adr('proposed', 'Use Kafka')]])
  })

  it('reads a Decision Log from a commit as from the disk, its directory in one read', async () => {
    const git = gitIn(root)
    const reads: number[] = []
    const fs = treeFileSystem((await git.tree(kafka))!, new Map(), (names) => {
      reads.push(names.length)
      return git.blobs(names)
    })
    const repository = await openRepository(fs)
    expect(repository.logs.map((log) => [log.path, log.adrs.length])).toEqual([['docs/adr', 10]])
    expect(reads).toEqual([10])
  })
})

describe('The branch overview (docs/plan-roadmap.md, part 8)', () => {
  it('lists what a branch adds and decides, and nothing it only has from before', async () => {
    const git = gitIn(root)
    const here = await openRepository(nodeFileSystem(root))
    const overview = await branchOverview(git, here, branchCache())

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

  it('has nothing to say without git', async () => {
    const plain = realpathSync(mkdtempSync(join(tmpdir(), 'adr-tool-no-git-')))
    try {
      expect(await gitIn(plain).branches()).toEqual([])
      expect(await gitIn(plain).tree(kafka)).toBeUndefined()
    } finally {
      rmSync(plain, { recursive: true, force: true })
    }
  })
})
