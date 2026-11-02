import { describe, expect, it } from 'vitest'
import {
  applyChangeSet,
  groupProblems,
  memoryFileSystem,
  openRepository,
  planAccept,
  planCreate,
  planEditMetadata,
  planRenumber,
  planRepair,
  repairsOf,
  type DecisionLog,
  type Repository
} from '../src'

/** Two Decision Logs, as `.adr/config.yml` names them: path in the repository → text. */
const CONFIG = 'logs:\n  - path: docs/adr\n  - path: docs/decisions\n'

const adr = (...frontmatter: string[]): string =>
  ['---', ...frontmatter, '---', '', '# Title', ''].join('\n')

async function open(files: Record<string, string>) {
  const fs = memoryFileSystem({ '.adr/config.yml': CONFIG, ...files })
  const repository = await openRepository(fs)
  const log = (path: string): DecisionLog => repository.logs.find((one) => one.path === path)!
  return { fs, repository, log }
}

const kinds = (repository: Repository): string[] =>
  repository.logs.flatMap((log) =>
    log.problems.map(
      (problem) => `${log.path} ${problem.kind} ${'adr' in problem ? problem.adr : ''}`
    )
  )

describe('Relations across Decision Logs (docs/file-format.md, section 3)', () => {
  it('reads a supersession from one log into another, and finds nothing wrong with it', async () => {
    const { repository, log } = await open({
      'docs/adr/0002-old.md': adr('status: superseded', 'superseded-by: [docs/decisions/0001-new]'),
      'docs/decisions/0001-new.md': adr('status: accepted', 'supersedes: [docs/adr/0002-old]')
    })
    expect(kinds(repository)).toEqual([])
    expect(log('docs/decisions').relations).toEqual([
      { type: 'supersedes', from: '0001-new', to: 'docs/adr/0002-old', state: 'in-effect' }
    ])
    // The log of the target sees the Relation too, from the other side.
    expect(log('docs/adr').relations).toEqual([
      { type: 'supersedes', from: 'docs/decisions/0001-new', to: '0002-old', state: 'in-effect' }
    ])
    expect(log('docs/adr').guests.map((guest) => guest.reference)).toEqual([
      'docs/decisions/0001-new'
    ])
    expect(log('docs/adr').guests[0]).not.toHaveProperty('body')
  })

  it('reports what is missing on the ADR it is about, in its own log', async () => {
    const { repository, log } = await open({
      'docs/adr/0002-old.md': adr('status: accepted'),
      'docs/decisions/0001-new.md': adr('status: accepted', 'supersedes: [docs/adr/0002-old]')
    })
    expect(kinds(repository)).toEqual([
      'docs/adr missing-back-reference 0002-old',
      'docs/adr not-marked-superseded 0002-old'
    ])
    expect(log('docs/adr').problems[0]).toEqual({
      kind: 'missing-back-reference',
      adr: '0002-old',
      key: 'superseded-by',
      source: 'docs/decisions/0001-new'
    })
  })

  it('names an ADR that is not there, in a log that is not there, as unknown', async () => {
    const { repository } = await open({
      'docs/adr/0001-a.md': adr(
        'status: accepted',
        'depends-on: [docs/decisions/0009-gone, docs/nowhere/0001-x, docs/decisions]',
        'amended-by: [docs/decisions/0008-gone]'
      ),
      'docs/decisions/0001-b.md': adr('status: accepted')
    })
    expect(
      repository.logs[0]!.problems.map((problem) =>
        problem.kind === 'unknown-target' ? problem.target : problem.kind
      )
    ).toEqual([
      'docs/decisions/0009-gone',
      'docs/nowhere/0001-x',
      'docs/decisions',
      'docs/decisions/0008-gone'
    ])
  })

  it('takes a reference to the own log for the bare ID, itself included', async () => {
    const { repository, log } = await open({
      'docs/adr/0001-a.md': adr(
        'status: accepted',
        'relates-to: [docs/adr/0002-b, docs/adr/0001-a]'
      ),
      'docs/adr/0002-b.md': adr('status: accepted'),
      'docs/decisions/0001-c.md': adr('status: accepted')
    })
    expect(log('docs/adr').relations).toEqual([
      { type: 'relates-to', from: '0001-a', to: '0002-b', state: 'in-effect' }
    ])
    expect(kinds(repository)).toEqual(['docs/adr self-reference 0001-a'])
  })

  it('finds a Back-reference without the Relation behind it, across logs as within one', async () => {
    const { repository, log } = await open({
      'docs/adr/0002-old.md': adr('status: superseded', 'superseded-by: [docs/decisions/0001-new]'),
      'docs/decisions/0001-new.md': adr('status: proposed', 'supersedes: [docs/adr/0002-old]')
    })
    expect(kinds(repository)).toEqual([
      'docs/adr unfounded-back-reference 0002-old',
      'docs/adr superseded-without-successor 0002-old'
    ])
    expect(log('docs/adr').relations).toEqual([
      { type: 'supersedes', from: 'docs/decisions/0001-new', to: '0002-old', state: 'pending' }
    ])
  })

  it('finds a cycle of supersedes through two logs', async () => {
    const { repository } = await open({
      'docs/adr/0001-a.md': adr('status: proposed', 'supersedes: [docs/decisions/0001-b]'),
      'docs/decisions/0001-b.md': adr('status: proposed', 'supersedes: [docs/adr/0001-a]')
    })
    expect(
      repository.logs.flatMap((log) =>
        log.problems.map((problem) => problem.kind === 'supersedes-cycle' && problem.adrs)
      )
    ).toEqual([
      ['0001-a', 'docs/decisions/0001-b'],
      ['0001-b', 'docs/adr/0001-a']
    ])
  })
})

describe('operations across Decision Logs', () => {
  it('accepts an ADR that supersedes one of another log, and both files say so', async () => {
    const { fs, log } = await open({
      'docs/adr/0002-old.md': adr('status: accepted'),
      'docs/decisions/0001-new.md': adr('status: proposed', 'supersedes: [docs/adr/0002-old]')
    })
    const plan = await planAccept(fs, log('docs/decisions'), '0001-new', { today: '2026-11-02' })
    if (!plan.ok) throw new Error(plan.reason)
    expect(plan.changeSet.files.map((file) => file.path)).toEqual([
      'docs/decisions/0001-new.md',
      'docs/adr/0002-old.md'
    ])
    await applyChangeSet(fs, plan.changeSet)
    expect(await fs.readText('docs/adr/0002-old.md')).toBe(
      adr('status: superseded', 'superseded-by: [docs/decisions/0001-new]')
    )
    const reopened = await openRepository(fs)
    expect(kinds(reopened)).toEqual([])
  })

  it('refuses to accept what would supersede an ADR of another log that cannot be superseded', async () => {
    const { fs, log } = await open({
      'docs/adr/0002-old.md': adr('status: proposed'),
      'docs/decisions/0001-new.md': adr('status: proposed', 'amends: [docs/adr/0002-old]')
    })
    expect(
      await planAccept(fs, log('docs/decisions'), '0001-new', { today: '2026-11-02' })
    ).toMatchObject({
      ok: false,
      reason: 'Only an accepted ADR can be amended. docs/adr/0002-old is proposed.'
    })
  })

  it('adds an ADR of another log to a Relation, and refuses one that is not there', async () => {
    const { fs, log } = await open({
      'docs/adr/0001-a.md': adr('status: accepted'),
      'docs/decisions/0001-b.md': adr('status: accepted')
    })
    const added = await planEditMetadata(fs, log('docs/decisions'), '0001-b', {
      relations: { 'relates-to': ['docs/adr/0001-a'] }
    })
    expect(added.ok && added.changeSet.files[0]!.after).toBe(
      adr('status: accepted', 'relates-to: [docs/adr/0001-a]')
    )
    expect(
      await planEditMetadata(fs, log('docs/decisions'), '0001-b', {
        relations: { 'depends-on': ['docs/adr/0009-gone'] }
      })
    ).toMatchObject({ ok: false, reason: 'There is no ADR docs/adr/0009-gone in this repository.' })
    expect(
      await planEditMetadata(fs, log('docs/decisions'), '0001-b', {
        relations: { 'depends-on': ['docs/decisions/0001-b'] }
      })
    ).toMatchObject({ ok: false, reason: '0001-b cannot have a Relation to itself.' })
  })

  it('creates an ADR that supersedes one of another log', async () => {
    const { fs, log } = await open({
      'docs/adr/0002-old.md': adr('status: accepted'),
      'docs/decisions/0001-b.md': adr('status: accepted')
    })
    const plan = await planCreate(fs, log('docs/decisions'), {
      title: 'New',
      template: 'minimal',
      today: '2026-11-02',
      relation: { type: 'supersedes', target: 'docs/adr/0002-old' }
    })
    expect(plan.ok && plan.changeSet.files[0]!.after).toContain('supersedes: [docs/adr/0002-old]')
  })

  it('renumbers an ADR and rewrites what the other logs say about it', async () => {
    const { fs, log } = await open({
      'docs/adr/0002-a.md': adr('status: accepted'),
      'docs/adr/0002-b.md': adr('status: superseded', 'superseded-by: [docs/decisions/0001-new]'),
      'docs/decisions/0001-new.md': adr(
        'status: accepted',
        'supersedes: [docs/adr/0002-b]',
        'relates-to: [0001-new-twin, docs/adr/0002-a]'
      ),
      'docs/decisions/0001-new-twin.md': adr('status: accepted', "depends-on: ['docs/adr/0002-b']")
    })
    const plan = await planRenumber(fs, log('docs/adr'), '0002-b')
    if (!plan.ok) throw new Error(plan.reason)
    await applyChangeSet(fs, plan.changeSet)
    expect(await fs.readText('docs/decisions/0001-new.md')).toBe(
      adr(
        'status: accepted',
        'supersedes: [docs/adr/0003-b]',
        'relates-to: [0001-new-twin, docs/adr/0002-a]'
      )
    )
    expect(await fs.readText('docs/decisions/0001-new-twin.md')).toBe(
      adr('status: accepted', "depends-on: ['docs/adr/0003-b']")
    )
    expect(kinds(await openRepository(fs))).toEqual(['docs/decisions duplicate-number '])
  })

  it('repairs a missing Back-reference with the reference of the other log', async () => {
    const { fs, log } = await open({
      'docs/adr/0002-old.md': adr('status: superseded'),
      'docs/decisions/0001-new.md': adr('status: accepted', 'supersedes: [docs/adr/0002-old]')
    })
    const target = log('docs/adr')
    const [repair] = repairsOf(target, target.problems[0]!)
    expect(repair).toEqual({
      kind: 'add-back-reference',
      adr: '0002-old',
      key: 'superseded-by',
      item: 'docs/decisions/0001-new'
    })
    const plan = await planRepair(fs, target, repair!)
    if (!plan.ok) throw new Error(plan.reason)
    await applyChangeSet(fs, plan.changeSet)
    expect(kinds(await openRepository(fs))).toEqual([])
  })

  it('says what the other log says before a Back-reference to it is taken out', async () => {
    const { fs, log } = await open({
      'docs/adr/0002-old.md': adr('status: accepted', 'amended-by: [docs/decisions/0001-new]'),
      'docs/decisions/0001-new.md': adr('status: proposed', 'amends: [docs/adr/0002-old]')
    })
    const target = log('docs/adr')
    const plan = await planRepair(fs, target, repairsOf(target, target.problems[0]!)[0]!)
    expect(plan.ok && plan.warnings).toEqual([
      'docs/decisions/0001-new is still proposed. When it is accepted, the Back-reference is written again.'
    ])
  })
})

describe('what the review of part 6 found', () => {
  it('renumbers what the own log writes with its directory, and refuses an ADR that names itself so', async () => {
    const { fs, log } = await open({
      'docs/adr/0002-a.md': adr('status: accepted'),
      'docs/adr/0002-b.md': adr('status: accepted'),
      'docs/adr/0003-c.md': adr('status: accepted', 'depends-on: [docs/adr/0002-b]')
    })
    const plan = await planRenumber(fs, log('docs/adr'), '0002-b')
    if (!plan.ok) throw new Error(plan.reason)
    await applyChangeSet(fs, plan.changeSet)
    expect(await fs.readText('docs/adr/0003-c.md')).toBe(
      adr('status: accepted', 'depends-on: [docs/adr/0004-b]')
    )

    const itself = await open({
      'docs/adr/0002-a.md': adr('status: accepted'),
      'docs/adr/0002-b.md': adr('status: accepted', 'relates-to: [docs/adr/0002-b]')
    })
    expect(await planRenumber(itself.fs, itself.log('docs/adr'), '0002-b')).toMatchObject({
      ok: false,
      reason: '0002-b names itself in relates-to. Remove that before it is renumbered.'
    })
  })

  it('renumbers past a file of another log that cannot be read and names only a longer ID', async () => {
    const { fs, log } = await open({
      'docs/adr/0002-a.md': adr('status: accepted'),
      'docs/adr/0002-b.md': adr('status: accepted'),
      'docs/decisions/0001-x.md': '---\nstatus: [\nrelates-to: [docs/adr/0002-bc]\n---\n\n# X\n'
    })
    expect((await planRenumber(fs, log('docs/adr'), '0002-b')).ok).toBe(true)
  })

  it('repairs a reference to itself however it is written', async () => {
    const { fs, log } = await open({
      'docs/adr/0001-a.md': adr('status: accepted', 'relates-to: [docs/adr/0001-a]')
    })
    const target = log('docs/adr')
    const plan = await planRepair(fs, target, repairsOf(target, target.problems[0]!)[0]!)
    if (!plan.ok) throw new Error(plan.reason)
    await applyChangeSet(fs, plan.changeSet)
    expect(kinds(await openRepository(fs))).toEqual([])
  })

  it('puts what follows from an ADR of another log that cannot be read under that ADR', async () => {
    const { fs, log } = await open({
      'docs/adr/0002-old.md': adr('status: superseded', 'superseded-by: [docs/decisions/0001-new]'),
      'docs/decisions/0001-new.md': adr('status: Acceptd', 'supersedes: [docs/adr/0002-old]')
    })
    const groups = groupProblems(log('docs/adr'))
    expect(groups).toEqual([
      {
        problem: expect.objectContaining({
          kind: 'invalid-metadata',
          adr: 'docs/decisions/0001-new',
          key: 'status'
        }),
        consequences: [
          expect.objectContaining({ kind: 'unfounded-back-reference', adr: '0002-old' }),
          expect.objectContaining({ kind: 'superseded-without-successor', adr: '0002-old' })
        ]
      }
    ])
    const target = log('docs/adr')
    const unfounded = target.problems.find(
      (problem) => problem.kind === 'unfounded-back-reference'
    )!
    const plan = await planRepair(fs, target, repairsOf(target, unfounded)[0]!)
    expect(plan.ok).toBe(false)
  })

  it('puts what follows from an unreadable ADR of the own log under it, however it is named', async () => {
    const { log } = await open({
      'docs/adr/0002-old.md': adr('status: superseded', 'superseded-by: [docs/adr/0003-new]'),
      'docs/adr/0003-new.md': '---\nstatus: [\n---\n\n# New\n'
    })
    const groups = groupProblems(log('docs/adr'))
    expect(groups.map((group) => [group.problem.kind, group.consequences.length])).toEqual([
      ['invalid-frontmatter', 2]
    ])
  })

  it('finds a cycle of supersedes through three logs, in each of them', async () => {
    const fs = memoryFileSystem({
      '.adr/config.yml': 'logs:\n  - path: a\n  - path: b\n  - path: c\n',
      'a/0001-a.md': adr('status: proposed', 'supersedes: [b/0001-b]'),
      'b/0001-b.md': adr('status: proposed', 'supersedes: [c/0001-c]'),
      'c/0001-c.md': adr('status: proposed', 'supersedes: [a/0001-a]')
    })
    const repository = await openRepository(fs)
    expect(
      repository.logs.map((one) =>
        one.problems.flatMap((problem) =>
          problem.kind === 'supersedes-cycle' ? [problem.adrs] : []
        )
      )
    ).toEqual([
      [['0001-a', 'b/0001-b', 'c/0001-c']],
      [['0001-b', 'a/0001-a', 'c/0001-c']],
      [['0001-c', 'a/0001-a', 'b/0001-b']]
    ])
  })

  it('writes the bare ID for an ADR of the own log, once', async () => {
    const { fs, log } = await open({
      'docs/adr/0001-a.md': adr('status: proposed'),
      'docs/adr/0002-b.md': adr('status: accepted')
    })
    const edited = await planEditMetadata(fs, log('docs/adr'), '0001-a', {
      relations: { 'relates-to': ['0002-b', 'docs/adr/0002-b'], amends: ['docs/adr/0002-b'] }
    })
    expect(edited.ok && edited.changeSet.files[0]!.after).toBe(
      adr('status: proposed', 'amends: [0002-b]', 'relates-to: [0002-b]')
    )
    const created = await planCreate(fs, log('docs/adr'), {
      title: 'New',
      template: 'minimal',
      today: '2026-11-02',
      relation: { type: 'amends', target: 'docs/adr/0002-b' }
    })
    expect(created.ok && created.changeSet.files[0]!.after).toContain('amends: [0002-b]')
  })

  it('names an ADR of a log at the root of the repository as ./<ID>', async () => {
    const fs = memoryFileSystem({
      '.adr/config.yml': 'logs:\n  - path: .\n  - path: docs/decisions\n',
      '0001-root.md': adr('status: accepted'),
      'docs/decisions/0001-new.md': adr('status: proposed', 'supersedes: [./0001-root]')
    })
    const repository = await openRepository(fs)
    const decisions = repository.logs.find((one) => one.path === 'docs/decisions')!
    expect(decisions.guests.map((guest) => guest.reference)).toEqual(['./0001-root'])
    const plan = await planAccept(fs, decisions, '0001-new', { today: '2026-11-02' })
    if (!plan.ok) throw new Error(plan.reason)
    await applyChangeSet(fs, plan.changeSet)
    expect(await fs.readText('0001-root.md')).toBe(
      adr('status: superseded', 'superseded-by: [docs/decisions/0001-new]')
    )
    expect(kinds(await openRepository(fs))).toEqual([])
  })
})
