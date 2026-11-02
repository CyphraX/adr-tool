import { describe, expect, it } from 'vitest'
import {
  applyChangeSet,
  memoryFileSystem,
  openRepository,
  planMigration,
  type DecisionLog
} from '../src'

// docs/file-format.md, section 8, "MADR 2 and log4brains"; docs/plan-roadmap.md, part 5.

const inLog = (files: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(files).map(([name, text]) => [`docs/adr/${name}.md`, text]))

async function open(files: Record<string, string>) {
  const fs = memoryFileSystem(inLog(files))
  const log = (await openRepository(fs)).logs[0]!
  return { fs, log }
}

const lines = (...all: string[]): string => all.join('\n')

/** What one ADR of the log says, in a form that is easy to compare. */
function said(log: DecisionLog, id: string) {
  const adr = log.adrs.find((one) => one.id === id)!
  const { metadata } = adr
  const relations = Object.fromEntries(
    Object.entries({ ...metadata.relations, ...metadata.backReferences }).filter(
      ([, items]) => items.length > 0
    )
  )
  return {
    foreign: adr.foreign,
    signs: adr.foreignSigns,
    status: metadata.status ?? metadata.rawStatus,
    decisionMakers: metadata.decisionMakers,
    tags: metadata.tags,
    relations
  }
}

const madr2 = lines(
  '# Use PostgreSQL',
  '',
  '* Status: accepted <!-- optional -->',
  '* Deciders: Kim Becker, Alex Roth',
  '* Date: 2020-05-04',
  '',
  'Technical Story: DB-7',
  '',
  '## Context and Problem Statement',
  '',
  'We need a database.',
  '',
  '## Links',
  '',
  '* Supersedes [ADR-0001](0001-sqlite.md)',
  '* Refined by [ADR-0004](0004-replica.md)',
  ''
)

const log4brains = lines(
  '# Use a read replica',
  '',
  '- Status: draft',
  '- Deciders: Sam Lee',
  '- Date: 2021-02-03',
  '- Tags: reporting, database api',
  '',
  '## Context and Problem Statement',
  '',
  'Reports are slow.',
  '',
  '## Links',
  '',
  '- Amends [20200504-use-postgresql](20200504-use-postgresql.md)',
  ''
)

describe('a file of MADR 2 or log4brains', () => {
  it('is read from the list under its title and from its Links section', async () => {
    const { log } = await open({
      '0001-sqlite': lines(
        '# SQLite',
        '',
        '* Status: superseded by [ADR-0002](0002-postgres.md)',
        ''
      ),
      '0002-postgres': madr2,
      '0004-replica': log4brains
    })
    expect(said(log, '0002-postgres')).toEqual({
      foreign: 'madr-2',
      signs: ['listed'],
      status: 'accepted',
      // One value: the tool does not split what a person wrote.
      decisionMakers: ['Kim Becker, Alex Roth'],
      tags: [],
      relations: { supersedes: ['0001-sqlite'], 'relates-to': ['0004-replica'] }
    })
    expect(said(log, '0004-replica')).toMatchObject({
      foreign: 'madr-2',
      // log4brains' draft: the tool has no state before proposed.
      status: 'proposed',
      decisionMakers: ['Sam Lee'],
      // Split at commas and spaces, as log4brains splits them.
      tags: ['reporting', 'database', 'api'],
      relations: { amends: ['20200504-use-postgresql'] }
    })
    expect(said(log, '0001-sqlite')).toMatchObject({
      status: 'superseded',
      relations: { 'superseded-by': ['0002-postgres'] }
    })
    // Superseded on both sides, as the Status and the Links section say: no Problem.
    expect(log.problems.map((problem) => problem.kind)).toEqual(['unknown-target'])
    expect(log.relations).toContainEqual({
      type: 'supersedes',
      from: '0002-postgres',
      to: '0001-sqlite',
      state: 'in-effect'
    })
  })

  it('is recognized by its Deciders too, and is accepted without a Status', async () => {
    const { log } = await open({
      '0001-a': lines('# A', '', '* Deciders: Kim', '* Date: 2020-01-01', ''),
      '0002-b': lines('# B', '', '* Date: 2020-01-01', '* Tags: x', '')
    })
    expect(said(log, '0001-a')).toMatchObject({
      foreign: 'madr-2',
      status: 'accepted',
      decisionMakers: ['Kim']
    })
    // Neither a Status nor Deciders: a file of the tool's own format, which says nothing.
    expect(said(log, '0002-b')).toMatchObject({ foreign: undefined, tags: [] })
  })

  it('leaves the template’s placeholders and what the frontmatter says already', async () => {
    const { log } = await open({
      '0001-a': lines(
        '# A',
        '',
        '* Status: [proposed | rejected | accepted | deprecated | … | superseded by [ADR-0005](0005-example.md)] <!-- optional -->',
        '* Deciders: [list everyone involved in the decision] <!-- optional -->',
        '* Tags: [comma separated]',
        ''
      ),
      '0002-b': lines(
        '---',
        'decision-makers: [Ann]',
        'tags: [kept]',
        '---',
        '',
        '# B',
        '',
        '* Status: rejected',
        '* Deciders: Bob',
        '* Tags: other',
        ''
      )
    })
    expect(said(log, '0001-a')).toMatchObject({
      foreign: 'madr-2',
      status: expect.stringMatching(/^\[proposed \| rejected/),
      decisionMakers: [],
      tags: []
    })
    expect(log.problems.map((problem) => [problem.kind, 'adr' in problem && problem.adr])).toEqual([
      ['invalid-metadata', '0001-a']
    ])
    expect(said(log, '0002-b')).toMatchObject({
      foreign: 'madr-2',
      status: 'rejected',
      decisionMakers: ['Ann'],
      tags: ['kept']
    })
  })

  it('reads a link with other words, and only a link to an ADR, from the Links section', async () => {
    const { log } = await open({
      '0001-a': lines(
        '# A',
        '',
        '* Status: accepted',
        '',
        '## Links',
        '',
        '* Superseded by [B](0002-b.md)',
        '* Clarified by [C](0003-c.md)',
        '* See [the wiki](https://example.com/wiki.md)',
        '* Some words',
        '',
        '### More',
        ''
      ),
      '0002-b': lines(
        '# B',
        '',
        '* Status: accepted',
        '',
        '## Links',
        '',
        '- supersedes: [A](./0001-a.md)',
        ''
      ),
      '0003-c': lines('# C', '', '* Status: accepted', '')
    })
    expect(said(log, '0001-a').relations).toEqual({
      'relates-to': ['0003-c'],
      'superseded-by': ['0002-b']
    })
    expect(said(log, '0001-a').status).toBe('accepted')
    expect(said(log, '0002-b').relations).toEqual({ supersedes: ['0001-a'] })
  })

  it('is not read so with a status key, or with a Status section and no frontmatter', async () => {
    const { log } = await open({
      '0001-a': lines('---', 'status: proposed', '---', '', '# A', '', '* Status: rejected', ''),
      '0002-b': lines('# B', '', '* Status: rejected', '', '## Status', '', 'Deprecated', '')
    })
    expect(said(log, '0001-a')).toMatchObject({ foreign: undefined, status: 'proposed' })
    expect(said(log, '0002-b')).toMatchObject({ foreign: 'adr-tools', status: 'deprecated' })
  })
})

describe('a file of adr-tools with a link of other words', () => {
  it('relates to the ADR the link names', async () => {
    const { log } = await open({
      '0001-a': lines(
        '# 1. A',
        '',
        '## Status',
        '',
        'Accepted',
        '',
        'Clarifies [2. B](0002-b.md)',
        'Supersedes [3. C](0003-c.md)',
        ''
      ),
      '0002-b': lines(
        '# 2. B',
        '',
        '## Status',
        '',
        'Accepted',
        '',
        'Clarified by [1. A](0001-a.md)',
        ''
      ),
      '0003-c': lines('# 3. C', '', '## Status', '', 'Superseded by [1. A](0001-a.md)', '')
    })
    expect(said(log, '0001-a')).toMatchObject({
      foreign: 'adr-tools',
      signs: ['status-section'],
      relations: { supersedes: ['0003-c'], 'relates-to': ['0002-b'] }
    })
    expect(said(log, '0002-b').relations).toEqual({ 'relates-to': ['0001-a'] })
    expect(log.problems).toEqual([])
  })
})

describe('the signs a foreign file is read by', () => {
  it('are the ones that applied', async () => {
    const madr = (...keys: string[]): string => lines('---', ...keys, '---', '', '# T', '')
    const { log } = await open({
      '0001-a': madr('status: superseded by ADR-0002'),
      '0002-b': madr('status: accepted', 'deciders: [Kim]'),
      '0003-c': madr('status: superseded by ADR-0002', 'deciders: Kim')
    })
    expect(log.adrs.map((adr) => adr.foreignSigns)).toEqual([
      ['successor-in-status'],
      ['deciders'],
      ['successor-in-status', 'deciders']
    ])
  })
})

describe('Migration of a file of MADR 2 or log4brains', () => {
  it('writes the Metadata into a frontmatter and takes out of the text what it holds', async () => {
    const { fs, log } = await open({
      '0001-sqlite': lines(
        '# SQLite',
        '',
        '* Status: superseded by [ADR-0002](0002-postgres.md)',
        ''
      ),
      '0002-postgres': madr2,
      '0004-replica': log4brains
    })
    const plan = await planMigration(fs, log)
    if (!plan.ok) throw new Error(plan.reason)
    expect(plan.warnings).toEqual([
      'The Links section of 0002-postgres stays in its text: the Metadata does not hold "Refined by [ADR-0004](0004-replica.md)".'
    ])
    await applyChangeSet(fs, plan.changeSet)

    expect(await fs.readText('docs/adr/0001-sqlite.md')).toBe(
      lines(
        '---',
        'status: superseded',
        'superseded-by: [0002-postgres]',
        '---',
        '',
        '# SQLite',
        ''
      )
    )
    expect(await fs.readText('docs/adr/0002-postgres.md')).toBe(
      lines(
        '---',
        'status: accepted',
        'decision-makers: "Kim Becker, Alex Roth"',
        'supersedes: [0001-sqlite]',
        'relates-to: [0004-replica]',
        '---',
        '',
        '# Use PostgreSQL',
        '',
        '* Date: 2020-05-04',
        '',
        'Technical Story: DB-7',
        '',
        '## Context and Problem Statement',
        '',
        'We need a database.',
        '',
        '## Links',
        '',
        '* Supersedes [ADR-0001](0001-sqlite.md)',
        '* Refined by [ADR-0004](0004-replica.md)',
        ''
      )
    )
    expect(await fs.readText('docs/adr/0004-replica.md')).toBe(
      lines(
        '---',
        'status: proposed',
        'decision-makers: Sam Lee',
        'tags: [reporting, database, api]',
        'amends: [20200504-use-postgresql]',
        '---',
        '',
        '# Use a read replica',
        '',
        '- Date: 2021-02-03',
        '',
        '## Context and Problem Statement',
        '',
        'Reports are slow.',
        ''
      )
    )
  })

  it('takes the list out as a whole, with the blank line after it, when nothing is left', async () => {
    const { fs, log } = await open({
      '0001-a': lines(
        '# A',
        '',
        '* Status: Rejected',
        '* Deciders: Kim',
        '',
        '## Context',
        '',
        'Text.',
        ''
      ),
      '0002-b': lines(
        '---',
        'nav_order: 2',
        '---',
        '',
        '# B',
        '',
        '- Status: on hold',
        '- Tags: x',
        ''
      )
    })
    const plan = await planMigration(fs, log)
    if (!plan.ok) throw new Error(plan.reason)
    expect(plan.warnings).toEqual([
      'The Status of 0002-b stays in the list under its title: the tool does not know "on hold".'
    ])
    await applyChangeSet(fs, plan.changeSet)
    expect(await fs.readText('docs/adr/0001-a.md')).toBe(
      lines(
        '---',
        'status: rejected',
        'decision-makers: Kim',
        '---',
        '',
        '# A',
        '',
        '## Context',
        '',
        'Text.',
        ''
      )
    )
    expect(await fs.readText('docs/adr/0002-b.md')).toBe(
      lines(
        '---',
        // The writer puts the keys of the tool in front of the foreign ones.
        'status: on hold',
        'tags: [x]',
        'nav_order: 2',
        '---',
        '',
        '# B',
        '',
        '- Status: on hold',
        ''
      )
    )
    const after = (await openRepository(fs)).logs[0]!
    expect(after.adrs.map((adr) => adr.foreign)).toEqual([undefined, undefined])
    expect(said(after, '0002-b')).toMatchObject({ status: 'on hold', tags: ['x'] })
  })
})

describe('Migration of a file of adr-tools with a link of other words', () => {
  it('writes the Relation, and names everything that keeps the Status section', async () => {
    const { fs, log } = await open({
      '0001-a': lines(
        '# 1. A',
        '',
        '## Status',
        '',
        'Proposed',
        '',
        'Clarifies [2. B](0002-b.md)',
        'Superseded by [2. B](0002-b.md)',
        ''
      ),
      '0002-b': lines(
        '# 2. B',
        '',
        '## Status',
        '',
        'Accepted',
        '',
        'Supersedes [1. A](0001-a.md)',
        ''
      )
    })
    const plan = await planMigration(fs, log, '0001-a')
    if (!plan.ok) throw new Error(plan.reason)
    expect(plan.warnings).toEqual([
      'The Status section of 0001-a stays in its text: the Metadata does not hold "Proposed", "Clarifies [2. B](0002-b.md)".'
    ])
    await applyChangeSet(fs, plan.changeSet)
    expect(await fs.readText('docs/adr/0001-a.md')).toMatch(
      /^---\nstatus: superseded\nrelates-to: \[0002-b\]\nsuperseded-by: \[0002-b\]\n---\n/
    )
  })
})
