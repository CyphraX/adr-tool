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

  it('stops at the first commit committed before the day, as git does, and goes by when it was committed', async () => {
    const walked = memoryGit({
      commits: [
        { commit: sha('5'), date: '2026-10-05T09:00:00Z', files: { 'a.ts': 'a\n' } },
        // Rebased: authored before the day, committed after it.
        {
          commit: sha('6'),
          date: '2026-10-01T09:00:00Z',
          committed: '2026-10-07T09:00:00Z',
          files: { 'a.ts': 'b\n' }
        },
        { commit: sha('7'), date: '2026-10-02T09:00:00Z', files: { 'a.ts': 'c\n' } },
        { commit: sha('8'), date: '2026-10-08T09:00:00Z', files: { 'a.ts': 'd\n' } }
      ]
    })
    const since = (await walked.log({ since: '2026-10-04' }))!
    // sha 7 is older than the day: the walk ends there, though sha 5 is newer than the day.
    expect(since.map((entry) => entry.commit)).toEqual([sha('8')])
    const later = (await walked.log({ since: '2026-10-01' }))!
    expect(later.map((entry) => [entry.commit, entry.date])).toEqual([
      [sha('8'), '2026-10-08T09:00:00Z'],
      [sha('7'), '2026-10-02T09:00:00Z'],
      [sha('6'), '2026-10-01T09:00:00Z'],
      [sha('5'), '2026-10-05T09:00:00Z']
    ])
  })

  it('finds a rename only where git would: most of the bytes kept, the sizes not too far apart', async () => {
    const changes = (before: string, after: string) =>
      memoryGit({
        commits: [
          { commit: sha('1'), files: { 'a.ts': before } },
          { commit: sha('2'), files: { 'b.ts': after } }
        ]
      }).changes(sha('1'), sha('2'))
    const renamed = [{ kind: 'renamed', path: 'b.ts', from: 'a.ts' }]
    const apart = [
      { kind: 'deleted', path: 'a.ts' },
      { kind: 'added', path: 'b.ts' }
    ]
    expect(await changes('one\ntwo\n', 'one\ntwo\n')).toEqual(renamed)
    expect(await changes('one\ntwo\nthree\n', 'one\ntwo\nfour\n')).toEqual(renamed)
    // Half the bytes of the larger file at least: a short line kept of two long ones is not.
    expect(
      await changes('a\nthe second line, a long one\n', 'a\nanother long line instead\n')
    ).toEqual(apart)
    // A file that more than doubled is not the same file, whatever it kept.
    expect(await changes('one\ntwo\n', 'one\ntwo\nthree\nfour\nfive\n')).toEqual(apart)
    // An empty file is never a rename.
    expect(await changes('', '')).toEqual(apart)
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
