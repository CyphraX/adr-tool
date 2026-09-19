import { describe, expect, it } from 'vitest'
import {
  applyChangeSet,
  memoryFileSystem,
  openRepository,
  planEditMetadata,
  type MetadataEdit,
  type Plan
} from '../src'
import { fixture, fixtureNames, lines } from './fixtures'

/** A Decision Log in memory: file name → the whole file text. */
async function repository(adrs: Record<string, string>) {
  const fs = memoryFileSystem(
    Object.fromEntries(Object.entries(adrs).map(([name, text]) => [`docs/adr/${name}.md`, text]))
  )
  const log = (await openRepository(fs)).logs[0]!
  return { fs, log }
}

const adr = (...frontmatter: string[]) =>
  ['---', ...frontmatter, '---', '', '# Title', ''].join('\n')

/** Which lines the one file of a plan loses and gains. */
function changes(plan: Plan): { removed: string[]; added: string[] } {
  if (!plan.ok) throw new Error(plan.reason)
  expect(plan.changeSet.files).toHaveLength(1)
  const file = plan.changeSet.files[0]!
  const [old, now] = [lines(file.before), lines(file.after)]
  return {
    removed: old.filter((line) => !now.includes(line)),
    added: now.filter((line) => !old.includes(line))
  }
}

describe('editing the Metadata a person maintains', () => {
  const files = {
    '0001-a': adr('status: accepted'),
    '0002-b': adr('status: deprecated'),
    '0003-c': adr(
      'status: proposed',
      'created: 2026-09-01',
      'decision-makers:',
      '  - Kim Becker   # lead',
      '  - Alex Roth',
      'tags: [persistence, api]',
      'nav_order: 3'
    )
  }

  it('adds and removes single items, one line each, and touches nothing else', async () => {
    const { fs, log } = await repository(files)
    const edit = (change: MetadataEdit) => planEditMetadata(fs, log, '0003-c', change)

    expect(changes(await edit({ tags: ['persistence', 'api', 'Reporting '] }))).toEqual({
      removed: ['tags: [persistence, api]\n'],
      added: ['tags: [persistence, api, Reporting]\n']
    })
    expect(changes(await edit({ tags: ['api'] }))).toEqual({
      removed: ['tags: [persistence, api]\n'],
      added: ['tags: [api]\n']
    })
    expect(changes(await edit({ decisionMakers: ['Kim Becker'] }))).toEqual({
      removed: ['  - Alex Roth\n'],
      added: []
    })
    expect(changes(await edit({ decisionMakers: ['Kim Becker', 'Alex Roth', 'Sam Lee'] }))).toEqual(
      { removed: [], added: ['  - Sam Lee\n'] }
    )
    expect(changes(await edit({ relations: { 'depends-on': ['0001-a'] } }))).toEqual({
      removed: [],
      added: ['depends-on: [0001-a]\n']
    })
  })

  it('writes several changes as one change set, new keys in their canonical place', async () => {
    const { fs, log } = await repository(files)
    const plan = await planEditMetadata(fs, log, '0003-c', {
      decisionMakers: ['Alex Roth'],
      tags: [],
      relations: { supersedes: ['0002-b'], amends: ['0001-a'], 'relates-to': ['0001-a', '0002-b'] }
    })
    if (!plan.ok) throw new Error(plan.reason)
    expect(plan.changeSet.files[0]!.after).toBe(
      adr(
        'status: proposed',
        'created: 2026-09-01',
        'decision-makers:',
        '  - Alex Roth',
        'supersedes: [0002-b]',
        'amends: [0001-a]',
        'relates-to: [0001-a, 0002-b]',
        'nav_order: 3'
      )
    )
    await applyChangeSet(fs, plan.changeSet)
    const after = (await openRepository(fs)).logs[0]!
    expect(after.problems).toEqual([])
    expect(
      after.relations.map((relation) => `${relation.type} ${relation.to} ${relation.state}`)
    ).toEqual([
      'supersedes 0002-b pending',
      'amends 0001-a pending',
      'relates-to 0001-a pending',
      'relates-to 0002-b pending'
    ])
  })

  it('plans nothing when the lists are as they should be, in whatever order', async () => {
    const { fs, log } = await repository(files)
    const plan = await planEditMetadata(fs, log, '0003-c', {
      decisionMakers: ['Alex Roth', 'Kim Becker'],
      tags: ['api', 'persistence', 'api'],
      relations: { 'depends-on': [] }
    })
    expect(plan).toEqual({ ok: true, changeSet: { files: [] } })
  })

  it('gives a file without frontmatter its first Metadata', async () => {
    const { fs, log } = await repository({ '0001-a': '# Title\n', '0002-b': '# Other\n' })
    const plan = await planEditMetadata(fs, log, '0001-a', {
      tags: ['api'],
      relations: { 'relates-to': ['0002-b'] }
    })
    expect(plan.ok && plan.changeSet.files[0]!.after).toBe(
      '---\ntags: [api]\nrelates-to: [0002-b]\n---\n# Title\n'
    )
  })

  it('lets tags, decision-makers, depends-on and relates-to change at any Status', async () => {
    const { fs, log } = await repository({
      '0001-a': adr('status: superseded', 'superseded-by: [0002-b]'),
      '0002-b': adr('status: accepted', 'supersedes: [0001-a]'),
      '0003-c': adr('status: rejected')
    })
    for (const id of ['0001-a', '0002-b', '0003-c']) {
      const others = ['0001-a', '0002-b', '0003-c'].filter((candidate) => candidate !== id)
      const plan = await planEditMetadata(fs, log, id, {
        decisionMakers: ['Kim Becker'],
        tags: ['api'],
        relations: { 'depends-on': [others[0]!], 'relates-to': [others[1]!] }
      })
      expect(changes(plan).added).toHaveLength(4)
      expect(changes(plan).removed).toEqual([])
    }
  })

  it('does not record a Correction', async () => {
    const { fs, log } = await repository({ '0001-a': adr('status: accepted') })
    const plan = await planEditMetadata(fs, log, '0001-a', { tags: ['api'] })
    expect(changes(plan)).toEqual({ removed: [], added: ['tags: [api]\n'] })
  })
})

describe('what an ADR supersedes or amends', () => {
  it('is fixed once the ADR is no longer proposed', async () => {
    const { fs, log } = await repository({
      '0001-a': adr('status: superseded', 'superseded-by: [0002-b]'),
      '0002-b': adr('status: accepted', 'supersedes: [0001-a]'),
      '0003-c': adr('status: accepted'),
      '0004-d': adr('status: on hold')
    })
    const reason = async (id: string, relations: MetadataEdit['relations']) => {
      const plan = await planEditMetadata(fs, log, id, { relations })
      return plan.ok ? 'planned' : plan.reason
    }
    const fixed = 'What an ADR supersedes or amends is fixed once it is no longer proposed.'
    expect(await reason('0002-b', { supersedes: [] })).toBe(`${fixed} 0002-b is accepted.`)
    expect(await reason('0002-b', { amends: ['0003-c'] })).toBe(`${fixed} 0002-b is accepted.`)
    expect(await reason('0004-d', { amends: ['0003-c'] })).toBe(`${fixed} 0004-d is "on hold".`)
    // Handing over what is already there changes nothing, and is not refused.
    expect(await reason('0002-b', { supersedes: ['0001-a'], 'relates-to': ['0003-c'] })).toBe(
      'planned'
    )
  })

  it('can only name an ADR that may be superseded or amended', async () => {
    const { fs, log } = await repository({
      '0001-accepted': adr('status: accepted'),
      '0002-deprecated': adr('status: deprecated'),
      '0003-proposed': adr('status: proposed'),
      '0004-new': adr('status: proposed')
    })
    const reason = async (relations: MetadataEdit['relations']) => {
      const plan = await planEditMetadata(fs, log, '0004-new', { relations })
      return plan.ok ? 'planned' : plan.reason
    }
    expect(await reason({ supersedes: ['0001-accepted', '0002-deprecated'] })).toBe('planned')
    expect(await reason({ supersedes: ['0003-proposed'] })).toBe(
      'Only an accepted or deprecated ADR can be superseded. 0003-proposed is proposed.'
    )
    expect(await reason({ amends: ['0002-deprecated'] })).toBe(
      'Only an accepted ADR can be amended. 0002-deprecated is deprecated.'
    )
  })
})

describe('an item that is added', () => {
  it('must be another ADR of the same Decision Log', async () => {
    const { fs, log } = await repository({ '0001-a': adr('status: proposed'), '0002-b': adr() })
    const reason = async (relations: MetadataEdit['relations']) => {
      const plan = await planEditMetadata(fs, log, '0001-a', { relations })
      return plan.ok ? 'planned' : plan.reason
    }
    for (const type of ['supersedes', 'amends', 'depends-on', 'relates-to'] as const) {
      expect(await reason({ [type]: ['0001-a'] })).toBe('0001-a cannot have a Relation to itself.')
      expect(await reason({ [type]: ['0404-missing'] })).toBe(
        'There is no ADR 0404-missing in this Decision Log.'
      )
    }
    expect(await planEditMetadata(fs, log, '0404-missing', { tags: ['a'] })).toEqual({
      ok: false,
      reason: 'There is no ADR 0404-missing in this Decision Log.'
    })
  })

  it('must be one line of text', async () => {
    const { fs, log } = await repository({ '0001-a': adr('status: proposed') })
    expect(await planEditMetadata(fs, log, '0001-a', { tags: ['  '] })).toEqual({
      ok: false,
      reason: 'A tag is one line of text and cannot be empty.'
    })
    expect(await planEditMetadata(fs, log, '0001-a', { decisionMakers: ['Kim\nBecker'] })).toEqual({
      ok: false,
      reason: 'A decision-maker is one line of text and cannot be empty.'
    })
  })

  it('is quoted when YAML would read it as something else', async () => {
    const { fs, log } = await repository({ '0001-a': adr('status: proposed') })
    const plan = await planEditMetadata(fs, log, '0001-a', {
      tags: ['2024', 'c#', 'yes', 'a: b', 'x, y']
    })
    expect(changes(plan).added).toEqual(['tags: ["2024", c#, "yes", "a: b", "x, y"]\n'])
    if (!plan.ok) throw new Error(plan.reason)
    await applyChangeSet(fs, plan.changeSet)
    expect((await openRepository(fs)).logs[0]!.adrs[0]!.metadata.tags).toEqual([
      '2024',
      'c#',
      'yes',
      'a: b',
      'x, y'
    ])
  })
})

describe('an item that is already there', () => {
  it('can be removed although it is not valid: a broken Relation is repaired that way', async () => {
    const fs = memoryFileSystem(
      Object.fromEntries(
        fixtureNames('showcase/docs/adr').map((name) => [
          `docs/adr/${name}`,
          fixture(`showcase/docs/adr/${name}`)
        ])
      )
    )
    const log = (await openRepository(fs)).logs[0]!
    expect(log.problems.map((problem) => problem.kind)).toEqual(['unknown-target'])

    const broken = log.adrs.find((candidate) => candidate.id === '0007-read-replica-for-reports')!
    const plan = await planEditMetadata(fs, log, broken.id, {
      relations: { 'depends-on': ['0004-postgres-for-the-write-model'] }
    })
    expect(changes(plan)).toEqual({
      removed: ['depends-on: [0004-postgres-for-the-write-model, 0011-reporting-api]\n'],
      added: ['depends-on: [0004-postgres-for-the-write-model]\n']
    })
    if (!plan.ok) throw new Error(plan.reason)
    await applyChangeSet(fs, plan.changeSet)
    expect((await openRepository(fs)).logs[0]!.problems).toEqual([])
  })

  it('stays when it is not valid and nobody asks to remove it', async () => {
    const { fs, log } = await repository({
      '0001-a': adr('status: proposed', 'depends-on: [0404-missing]'),
      '0002-b': adr()
    })
    const plan = await planEditMetadata(fs, log, '0001-a', {
      relations: { 'depends-on': ['0404-missing', '0002-b'] }
    })
    expect(changes(plan).added).toEqual(['depends-on: [0404-missing, 0002-b]\n'])
  })

  it('cannot be written around frontmatter that cannot be read', async () => {
    const { fs, log } = await repository({ '0001-a': '---\nstatus: [\n---\n# T\n' })
    expect(await planEditMetadata(fs, log, '0001-a', { tags: ['a'] })).toEqual({
      ok: false,
      reason: 'The frontmatter of 0001-a cannot be read. Fix it before the tool writes to it.'
    })
  })

  it('is refused with the reason when the list is written in a way the tool cannot edit', async () => {
    const { fs, log } = await repository({
      '0001-a': '---\ntags: [\n  a, # first\n  b\n]\n---\n# T\n'
    })
    expect(await planEditMetadata(fs, log, '0001-a', { tags: ['b'] })).toEqual({
      ok: false,
      reason:
        '"tags" is written in a way the tool cannot take an item out of. Remove "a" in an editor.'
    })
  })
})
