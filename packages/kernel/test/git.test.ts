import { describe, expect, it } from 'vitest'
import { isDay, isObjectName, memoryGit, type ScriptedCommit } from '../src'

/** A commit name of 40 digits, one for each letter. */
const sha = (letter: string): string => letter.repeat(40)

const ONE = 'a\nb\nc\nd\n'
const commits: ScriptedCommit[] = [
  { commit: sha('1'), date: '2026-10-01T09:00:00Z', subject: 'Start', files: { 'src/x.ts': ONE } },
  {
    commit: sha('2'),
    date: '2026-10-02T09:00:00Z',
    author: 'Lena Becker',
    subject: 'Rename x to y, and edit it',
    files: { 'src/y.ts': `${ONE}e\n`, 'README.md': '# R\n' }
  },
  {
    commit: sha('3'),
    date: '2026-10-03T09:00:00Z',
    subject: 'Edit y',
    files: { 'src/y.ts': `${ONE}e\nf\n`, 'README.md': '# R\n' }
  }
]

describe('a history in memory', () => {
  const git = memoryGit({ commits })

  it('has HEAD on the last commit, and knows which commits it has', async () => {
    expect(await git.headCommit()).toBe(sha('3'))
    expect(await git.hasCommit(sha('1'))).toBe(true)
    expect(await git.hasCommit(sha('9'))).toBe(false)
  })

  it('reads a file as a commit has it', async () => {
    expect(await git.textAt(sha('1'), 'src/x.ts')).toBe(ONE)
    expect(await git.textAt(sha('1'), 'src/y.ts')).toBeUndefined()
    expect(await git.textAt(sha('9'), 'src/x.ts')).toBeUndefined()
  })

  it('tells what changed between two commits, with a rename where much of a file stayed', async () => {
    expect(await git.changes(sha('1'), sha('3'))).toEqual([
      { kind: 'added', path: 'README.md' },
      { kind: 'renamed', path: 'src/y.ts', from: 'src/x.ts' }
    ])
    expect(await git.changes(sha('2'), sha('3'))).toEqual([{ kind: 'modified', path: 'src/y.ts' }])
    expect(await git.changes(sha('1'), sha('9'))).toBeUndefined()
  })

  it('logs the commits newest first, with what each changed', async () => {
    const log = (await git.log())!
    expect(log.map((entry) => [entry.commit, entry.parent, entry.subject])).toEqual([
      [sha('3'), sha('2'), 'Edit y'],
      [sha('2'), sha('1'), 'Rename x to y, and edit it'],
      [sha('1'), undefined, 'Start']
    ])
    expect(log[1]).toMatchObject({ author: 'Lena Becker', date: '2026-10-02T09:00:00Z' })
    expect(log[2]!.changes).toEqual([{ kind: 'added', path: 'src/x.ts' }])
  })

  it('follows one file back through its renames', async () => {
    const log = (await git.log({ path: 'src/y.ts' }))!
    expect(log.map((entry) => entry.changes)).toEqual([
      [{ kind: 'modified', path: 'src/y.ts' }],
      [{ kind: 'renamed', path: 'src/y.ts', from: 'src/x.ts' }],
      [{ kind: 'added', path: 'src/x.ts' }]
    ])
  })

  it('logs since a day, and at most so many commits', async () => {
    expect((await git.log({ since: '2026-10-02' }))!.map((entry) => entry.commit)).toEqual([
      sha('3'),
      sha('2')
    ])
    expect((await git.log({ limit: 1 }))!.map((entry) => entry.commit)).toEqual([sha('3')])
    expect(await git.log({ since: 'yesterday' })).toBeUndefined()
  })

  it('scripts a rebase as a history without the commits it replaced', async () => {
    const rebased = memoryGit({
      commits: [commits[0]!, { ...commits[2]!, commit: sha('4'), parent: sha('1') }]
    })
    expect(await rebased.hasCommit(sha('2'))).toBe(false)
    expect((await rebased.log())!.map((entry) => entry.commit)).toEqual([sha('4'), sha('1')])
  })

  it('has no HEAD before the first commit', async () => {
    const empty = memoryGit({ commits: [] })
    expect(await empty.headCommit()).toBeUndefined()
    expect(await empty.log()).toEqual([])
  })
})

describe('names and days', () => {
  it('takes only a full object name for a commit', () => {
    expect(isObjectName(sha('a'))).toBe(true)
    expect(isObjectName('f'.repeat(64))).toBe(true)
    expect(isObjectName('abc1234')).toBe(false)
    expect(isObjectName(`--${sha('a').slice(2)}`)).toBe(false)
    expect(isObjectName(sha('A'))).toBe(false)
  })

  it('takes a calendar day, and nothing else', () => {
    expect(isDay('2026-11-02')).toBe(true)
    expect(isDay('2026-02-30')).toBe(false)
    expect(isDay('2.11.2026')).toBe(false)
  })
})
