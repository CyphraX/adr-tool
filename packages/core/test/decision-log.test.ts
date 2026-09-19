import { describe, expect, it } from 'vitest'
import { memoryFileSystem, openRepository, type DecisionLog } from '../src'

/** A Decision Log in memory: file name → frontmatter lines. Every ADR gets a title. */
async function log(adrs: Record<string, string[]>): Promise<DecisionLog> {
  const files = Object.fromEntries(
    Object.entries(adrs).map(([name, lines]) => [
      `docs/adr/${name}.md`,
      ['---', ...lines, '---', '', `# ${name}`, ''].join('\n')
    ])
  )
  const repository = await openRepository(memoryFileSystem(files))
  expect(repository.problems).toEqual([])
  return repository.logs[0]!
}

describe('a Decision Log', () => {
  it('lists its ADRs sorted by ID and ignores everything else in the directory', async () => {
    const repository = await openRepository(
      memoryFileSystem({
        'docs/adr/0002-b.md': '# B\n',
        'docs/adr/0001-a.md': '# A\n',
        'docs/adr/README.md': '# Not an ADR\n',
        'docs/adr/template.md': '# Not an ADR either\n',
        'docs/adr/archive/0009-old.md': '# In a subdirectory\n'
      })
    )
    const [only] = repository.logs
    expect(only!.adrs.map((adr) => [adr.id, adr.number, adr.title, adr.path])).toEqual([
      ['0001-a', 1, 'A', 'docs/adr/0001-a.md'],
      ['0002-b', 2, 'B', 'docs/adr/0002-b.md']
    ])
    expect(only!.problems).toEqual([])
  })

  it('reads a date-based log, where ADRs have no number', async () => {
    const { naming, adrs, problems } = await log({
      '20260919-a': [],
      '20260919-b': ['relates-to: [20260919-a]']
    })
    expect(naming).toBe('date')
    expect(adrs.map((adr) => adr.number)).toEqual([undefined, undefined])
    expect(problems).toEqual([])
  })

  it('reports a configured directory that does not exist', async () => {
    const repository = await openRepository(
      memoryFileSystem({ '.adr/config.yml': 'logs:\n  - path: docs/decisions\n' })
    )
    expect(repository.logs).toEqual([])
    expect(repository.problems).toEqual([{ kind: 'missing-log-directory', path: 'docs/decisions' }])
  })
})

describe('Relations', () => {
  it('are in effect once the ADR that carries them has been accepted', async () => {
    const { relations, problems } = await log({
      '0001-old': ['status: superseded', 'superseded-by: [0002-new]'],
      '0002-new': ['status: deprecated', 'supersedes: [0001-old]'],
      '0003-extra': ['status: accepted', 'amends: [0004-base]', 'depends-on: [0002-new]'],
      '0004-base': ['status: accepted', 'amended-by: [0003-extra]']
    })
    expect(problems).toEqual([])
    expect(relations).toEqual([
      { type: 'supersedes', from: '0002-new', to: '0001-old', state: 'in-effect' },
      { type: 'amends', from: '0003-extra', to: '0004-base', state: 'in-effect' },
      { type: 'depends-on', from: '0003-extra', to: '0002-new', state: 'in-effect' }
    ])
  })

  it('are pending while the ADR is proposed, and leave the target alone', async () => {
    const { relations, problems } = await log({
      '0001-old': ['status: accepted'],
      '0002-new': ['status: proposed', 'supersedes: [0001-old]', 'amends: [0001-old]']
    })
    expect(relations.map((relation) => relation.state)).toEqual(['pending', 'pending'])
    expect(problems).toEqual([])
  })

  it('are void when the ADR was rejected', async () => {
    const { relations, problems } = await log({
      '0001-old': ['status: accepted'],
      '0002-new': ['status: rejected', 'decided: 2026-09-19', 'supersedes: [0001-old]']
    })
    expect(relations.map((relation) => relation.state)).toEqual(['void'])
    expect(problems).toEqual([])
  })
})

describe('Problems', () => {
  it('names a Relation to an unknown ADR or to the ADR itself', async () => {
    const { relations, problems } = await log({
      '0001-a': ['depends-on: [0007-missing, 0001-a]', 'amended-by: [0008-missing]']
    })
    expect(relations).toEqual([])
    expect(problems).toEqual([
      { kind: 'unknown-target', adr: '0001-a', key: 'depends-on', target: '0007-missing' },
      { kind: 'self-reference', adr: '0001-a', key: 'depends-on' },
      { kind: 'unknown-target', adr: '0001-a', key: 'amended-by', target: '0008-missing' }
    ])
  })

  it('names what an accepted Supersede has left undone on the old ADR', async () => {
    const { problems } = await log({
      '0001-old': ['status: accepted'],
      '0002-new': ['status: accepted', 'supersedes: [0001-old]']
    })
    expect(problems).toEqual([
      { kind: 'missing-back-reference', adr: '0001-old', key: 'superseded-by', source: '0002-new' },
      { kind: 'not-marked-superseded', adr: '0001-old', source: '0002-new' }
    ])
  })

  it('names a missing Back-reference of an Amend, which does not touch the Status', async () => {
    const { problems } = await log({
      '0001-base': ['status: accepted'],
      '0002-extra': ['status: accepted', 'amends: [0001-base]']
    })
    expect(problems).toEqual([
      { kind: 'missing-back-reference', adr: '0001-base', key: 'amended-by', source: '0002-extra' }
    ])
  })

  it('names a Back-reference and a superseded Status that nothing stands behind', async () => {
    const { problems } = await log({
      '0001-old': ['status: superseded', 'superseded-by: [0002-new]', 'amended-by: [0003-other]'],
      '0002-new': ['status: proposed', 'supersedes: [0001-old]'],
      '0003-other': ['status: accepted']
    })
    expect(problems).toEqual([
      {
        kind: 'unfounded-back-reference',
        adr: '0001-old',
        key: 'superseded-by',
        source: '0002-new'
      },
      {
        kind: 'unfounded-back-reference',
        adr: '0001-old',
        key: 'amended-by',
        source: '0003-other'
      },
      { kind: 'superseded-without-successor', adr: '0001-old' }
    ])
  })

  it('names ADRs that supersede each other in a circle', async () => {
    const { problems } = await log({
      '0001-a': ['status: proposed', 'supersedes: [0003-c]'],
      '0002-b': ['status: proposed', 'supersedes: [0001-a]'],
      '0003-c': ['status: proposed', 'supersedes: [0002-b]'],
      '0004-d': ['status: proposed', 'supersedes: [0001-a]']
    })
    expect(problems).toEqual([{ kind: 'supersedes-cycle', adrs: ['0001-a', '0002-b', '0003-c'] }])
  })

  it('names ADRs that share a number', async () => {
    const { problems } = await log({ '0007-caching': [], '0007-logging': [], '0008-other': [] })
    expect(problems).toEqual([
      { kind: 'duplicate-number', number: 7, adrs: ['0007-caching', '0007-logging'] }
    ])
  })

  it('collects the Problems of single files too', async () => {
    const { problems, adrs } = await log({ '0001-a': ['status: on hold'] })
    expect(adrs[0]!.metadata.rawStatus).toBe('on hold')
    expect(problems).toMatchObject([{ kind: 'invalid-metadata', adr: '0001-a', key: 'status' }])
  })
})
