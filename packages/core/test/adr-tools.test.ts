import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  memoryFileSystem,
  openRepository,
  planAccept,
  planCreate,
  planDeprecate,
  planEditBody,
  planEditMetadata,
  planReject,
  planRenumber,
  planRepair,
  repairsOf,
  type DecisionLog
} from '../src'
import { nodeFileSystem } from './node-file-system'

const root = fileURLToPath(new URL('./fixtures/adr-tools/', import.meta.url))

/** A file as adr-tools writes it: the lines of its Status section, and what comes after it. */
const adrTools = (title: string, status: string[], rest: string[] = []): string =>
  [`# ${title}`, '', 'Date: 2020-01-02', '', '## Status', '', ...status, '', ...rest, ''].join('\n')

async function logOf(files: Record<string, string>): Promise<DecisionLog> {
  const repository = await openRepository(
    memoryFileSystem(
      Object.fromEntries(Object.entries(files).map(([name, text]) => [`doc/adr/${name}.md`, text]))
    )
  )
  return repository.logs[0]!
}

describe('a repository written with adr-tools', () => {
  it('opens as its files say, and is found through .adr-dir', async () => {
    const repository = await openRepository(nodeFileSystem(root))
    expect(repository.discoveredBy).toBe('adr-dir')
    expect(repository.problems).toEqual([])

    const [log] = repository.logs
    expect(log!.path).toBe('doc/adr')
    expect(log!.naming).toBe('sequential')
    expect(
      log!.adrs.map(({ id, foreign, title, metadata }) => [
        id.slice(0, 4),
        foreign,
        metadata.status ?? metadata.rawStatus,
        metadata.created,
        title
      ])
    ).toEqual([
      ['0001', 'adr-tools', 'accepted', '2016-02-12', 'Record architecture decisions'],
      ['0002', 'adr-tools', 'superseded', '2016-03-01', 'Deploy to one region'],
      ['0003', 'adr-tools', 'accepted', '2017-06-20', 'Deploy to two regions'],
      // "Proposed" by hand, then superseded through adr-tools: the link line wins.
      ['0004', 'adr-tools', 'superseded', '2017-07-02', 'Queue between the services'],
      ['0005', 'adr-tools', 'accepted', '2017-09-11', 'Review decisions every quarter'],
      ['0006', 'adr-tools', 'accepted', '2018-01-15', 'Events between the services'],
      [
        '0007',
        'adr-tools',
        'On hold until the partner programme starts',
        '2018-04-03',
        'GraphQL for partners'
      ],
      // No Status text reads as accepted; "last spring" is no date.
      ['0008', 'adr-tools', 'accepted', undefined, 'Feature flags'],
      ['0009', undefined, 'accepted', undefined, 'Use UTC everywhere']
    ])
  })

  it('has the Relations and Back-references of its link lines, and no Problem of its format', async () => {
    const log = (await openRepository(nodeFileSystem(root))).logs[0]!
    expect(log.relations).toEqual([
      {
        type: 'supersedes',
        from: '0003-deploy-to-two-regions',
        to: '0002-deploy-to-one-region',
        state: 'in-effect'
      },
      {
        type: 'amends',
        from: '0005-review-decisions-every-quarter',
        to: '0001-record-architecture-decisions',
        state: 'in-effect'
      },
      {
        type: 'supersedes',
        from: '0006-events-between-the-services',
        to: '0004-queue-between-the-services',
        state: 'in-effect'
      }
    ])
    const backReferences = Object.fromEntries(
      log.adrs.map((adr) => [adr.id.slice(0, 4), adr.metadata.backReferences])
    )
    expect(backReferences['0001']).toEqual({
      'superseded-by': [],
      'amended-by': ['0005-review-decisions-every-quarter']
    })
    expect(backReferences['0002']!['superseded-by']).toEqual(['0003-deploy-to-two-regions'])
    expect(backReferences['0004']!['superseded-by']).toEqual(['0006-events-between-the-services'])

    // A Status the tool does not know is a Problem in every format. "Accepted" is not.
    expect(log.problems).toEqual([
      {
        kind: 'invalid-metadata',
        adr: '0007-graphql-for-partners',
        key: 'status',
        detail: expect.stringContaining('"On hold until the partner programme starts"')
      }
    ])
    // A link that leads out of the directory names no ADR.
    expect(log.adrs[7]!.metadata.relations.supersedes).toEqual([])
  })

  it('keeps every body as it is in the file', async () => {
    const log = (await openRepository(nodeFileSystem(root))).logs[0]!
    expect(log.adrs[4]!.eol).toBe('\r\n')
    expect(log.adrs[4]!.body.startsWith('# 5. Review decisions every quarter\r\n')).toBe(true)
    expect(log.adrs[0]!.metadata.present).toEqual([])
  })
})

describe('recognizing a file of adr-tools', () => {
  it('takes a Status section for what it is only in a file without frontmatter', async () => {
    const log = await logOf({
      '0001-a': adrTools('1. A', ['Rejected']),
      '0002-b': ['---', 'tags: [x]', '---', '', adrTools('2. B', ['Rejected'])].join('\n')
    })
    expect(log.adrs.map((adr) => [adr.foreign, adr.metadata.status])).toEqual([
      ['adr-tools', 'rejected'],
      [undefined, 'accepted']
    ])
    expect(log.problems).toEqual([])
  })

  it('does not mistake other headings, or code, for a Status section', async () => {
    const log = await logOf({
      '0001-a': ['# A', '', '### Status', '', 'Rejected', ''].join('\n'),
      '0002-b': ['# B', '', '```', '## Status', '', 'Rejected', '```', ''].join('\n'),
      '0003-c': ['# C', '', '## Status quo', '', 'Rejected', ''].join('\n'),
      '0004-d': ['# D', '', '##   STATUS  ##', 'Deprecated', '## Context', 'Rejected', ''].join(
        '\n'
      )
    })
    expect(log.adrs.map((adr) => [adr.foreign, adr.metadata.status])).toEqual([
      [undefined, 'accepted'],
      [undefined, 'accepted'],
      [undefined, 'accepted'],
      ['adr-tools', 'deprecated']
    ])
  })

  it('reads the words of a link line in any case, and both spellings', async () => {
    const log = await logOf({
      '0001-a': adrTools('1. A', ['SUPERSEDED BY [2. B](0002-b.md)']),
      '0002-b': adrTools('2. B', ['accepted', 'supercedes [1. A](0001-a.md)  '])
    })
    expect(log.adrs[0]!.metadata.status).toBe('superseded')
    expect(log.relations).toMatchObject([{ type: 'supersedes', from: '0002-b', to: '0001-a' }])
    expect(log.problems).toEqual([])
  })

  it('shows Status text of several lines as it is written', async () => {
    const log = await logOf({
      '0001-a': adrTools('1. A', ['Accepted', '', 'Reviewed in March'])
    })
    expect(log.adrs[0]!.metadata).toMatchObject({
      status: undefined,
      rawStatus: 'Accepted Reviewed in March'
    })
  })

  it('ends the Status section at the next heading, of any level', async () => {
    const log = await logOf({
      '0001-a': ['# A', '## Status', 'Rejected', '### Note', 'Reviewed in March', ''].join('\n'),
      '0002-b': ['## Status', 'Deprecated', '# B', 'Rejected', ''].join('\n')
    })
    expect(log.adrs.map((adr) => adr.metadata.status)).toEqual(['rejected', 'deprecated'])
    expect(log.problems).toEqual([])
  })

  it('takes a target for an ADR only when it is a file name next to this one', async () => {
    const targets = [
      'https://example.org/0002-b.md',
      '0002-b.md#decision',
      'sub/0002-b.md',
      '0002-b.markdown'
    ]
    const log = await logOf({
      '0001-a': adrTools(
        '1. A',
        targets.map((target) => `Supersedes [2. B](${target})`)
      ),
      '0002-b': '# B\n'
    })
    expect(log.relations).toEqual([])
    expect(log.adrs[0]!.metadata.status).toBe('accepted')
  })

  it('reads a label with brackets, and shows a line with two links as the text it is', async () => {
    const log = await logOf({
      '0001-a': adrTools('1. A', ['Accepted', 'Amends [2. Use [x] (and y)](0002-b.md)']),
      '0002-b': adrTools('2. B', ['Supersedes [1. A](0001-a.md) [3. C](0003-c.md)']),
      '0003-c': '# C\n'
    })
    expect(log.adrs[0]!.metadata.relations.amends).toEqual(['0002-b'])
    expect(log.adrs[1]!.metadata).toMatchObject({
      rawStatus: 'Supersedes [1. A](0001-a.md) [3. C](0003-c.md)',
      relations: { supersedes: [] }
    })
  })

  it('lets a "superseded by" line win over Status text it does not know', async () => {
    const log = await logOf({
      '0001-a': adrTools('1. A', ['Retired', 'Superceded by: [2. B](0002-b.md)']),
      '0002-b': adrTools('2. B', ['Accepted', 'Supercedes [1. A](0001-a.md)'])
    })
    expect(log.adrs[0]!.metadata).toMatchObject({ status: 'superseded' })
    expect(log.adrs[0]!.metadata.rawStatus).toBeUndefined()
    expect(log.problems).toEqual([])
  })

  it('takes the date from the top of the file only, and only a date', async () => {
    const log = await logOf({
      '0001-a': ['# A', '', '## Context', '', 'Date: 2020-01-02', '', '## Status', ''].join('\n'),
      '0002-b': ['# B', 'Date: 2020-02-30', 'Date: 2020-03-01', '## Status', ''].join('\n'),
      '0003-c': [
        '﻿# C',
        'Date: 2020-03-01',
        '~~~',
        '## Status',
        '~~~',
        '## status',
        'rejected'
      ].join('\r\n')
    })
    expect(log.adrs.map((adr) => [adr.metadata.created, adr.metadata.status])).toEqual([
      [undefined, 'accepted'],
      [undefined, 'accepted'],
      ['2020-03-01', 'rejected']
    ])
  })

  it('reports what the links of a log do not add up to, like in any other log', async () => {
    const log = await logOf({
      '0001-a': adrTools('1. A', ['Accepted']),
      '0002-b': adrTools('2. B', ['Accepted', '', 'Supersedes [1. A](0001-a.md)']),
      '0003-c': adrTools('3. C', ['Accepted', '', 'Amends [9. Gone](0009-gone.md)'])
    })
    expect(log.problems.map((problem) => problem.kind).sort()).toEqual([
      'missing-back-reference',
      'not-marked-superseded',
      'unknown-target'
    ])
  })
})

describe('the title of an ADR', () => {
  it('leaves out a number that repeats the number of the file, in every format', async () => {
    const log = await logOf({
      '0003-a': '# 3. With its number\n',
      '0004-b': '# 12. Steps to the release\n',
      '0005-c': '---\nstatus: proposed\n---\n\n# 0005. Padded\n',
      '0006-d': '# 6.\n'
    })
    expect(log.adrs.map((adr) => adr.title)).toEqual([
      'With its number',
      '12. Steps to the release',
      'Padded',
      '6.'
    ])
  })
})

describe('writing to an ADR in a foreign format', () => {
  const today = { today: '2026-09-19' }
  const files = {
    '0001-a': adrTools('1. A', ['Accepted']),
    '0002-b': adrTools('2. B', ['Proposed', '', 'Supersedes [1. A](0001-a.md)']),
    '0003-own': '---\nstatus: proposed\nsupersedes: [0001-a]\n---\n\n# Own\n',
    '0003-twin': '# Twin\n',
    '0004-names-the-twin': adrTools('4. D', ['Accepted', '', 'Amends [3. Twin](0003-twin.md)']),
    '0005-e': adrTools('5. E', ['accepted', '', 'Amends [9. Gone](0009-gone.md)']),
    '0006-f': adrTools('6. F', ['Accepted']),
    '0006-g': adrTools('6. G', ['Accepted', '', 'Clarifies [7. H](0007-h.md)']),
    '0007-h': '# H\n',
    '0007-i': '---\nstatus: proposed\n---\n\n# I\n'
  }
  const open = async (): Promise<[ReturnType<typeof memoryFileSystem>, DecisionLog]> => {
    const fs = memoryFileSystem(
      Object.fromEntries(Object.entries(files).map(([name, text]) => [`doc/adr/${name}.md`, text]))
    )
    return [fs, (await openRepository(fs)).logs[0]!]
  }
  const refused = expect.objectContaining({
    ok: false,
    reason: expect.stringContaining('adr-tools')
  })

  it('is refused for every operation on the ADR itself', async () => {
    const [fs, log] = await open()
    expect(await planAccept(fs, log, '0002-b', today)).toEqual(refused)
    expect(await planReject(fs, log, '0002-b', today)).toEqual(refused)
    expect(await planDeprecate(fs, log, '0001-a')).toEqual(refused)
    expect(
      await planEditBody(fs, log, '0001-a', {
        ...today,
        base: log.adrs[0]!.body,
        body: log.adrs[0]!.body.replace('Accepted', 'Deprecated')
      })
    ).toEqual(refused)
    expect(
      await planEditMetadata(fs, log, '0001-a', {
        decisionMakers: [],
        tags: ['x'],
        relations: { 'depends-on': [], 'relates-to': [] }
      })
    ).toEqual(refused)
  })

  it('is refused for an operation on another ADR that would reach into it', async () => {
    const [fs, log] = await open()
    expect(await planAccept(fs, log, '0003-own', today)).toEqual(refused)
  })

  it('is refused where a Relation could only be accepted by writing to it', async () => {
    const [fs, log] = await open()
    const create = { ...today, title: 'Next', template: 'minimal' }
    expect(
      await planCreate(fs, log, { ...create, relation: { type: 'amends', target: '0001-a' } })
    ).toEqual(refused)
    expect(
      await planEditMetadata(fs, log, '0007-i', { relations: { supersedes: ['0006-f'] } })
    ).toEqual(refused)
    // What writes nothing to the foreign file, ever, is fine.
    expect(
      await planEditMetadata(fs, log, '0007-i', { relations: { 'depends-on': ['0006-f'] } })
    ).toMatchObject({ ok: true })
  })

  it('offers no Repair that would write to it, and says why when asked all the same', async () => {
    const [fs, log] = await open()
    const unknown = log.problems.find((problem) => problem.kind === 'unknown-target')!
    expect(unknown).toMatchObject({ adr: '0005-e', target: '0009-gone' })
    expect(repairsOf(log, unknown)).toEqual([])
    expect(
      await planRepair(fs, log, {
        kind: 'remove-item',
        adr: '0005-e',
        key: 'amends',
        item: '0009-gone'
      })
    ).toEqual(refused)
    // Not everything that names a foreign ADR is a Repair that was withheld.
    expect(
      await planRepair(fs, log, { kind: 'remove-item', adr: '0005-e', key: 'amends', item: 'x' })
    ).toEqual({ ok: false, reason: 'This Problem is no longer there.' })
  })

  it('lets Renumber rename a foreign file, which writes nothing into it', async () => {
    const [fs, log] = await open()
    const duplicate = log.problems.find(
      (problem) => problem.kind === 'duplicate-number' && problem.number === 6
    )!
    expect(repairsOf(log, duplicate)).toEqual([
      { kind: 'renumber', adr: '0006-f' },
      { kind: 'renumber', adr: '0006-g' }
    ])
    const plan = await planRenumber(fs, log, '0006-f')
    expect(plan).toMatchObject({
      ok: true,
      renamed: { from: '0006-f', to: '0008-f' },
      // The heading says "6." and will go on saying so.
      warnings: [expect.stringContaining('carries the number 6')]
    })
    expect(plan.ok && plan.changeSet.files).toEqual([
      {
        path: 'doc/adr/0006-f.md',
        renameTo: 'doc/adr/0008-f.md',
        before: files['0006-f'],
        after: files['0006-f']
      }
    ])
  })

  it('refuses a Renumber that would leave a foreign file naming the old ID', async () => {
    const [fs, log] = await open()
    // A link line the tool reads as a Relation …
    expect(await planRenumber(fs, log, '0003-twin')).toEqual(refused)
    // … and one it does not: the file would be left with a dead link nobody can correct here.
    expect(await planRenumber(fs, log, '0007-h')).toEqual(refused)
    expect(await planRenumber(fs, log, '0003-own')).toMatchObject({ ok: true })
  })
})

describe('a hostile file', () => {
  it('never makes the reader throw', async () => {
    const log = await logOf({
      '0001-a': adrTools('1. A', ['constructor [x](0002-b.md)', '__proto__: [x](0002-b.md)']),
      '0002-b': adrTools('2. B', ['toString [x](0001-a.md)', 'hasOwnProperty [y](0001-a.md)'])
    })
    expect(log.adrs.map((adr) => adr.metadata.status)).toEqual(['accepted', 'accepted'])
    expect(log.relations).toEqual([])
  })

  it('costs no more than its length', async () => {
    const spaces = ' '.repeat(300_000)
    const log = await logOf({
      '0001-a': adrTools(`1. A${spaces}y`, [
        `a${spaces}b`,
        `Supersedes${spaces}[x${spaces}](y.md${spaces})`
      ]),
      '0002-b': [`## Status${spaces}x`, `#${spaces}#${spaces}`, `Date:${spaces}x`, ''].join('\n')
    })
    expect(log.adrs.map((adr) => adr.foreign)).toEqual(['adr-tools', undefined])
  })
})
