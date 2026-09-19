import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  applyChangeSet,
  memoryFileSystem,
  openRepository,
  planAccept,
  planMigration,
  type DecisionLog,
  type Problem
} from '../src'

const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url))

/** Every file below a fixture directory, exactly as it is on disk. */
function tree(name: string, below = ''): Record<string, string> {
  const files: Record<string, string> = {}
  for (const entry of readdirSync(join(fixtures, name, below), { withFileTypes: true })) {
    const path = below ? `${below}/${entry.name}` : entry.name
    if (entry.isDirectory()) Object.assign(files, tree(name, path))
    else files[path] = readFileSync(join(fixtures, name, path), 'utf8')
  }
  return files
}

type Files = ReturnType<typeof memoryFileSystem>

async function open(files: Record<string, string>): Promise<[Files, DecisionLog]> {
  const fs = memoryFileSystem(files)
  return [fs, (await openRepository(fs)).logs[0]!]
}

const inLog = (files: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(files).map(([name, text]) => [`docs/adr/${name}.md`, text]))

const sorted = (problems: readonly Problem[]): string[] =>
  problems.map((problem) => JSON.stringify(problem)).sort()

describe.each([
  {
    name: 'adr-tools',
    changed: ['0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008'],
    stillForeign: [] as string[],
    warnings: [
      ['0003-deploy-to-two-regions', 'Clarified by'],
      ['0004-queue-between-the-services', '"Proposed"'],
      ['0005-review-decisions-every-quarter', 'Clarifies'],
      ['0007-graphql-for-partners', 'On hold'],
      ['0008-feature-flags', '../notes/flags.md']
    ]
  },
  {
    name: 'madr',
    changed: ['0002', '0003', '0005', '0007'],
    stillForeign: ['0009-csv-export-for-finance'],
    warnings: [
      ['0009-csv-export-for-finance', 'MADR 2'],
      ['0007-xml-for-the-bank', 'ADR-0042']
    ]
  }
])(
  'Migration of the Decision Log of the fixture $name',
  ({ name, changed, stillForeign, warnings }) => {
    it('is one change set that leaves exactly the expected files behind', async () => {
      const before = tree(name)
      const [fs, log] = await open(before)
      const plan = await planMigration(fs, log)
      if (!plan.ok) throw new Error(plan.reason)

      expect(plan.changeSet.files.map((file) => /\/(\d{4})-/.exec(file.path)![1]).sort()).toEqual(
        changed
      )
      expect(plan.warnings).toHaveLength(warnings.length)
      warnings.forEach(([adr, what], position) => {
        expect(plan.warnings![position]).toContain(adr)
        expect(plan.warnings![position]).toContain(what)
      })

      expect(await applyChangeSet(fs, plan.changeSet)).toEqual({ applied: true })
      const expected = tree(`${name}-migrated`)
      for (const path of Object.keys(before)) {
        expect(await fs.readText(path), path).toBe(expected[path])
      }
    })

    it('says afterwards what it said before, in files of the tool’s own format', async () => {
      const [, before] = await open(tree(name))
      const [, after] = await open(tree(`${name}-migrated`))
      expect(after.adrs.filter((adr) => adr.foreign).map((adr) => adr.id)).toEqual(stillForeign)
      expect(after.relations).toEqual(before.relations)
      expect(sorted(after.problems)).toEqual(sorted(before.problems))
      // What another file recorded for the successor is in the successor's own file now.
      for (const adr of before.adrs) {
        const migrated = after.adrs.find((candidate) => candidate.id === adr.id)!
        expect(migrated.title).toBe(adr.title)
        expect(migrated.metadata.status).toBe(adr.metadata.status)
        expect(migrated.metadata.rawStatus).toBe(adr.metadata.rawStatus)
        expect(migrated.metadata.created).toBe(adr.metadata.created)
        expect(migrated.metadata.decisionMakers).toEqual(adr.metadata.decisionMakers)
        expect(migrated.metadata.backReferences).toEqual(adr.metadata.backReferences)
        expect([...migrated.metadata.relations.supersedes]).toEqual([
          ...adr.metadata.relations.supersedes,
          ...(adr.impliedSupersedes ?? [])
        ])
      }
    })

    it('has nothing left to do the second time', async () => {
      const [fs, log] = await open(tree(`${name}-migrated`))
      const again = await planMigration(fs, log)
      expect(again.ok).toBe(false)
    })
  }
)

describe('Migration of a file of adr-tools', () => {
  const adrTools = (...status: string[]): string =>
    [
      '# 1. A',
      '',
      'Date: 2020-01-02',
      '',
      '## Status',
      '',
      ...status,
      '',
      '## Context',
      '',
      'Text.',
      ''
    ].join('\n')

  it('keeps a byte order mark in front, and the line ending of the file', async () => {
    const text = '\uFEFF' + adrTools('Accepted').replaceAll('\n', '\r\n')
    const [fs, log] = await open(inLog({ '0001-a': text }))
    const plan = await planMigration(fs, log, '0001-a')
    expect(plan.ok && plan.changeSet.files[0]!.after).toBe(
      '\uFEFF---\r\nstatus: accepted\r\ncreated: 2020-01-02\r\n---\r\n\r\n# 1. A\r\n\r\nDate: 2020-01-02\r\n\r\n## Context\r\n\r\nText.\r\n'
    )
  })

  it('ends the file where its text ends when the Status section was the last one', async () => {
    const [fs, log] = await open(
      inLog({ '0001-a': '# 1. A\n\nText.\n\n\n## Status\n\nRejected\n\n' })
    )
    const plan = await planMigration(fs, log, '0001-a')
    expect(plan.ok && plan.changeSet.files[0]!.after).toBe(
      '---\nstatus: rejected\n---\n\n# 1. A\n\nText.\n'
    )
  })

  it('does not put a second blank line under the frontmatter', async () => {
    const [fs, log] = await open(inLog({ '0001-a': '\n## Status\n\nDeprecated\n# 1. A\n' }))
    const plan = await planMigration(fs, log, '0001-a')
    expect(plan.ok && plan.changeSet.files[0]!.after).toBe(
      '---\nstatus: deprecated\n---\n\n# 1. A\n'
    )
  })

  it.each([
    ['a code block', ['Accepted', '', '```', 'adr new -s 1', '```']],
    ['### Notes', ['Accepted', '', '### Notes', '', 'Reviewed in March.']],
    ['Accepted [see](0002-b.md)', ['Accepted [see](0002-b.md)']],
    ['Draft', ['Draft', 'Supersedes [2. B](0002-b.md)']]
  ])('leaves the Status section where the Metadata does not hold %j', async (kept, status) => {
    const text = adrTools(...status)
    const [fs, log] = await open(inLog({ '0001-a': text, '0002-b': '# B\n' }))
    const plan = await planMigration(fs, log, '0001-a')
    if (!plan.ok) throw new Error(plan.reason)
    expect(plan.warnings).toEqual([expect.stringContaining(`"${kept}"`)])
    // Everything the file had is still there, under the new frontmatter.
    expect(plan.changeSet.files[0]!.after.endsWith(`---\n\n${text}`)).toBe(true)
  })

  it('writes a Status it does not know as it is written, quoted where YAML asks for it', async () => {
    const [fs, log] = await open(inLog({ '0001-a': adrTools('On hold: see #12') }))
    const plan = await planMigration(fs, log, '0001-a')
    expect(plan.ok && plan.changeSet.files[0]!.after.split('\n')[1]).toBe(
      'status: "On hold: see #12"'
    )
  })
})

describe('Migration of a file of MADR', () => {
  const madr = (...frontmatter: string[]): string =>
    ['---', ...frontmatter, '---', '', '# Title', ''].join('\n')

  it('writes the supersession into both files, and nothing else', async () => {
    const [fs, log] = await open(
      inLog({
        '0001-old': madr('# ours', "status: 'Superseded by: ADR-2' # see there", 'nav_order: 1'),
        '0002-new': madr('status: accepted', 'tags: [api]')
      })
    )
    const plan = await planMigration(fs, log, '0001-old')
    expect(plan.ok && plan.changeSet.files.map((file) => [file.path, file.after])).toEqual([
      [
        'docs/adr/0001-old.md',
        madr(
          '# ours',
          "status: 'superseded' # see there",
          'superseded-by: [0002-new]',
          'nav_order: 1'
        )
      ],
      ['docs/adr/0002-new.md', madr('status: accepted', 'tags: [api]', 'supersedes: [0001-old]')]
    ])
  })

  it('renames deciders where it stands, whatever its value looks like', async () => {
    const [fs, log] = await open(
      inLog({ '0001-a': madr('deciders:', '  - A # lead', '  - B', 'status: accepted') })
    )
    const plan = await planMigration(fs, log, '0001-a')
    expect(plan.ok && plan.changeSet.files[0]!.after).toBe(
      madr('decision-makers:', '  - A # lead', '  - B', 'status: accepted')
    )
  })

  it('is refused for one ADR whose successor is in a foreign format itself', async () => {
    const files = inLog({
      '0001-old': madr('status: superseded by ADR-0002'),
      '0002-new': '# 2. New\n\n## Status\n\nAccepted\n'
    })
    const [fs, log] = await open(files)
    expect(await planMigration(fs, log, '0001-old')).toMatchObject({
      ok: false,
      reason: expect.stringContaining('Migrate 0002-new first, or the whole Decision Log')
    })
    // The successor first, then the ADR: the same two files as the whole log at once.
    const whole = await planMigration(fs, log)
    const first = await planMigration(fs, log, '0002-new')
    if (!whole.ok || !first.ok) throw new Error('refused')
    await applyChangeSet(fs, first.changeSet)
    const second = await planMigration(fs, (await openRepository(fs)).logs[0]!, '0001-old')
    if (!second.ok) throw new Error(second.reason)
    await applyChangeSet(fs, second.changeSet)
    for (const file of whole.changeSet.files) {
      expect(await fs.readText(file.path)).toBe(file.after)
    }
    expect(whole.changeSet.files.find((file) => file.path.endsWith('0002-new.md'))!.after).toBe(
      '---\nstatus: accepted\nsupersedes: [0001-old]\n---\n\n# 2. New\n'
    )
  })

  it('leaves out what cannot be migrated yet, and what waits for it', async () => {
    const [fs, log] = await open(
      inLog({
        '0001-oldest': madr('status: superseded by ADR-0002'),
        '0002-old': '# Old\n\n* Status: superseded by [ADR-0003](0003-new.md)\n',
        '0003-new': madr('status: accepted'),
        '0004-other': madr('status: accepted', 'deciders: A')
      })
    )
    const plan = await planMigration(fs, log)
    if (!plan.ok) throw new Error(plan.reason)
    expect(plan.changeSet.files.map((file) => file.path)).toEqual(['docs/adr/0004-other.md'])
    expect(plan.warnings).toEqual([
      expect.stringContaining('0002-old keeps its Status in the list under its title'),
      expect.stringContaining('0001-oldest waits for its successor 0002-old')
    ])
    expect(await planMigration(fs, log, '0002-old')).toMatchObject({
      ok: false,
      reason: expect.stringContaining('MADR 2')
    })
  })
})

describe('asking for a Migration', () => {
  it('is refused where there is nothing to migrate', async () => {
    const [fs, log] = await open(inLog({ '0001-a': '# A\n', '0002-b': '---\nstatus: [x\n---\n' }))
    expect(await planMigration(fs, log)).toMatchObject({ ok: false })
    expect(await planMigration(fs, log, '0001-a')).toEqual({
      ok: false,
      reason: "0001-a is in the tool's own format already."
    })
    expect(await planMigration(fs, log, '0009-gone')).toMatchObject({ ok: false })
  })

  it('is what every refusal on a foreign ADR points to, and what makes the operation possible', async () => {
    const [fs, log] = await open(inLog({ '0001-a': '# 1. A\n\n## Status\n\nProposed\n' }))
    const today = { today: '2026-09-19' }
    expect(await planAccept(fs, log, '0001-a', today)).toMatchObject({
      ok: false,
      reason: expect.stringContaining('Migrate it first')
    })
    const plan = await planMigration(fs, log, '0001-a')
    if (!plan.ok) throw new Error(plan.reason)
    await applyChangeSet(fs, plan.changeSet)
    const accepted = await planAccept(fs, (await openRepository(fs)).logs[0]!, '0001-a', today)
    expect(accepted.ok && accepted.changeSet.files[0]!.after).toBe(
      '---\nstatus: accepted\ndecided: 2026-09-19\n---\n\n# 1. A\n'
    )
  })
})
