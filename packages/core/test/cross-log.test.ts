import { describe, expect, it } from 'vitest'
import {
  applyChangeSet,
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
    ).toEqual({
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
    ).toEqual({ ok: false, reason: 'There is no ADR docs/adr/0009-gone in this repository.' })
    expect(
      await planEditMetadata(fs, log('docs/decisions'), '0001-b', {
        relations: { 'depends-on': ['docs/decisions/0001-b'] }
      })
    ).toEqual({ ok: false, reason: '0001-b cannot have a Relation to itself.' })
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
