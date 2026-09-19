import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  memoryFileSystem,
  openRepository,
  planAccept,
  planCreate,
  planDeprecate,
  planEditMetadata,
  planRenumber,
  planRepair,
  repairsOf,
  type DecisionLog
} from '../src'
import { nodeFileSystem } from './node-file-system'

const root = fileURLToPath(new URL('./fixtures/madr/', import.meta.url))

const madr = (frontmatter: string[], title = 'Title'): string =>
  ['---', ...frontmatter, '---', '', `# ${title}`, ''].join('\n')

async function logOf(files: Record<string, string>): Promise<DecisionLog> {
  const repository = await openRepository(
    memoryFileSystem(
      Object.fromEntries(
        Object.entries(files).map(([name, text]) => [`docs/decisions/${name}.md`, text])
      )
    )
  )
  return repository.logs[0]!
}

describe('a MADR repository', () => {
  it('opens as its files say', async () => {
    const repository = await openRepository(nodeFileSystem(root))
    expect(repository.discoveredBy).toBe('default')
    const [log] = repository.logs
    expect(log!.path).toBe('docs/decisions')
    expect(
      log!.adrs.map(({ id, foreign, metadata }) => [
        id.slice(0, 4),
        foreign,
        metadata.status ?? metadata.rawStatus,
        metadata.decisionMakers
      ])
    ).toEqual([
      // Valid as it stands: nothing of MADR 4 here that the tool's own format does not say.
      ['0000', undefined, 'accepted', ['Kim Becker', 'Alex Roth']],
      ['0001', undefined, 'accepted', []],
      ['0002', 'madr', 'superseded', ['Kim Becker']],
      ['0003', 'madr', 'superseded', ['Kim Becker, Alex Roth']],
      ['0004', undefined, 'on hold', []],
      ['0005', undefined, 'accepted', ['Kim Becker', 'Alex Roth']],
      [
        '0006',
        undefined,
        '{proposed | rejected | accepted | deprecated | … | superseded by ADR-0123',
        []
      ],
      ['0007', 'madr', 'superseded', []],
      ['0008', undefined, 'proposed', ['Alex Roth']],
      ['0009', 'madr', 'rejected', []]
    ])
    // The template, the README: no ADRs.
    expect(log!.adrs).toHaveLength(10)
  })

  it('reads a supersession from the superseded ADR, which is where MADR records it', async () => {
    const log = (await openRepository(nodeFileSystem(root))).logs[0]!
    const successor = '0005-graphql-for-the-public-api'
    expect(log.relations).toEqual([
      {
        type: 'supersedes',
        from: successor,
        to: '0002-rest-for-the-public-api',
        state: 'in-effect'
      },
      {
        type: 'supersedes',
        from: successor,
        to: '0003-json-over-http-for-partners',
        state: 'in-effect'
      }
    ])
    expect(log.adrs[2]!.metadata.backReferences['superseded-by']).toEqual([successor])
    expect(log.adrs[3]!.metadata.backReferences['superseded-by']).toEqual([successor])
    // The successor's file says nothing of it, and is not a foreign file for that.
    expect(log.adrs[5]!.metadata.present).not.toContain('supersedes')
    expect(log.adrs[5]!.eol).toBe('\r\n')
  })

  it('has the Problems a person has to look at, and none of its format', async () => {
    const log = (await openRepository(nodeFileSystem(root))).logs[0]!
    expect(log.problems).toEqual([
      expect.objectContaining({ kind: 'invalid-metadata', adr: '0004-rate-limits-per-partner' }),
      expect.objectContaining({ kind: 'invalid-metadata', adr: '0006-cache-in-front-of-the-api' }),
      // "superseded by ADR-0042", and there is no ADR 42.
      {
        kind: 'unknown-target',
        adr: '0007-xml-for-the-bank',
        key: 'superseded-by',
        target: 'ADR-0042'
      },
      { kind: 'superseded-without-successor', adr: '0007-xml-for-the-bank' }
    ])
  })
})

describe('recognizing a file of MADR', () => {
  it('leaves a file alone that says nothing the own format cannot say', async () => {
    const log = await logOf({
      '0001-a': madr(['status: accepted', 'date: 2024-01-01', 'nav_order: 1', 'consulted: x']),
      '0002-b': madr(['status: deprecated', 'deciders: A', 'decision-makers: [B]']),
      '0003-c': madr(['status: Superseded'])
    })
    expect(log.adrs.map((adr) => adr.foreign)).toEqual([undefined, undefined, undefined])
    expect(log.adrs[1]!.metadata.decisionMakers).toEqual(['B'])
  })

  it('resolves an identifier in every way people write it', async () => {
    const written = ['ADR-0009', 'adr 9', '0009', '9', '#9', 'ADR9', '[ADR-0009](0009-new.md)']
    const log = await logOf({
      ...Object.fromEntries(
        written.map((target, position) => [
          `000${position + 1}-old`,
          madr([`status: "Superseded by ${target}"`])
        ])
      ),
      '0009-new': madr(['status: accepted'])
    })
    expect(log.problems).toEqual([])
    expect(log.relations).toHaveLength(written.length)
    for (const adr of log.adrs.slice(0, -1)) {
      expect(adr.metadata).toMatchObject({
        status: 'superseded',
        backReferences: { 'superseded-by': ['0009-new'] }
      })
    }
  })

  it('keeps what it cannot resolve as it is written', async () => {
    const log = await logOf({
      '0001-a': madr(['status: superseded by ADR-0003']),
      '0002-b': madr(['status: superseded by the new gateway']),
      '0003-c': madr(['status: accepted']),
      '0003-d': madr(['status: accepted']),
      '0004-e': madr(['status: superceded by']),
      '0005-f': madr(['status: superseded by ADR-0005'])
    })
    expect(log.adrs.map((adr) => adr.metadata.backReferences['superseded-by'])).toEqual([
      // Two ADRs have the number 3: the tool does not pick one.
      ['ADR-0003'],
      ['the new gateway'],
      [],
      [],
      [],
      ['0005-f']
    ])
    expect(log.adrs.map((adr) => adr.metadata.status)).toEqual([
      'superseded',
      'superseded',
      'accepted',
      'accepted',
      'superseded',
      'superseded'
    ])
    expect(log.problems.map((problem) => problem.kind).sort()).toEqual([
      'duplicate-number',
      'self-reference',
      'superseded-without-successor',
      'superseded-without-successor',
      'superseded-without-successor',
      'superseded-without-successor',
      'unknown-target',
      'unknown-target'
    ])
  })

  it('does not supersede through a successor that has not been accepted', async () => {
    const log = await logOf({
      '0001-a': madr(['status: superseded by ADR-0002']),
      '0002-b': madr(['status: proposed'])
    })
    expect(log.relations).toEqual([
      { type: 'supersedes', from: '0002-b', to: '0001-a', state: 'pending' }
    ])
    expect(log.problems.map((problem) => problem.kind)).toEqual([
      'unfounded-back-reference',
      'superseded-without-successor'
    ])
  })

  it('reads the Status from the list under the title, where MADR 2 keeps it', async () => {
    const body = (...items: string[]): string =>
      ['# Title', '', ...items, '', '## Context', '', '* Status: deprecated', ''].join('\n')
    const log = await logOf({
      '0001-a': body('* Status: Rejected', '* Deciders: A'),
      '0002-b': body('- Deciders: A', '- status: superseded by [x](0003-c.md) <!-- optional -->'),
      '0003-c': body('Technical Story: none'),
      '0004-d': body('+ Status: draft'),
      '0005-e': ['---', 'status: proposed', '---', body('* Status: rejected')].join('\n'),
      '0006-f': ['---', 'tags: [x]', '---', body('* Status: rejected')].join('\n'),
      '0007-g': body('Some text.', '', '* Status: rejected')
    })
    expect(
      log.adrs.map((adr) => [adr.foreign, adr.metadata.status ?? adr.metadata.rawStatus])
    ).toEqual([
      ['madr', 'rejected'],
      ['madr', 'superseded'],
      [undefined, 'accepted'],
      ['madr', 'draft'],
      [undefined, 'proposed'],
      ['madr', 'rejected'],
      // The first list of the body, not the first thing in it.
      ['madr', 'rejected']
    ])
    expect(log.adrs[0]!.metadata.decisionMakers).toEqual([])
    expect(log.relations).toMatchObject([{ from: '0003-c', to: '0002-b' }])
  })

  it('is adr-tools when there is a Status section and no frontmatter, whatever else there is', async () => {
    const log = await logOf({
      '0001-a': ['# A', '', '* Status: rejected', '', '## Status', '', 'Deprecated', ''].join('\n')
    })
    expect(log.adrs[0]).toMatchObject({ foreign: 'adr-tools', metadata: { status: 'deprecated' } })
  })

  it('never throws, and costs no more than the length of the file', async () => {
    const spaces = ' '.repeat(300_000)
    const log = await logOf({
      '0001-a': madr([`status: superseded by${spaces}ADR-1${spaces}x`]),
      '0002-b': madr(['status: superseded by [__proto__](constructor.md)']),
      '0003-c': `# C\n\n* Status:${spaces}x${spaces}\n*${spaces}Status: y\n`
    })
    expect(log.adrs.map((adr) => adr.foreign)).toEqual(['madr', 'madr', 'madr'])
  })
})

describe('a file of MADR and the operations', () => {
  const files = {
    '0001-old': madr(['status: superseded by ADR-0002', 'deciders: A']),
    '0002-new': madr(['status: accepted']),
    '0002-twin': madr(['status: accepted'])
  }

  it('is not written, and the successor it names is', async () => {
    const fs = memoryFileSystem({
      'docs/decisions/0001-old.md': madr(['status: superseded by ADR-0002']),
      'docs/decisions/0002-new.md': files['0002-new']
    })
    const log = (await openRepository(fs)).logs[0]!
    expect(await planEditMetadata(fs, log, '0001-old', { tags: ['x'] })).toMatchObject({
      ok: false,
      reason: expect.stringContaining('MADR')
    })
    // The successor is a file of the tool's own format; what is read into it stays in memory.
    const plan = await planDeprecate(fs, log, '0002-new')
    expect(plan.ok && plan.changeSet.files.map((file) => file.after)).toEqual([
      madr(['status: deprecated'])
    ])
  })

  it('keeps an ADR from being renumbered whose number it names', async () => {
    const fs = memoryFileSystem(
      Object.fromEntries(
        Object.entries(files).map(([name, text]) => [`docs/decisions/${name}.md`, text])
      )
    )
    const log = (await openRepository(fs)).logs[0]!
    // "ADR-0002" names two ADRs here, so nobody is the successor yet. Whichever of them
    // moved, the identifier would mean something else afterwards, and nobody chose that.
    expect(log.relations).toEqual([])
    for (const id of ['0002-new', '0002-twin']) {
      expect(await planRenumber(fs, log, id)).toMatchObject({
        ok: false,
        reason: expect.stringContaining('MADR')
      })
    }
  })
})

describe('a supersession that only the superseded ADR records', () => {
  const open = async (
    files: Record<string, string>
  ): Promise<[ReturnType<typeof memoryFileSystem>, DecisionLog]> => {
    const fs = memoryFileSystem(
      Object.fromEntries(
        Object.entries(files).map(([name, text]) => [`docs/decisions/${name}.md`, text])
      )
    )
    return [fs, (await openRepository(fs)).logs[0]!]
  }

  it('is kept next to the Metadata of the successor, which stays what its file says', async () => {
    const [, log] = await open({
      '0001-old': madr(['status: superseded by ADR-0002']),
      '0002-new': madr(['status: accepted'])
    })
    expect(log.adrs[1]).toMatchObject({
      impliedSupersedes: ['0001-old'],
      metadata: { relations: { supersedes: [] } }
    })
    expect(log.adrs[1]!.foreign).toBeUndefined()
    expect(log.problems).toEqual([])
  })

  it('comes from the Status alone, not from a Back-reference the file has as well', async () => {
    const [, log] = await open({
      '0001-old': madr(['status: accepted', 'deciders: A', 'superseded-by: [0002-new]']),
      '0002-new': madr(['status: accepted'])
    })
    expect(log.adrs[0]!.foreign).toBe('madr')
    expect(log.relations).toEqual([])
    expect(log.problems).toMatchObject([{ kind: 'unfounded-back-reference', adr: '0001-old' }])
  })

  it('does not keep a proposed successor from being accepted', async () => {
    const [fs, log] = await open({
      '0001-old': madr(['status: superseded by ADR-0002']),
      '0002-new': madr(['status: proposed'])
    })
    const plan = await planAccept(fs, log, '0002-new', { today: '2026-09-19' })
    // The superseded ADR says all there is to say already; nothing is written to it.
    expect(plan.ok && plan.changeSet.files.map((file) => file.path)).toEqual([
      'docs/decisions/0002-new.md'
    ])
  })

  it('is not offered for editing, or for a Repair, where it is not written', async () => {
    const [fs, log] = await open({
      '0001-old': madr(['status: superseded by ADR-0002', 'supersedes: [0002-new]']),
      '0002-new': madr(['status: accepted'])
    })
    const cycle = log.problems.find((problem) => problem.kind === 'supersedes-cycle')!
    expect(cycle).toBeDefined()
    // One edge of the circle is in a file of MADR, the other in no file at all.
    expect(repairsOf(log, cycle)).toEqual([])
    expect(
      await planRepair(fs, log, {
        kind: 'remove-item',
        adr: '0002-new',
        key: 'supersedes',
        item: '0001-old'
      })
    ).toMatchObject({ ok: false })
  })

  it('reaches a successor in any format', async () => {
    const [, log] = await open({
      '0001-old': madr(['status: superseded by ADR-0002']),
      '0002-new': '# 2. New\n\n## Status\n\nAccepted\n',
      '0003-older': madr(['status: superseded by ADR-0004']),
      '0004-newer': madr(['status: accepted', 'deciders: A'])
    })
    expect(log.relations.map(({ from, to }) => [from, to])).toEqual([
      ['0002-new', '0001-old'],
      ['0004-newer', '0003-older']
    ])
    expect(log.problems).toEqual([])
  })

  it('lets the superseded ADR be renumbered whatever the format of its successor', async () => {
    const [fs, log] = await open({
      '0001-old': madr(['status: superseded by ADR-0002']),
      '0001-twin': madr(['status: accepted']),
      '0002-new': madr(['status: accepted', 'deciders: A'])
    })
    expect(await planRenumber(fs, log, '0001-old')).toMatchObject({
      ok: true,
      renamed: { to: '0003-old' }
    })
  })

  it('keeps an ADR from taking a number that a file of MADR names in vain', async () => {
    const [fs, log] = await open({
      '0001-old': madr(['status: superseded by ADR-0004']),
      '0002-new': madr(['status: accepted']),
      '0002-twin': madr(['status: accepted']),
      '0003-x': madr(['status: accepted'])
    })
    expect(await planRenumber(fs, log, '0002-twin')).toMatchObject({
      ok: false,
      reason: expect.stringContaining('the number 4')
    })
    // A new ADR gets that number too. It is a person's to say whether it is the successor.
    const plan = await planCreate(fs, log, {
      today: '2026-09-19',
      title: 'Next',
      template: 'minimal'
    })
    expect(plan).toMatchObject({
      ok: true,
      created: { id: '0004-next' },
      warnings: [expect.stringContaining('0001-old')]
    })
  })
})

describe('values of MADR in shapes nobody expects', () => {
  it('are read, or left alone, and never guessed at', async () => {
    const log = await logOf({
      '0001-a': madr(['status: accepted', 'deciders:']),
      '0002-b': madr(['status: accepted', 'deciders: { list: everyone }']),
      '0003-c': madr(['status: accepted', 'deciders: [[A, B], C, C, ~]']),
      '0004-d': madr(['status: |', '  superseded by', '  ADR-0001']),
      '0005-e': '# E\n\n* * *\n\nText.\n\n* Status: <!-- pick one --> rejected <!-- optional -->\n',
      '0006-f': '# F\n\n1. Status: rejected\n',
      '0007-g': madr(['status: {proposed | rejected | superseded by [ADR-0005](0005-x.md)}'])
    })
    expect(
      log.adrs.map((adr) => [adr.foreign, adr.metadata.status, adr.metadata.decisionMakers])
    ).toEqual([
      [undefined, 'accepted', []],
      [undefined, 'accepted', []],
      // A list with anything but single values in it is a foreign key, like the mapping.
      [undefined, 'accepted', []],
      ['madr', 'superseded', []],
      // A thematic break is no list, and the template's comments are no Status.
      ['madr', 'rejected', []],
      [undefined, 'accepted', []],
      // MADR 3's placeholder without quotes is not YAML: a Problem of its own kind.
      [undefined, 'accepted', []]
    ])
    expect(log.adrs[3]!.metadata.backReferences['superseded-by']).toEqual(['0001-a'])
    expect(log.problems.map((problem) => problem.kind)).toEqual(['invalid-frontmatter'])
  })
})
