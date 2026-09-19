import { describe, expect, it } from 'vitest'
import {
  applyChangeSet,
  groupProblems,
  memoryFileSystem,
  openRepository,
  planRepair,
  repairsOf,
  type ChangeSet,
  type Plan,
  type Problem,
  type Repair
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

/** Per file of a change set: which lines it loses and gains. */
function changes(changeSet: ChangeSet) {
  return Object.fromEntries(
    changeSet.files.map((file) => {
      const [old, now] = [lines(file.before), lines(file.after)]
      return [
        file.path.replace('docs/adr/', ''),
        {
          removed: old.filter((line) => !now.includes(line)),
          added: now.filter((line) => !old.includes(line))
        }
      ]
    })
  )
}

/** The one Problem of a log, its one repair, and what that repair would write. */
async function repairOnly(adrs: Record<string, string>) {
  const { fs, log } = await repository(adrs)
  expect(log.problems).toHaveLength(1)
  const repairs = repairsOf(log, log.problems[0]!)
  expect(repairs).toHaveLength(1)
  const plan = await planRepair(fs, log, repairs[0]!)
  if (!plan.ok) throw new Error(plan.reason)
  return { plan, changes: changes(plan.changeSet) }
}

describe('the repair of a Problem', () => {
  it('writes the Status in lowercase and keeps its quoting', async () => {
    const { changes } = await repairOnly({ '0001-a': adr('status: "Accepted" # as decided') })
    expect(changes).toEqual({
      '0001-a.md': {
        removed: ['status: "Accepted" # as decided\n'],
        added: ['status: "accepted" # as decided\n']
      }
    })
  })

  it('takes a Relation to an ADR that does not exist out of its list', async () => {
    const { changes } = await repairOnly({
      '0001-a': adr('status: accepted'),
      '0002-b': adr('status: accepted', 'depends-on: [0001-a, 0009-gone]')
    })
    expect(changes).toEqual({
      '0002-b.md': {
        removed: ['depends-on: [0001-a, 0009-gone]\n'],
        added: ['depends-on: [0001-a]\n']
      }
    })
  })

  it('takes a Back-reference to an ADR that does not exist out, and the key with its last item', async () => {
    const { changes } = await repairOnly({
      '0001-a': adr('status: accepted', 'amended-by: [0009-gone]')
    })
    expect(changes).toEqual({
      '0001-a.md': { removed: ['amended-by: [0009-gone]\n'], added: [] }
    })
  })

  it('takes out a Relation of an ADR to itself', async () => {
    const { changes } = await repairOnly({
      '0001-a': adr('status: accepted', 'relates-to:', '  - 0001-a')
    })
    expect(changes).toEqual({
      '0001-a.md': { removed: ['relates-to:\n', '  - 0001-a\n'], added: [] }
    })
  })

  it('adds the Back-reference that a Relation in effect asks for', async () => {
    const { changes } = await repairOnly({
      '0001-base': adr('status: accepted'),
      '0002-more': adr('status: accepted', 'amends: [0001-base]')
    })
    expect(changes).toEqual({
      '0001-base.md': { removed: [], added: ['amended-by: [0002-more]\n'] }
    })
  })

  it('takes out a Back-reference that has no Relation in effect behind it', async () => {
    const { plan, changes } = await repairOnly({
      '0001-base': adr('status: accepted', 'amended-by: [0002-more]'),
      '0002-more': adr('status: proposed', 'amends: [0001-base]')
    })
    expect(changes).toEqual({
      '0001-base.md': { removed: ['amended-by: [0002-more]\n'], added: [] }
    })
    expect(plan.ok && plan.warnings).toEqual([
      '0002-more is still proposed. When it is accepted, the Back-reference is written again.'
    ])
  })

  it('says why the Back-reference has nothing behind it, so that a broken successor is noticed', async () => {
    const premise = async (...successor: string[]): Promise<readonly string[] | undefined> => {
      const { fs, log } = await repository({
        '0001-base': adr('status: accepted', 'amended-by: [0002-more]'),
        '0002-more': adr(...successor)
      })
      const problem = log.problems.find(({ kind }) => kind === 'unfounded-back-reference')!
      const plan = await planRepair(fs, log, repairsOf(log, problem)[0]!)
      return plan.ok ? plan.warnings : [plan.reason]
    }
    expect(await premise('status: rejected', 'amends: [0001-base]')).toEqual([
      '0002-more was rejected: its Relations never take effect.'
    ])
    expect(await premise('status: acepted', 'amends: [0001-base]')).toEqual([
      'The Status of 0002-more cannot be read ("acepted"). If that ADR has been accepted, cancel and fix its Status instead: the Back-reference is right then.'
    ])
    expect(await premise('status: accepted')).toEqual([
      '0002-more does not name 0001-base in amends. If it should, cancel and add it to 0002-more by hand: the Back-reference is right then.'
    ])
  })

  it('does not mark an ADR as superseded whose Status is not one that can be superseded', async () => {
    for (const status of ['proposed', 'rejected', 'acepted']) {
      const { log } = await repository({
        '0001-old': adr(`status: ${status}`, 'superseded-by: [0002-new]'),
        '0002-new': adr('status: accepted', 'supersedes: [0001-old]')
      })
      const problem = log.problems.find(({ kind }) => kind === 'not-marked-superseded')!
      expect(repairsOf(log, problem)).toEqual([])
    }
  })

  it('marks the target of a supersedes Relation in effect as superseded', async () => {
    const { changes } = await repairOnly({
      '0001-old': adr('status: deprecated', 'superseded-by: [0002-new]'),
      '0002-new': adr('status: accepted', 'supersedes: [0001-old]')
    })
    expect(changes).toEqual({
      '0001-old.md': { removed: ['status: deprecated\n'], added: ['status: superseded\n'] }
    })
  })

  it('takes the superseded Status back, and says what it cannot know', async () => {
    const { plan, changes } = await repairOnly({ '0001-old': adr('status: superseded') })
    expect(changes).toEqual({
      '0001-old.md': { removed: ['status: superseded\n'], added: ['status: accepted\n'] }
    })
    expect(plan.ok && plan.warnings).toEqual([
      '0001-old becomes accepted. If it had been deprecated before it was marked as superseded, deprecate it again afterwards.'
    ])
  })

  it('offers every supersedes Relation of a cycle, and takes out the one that is picked', async () => {
    const { fs, log } = await repository({
      '0001-a': adr('status: proposed', 'supersedes: [0002-b]'),
      '0002-b': adr('status: proposed', 'supersedes: [0001-a, 0003-c]'),
      '0003-c': adr('status: accepted')
    })
    expect(log.problems).toEqual([{ kind: 'supersedes-cycle', adrs: ['0001-a', '0002-b'] }])
    const repairs = repairsOf(log, log.problems[0]!)
    expect(repairs).toEqual([
      { kind: 'remove-item', adr: '0001-a', key: 'supersedes', item: '0002-b' },
      { kind: 'remove-item', adr: '0002-b', key: 'supersedes', item: '0001-a' }
    ])
    const plan = await planRepair(fs, log, repairs[1]!)
    expect(plan.ok && changes(plan.changeSet)).toEqual({
      '0002-b.md': {
        removed: ['supersedes: [0001-a, 0003-c]\n'],
        added: ['supersedes: [0003-c]\n']
      }
    })
  })

  it('of a duplicate number is a Renumber, of whichever ADR is picked', async () => {
    const { fs, log } = await repository({
      '0001-a': adr('status: accepted'),
      '0001-b': adr('status: accepted')
    })
    const repairs = repairsOf(log, log.problems[0]!)
    expect(repairs).toEqual([
      { kind: 'renumber', adr: '0001-a' },
      { kind: 'renumber', adr: '0001-b' }
    ])
    const plan = await planRepair(fs, log, repairs[1]!)
    expect(plan.ok && plan.renamed).toEqual({ from: '0001-b', to: '0002-b' })
  })

  it('does not exist where the tool cannot know what was meant', async () => {
    const { log } = await repository({
      '0001-a': adr('status: [accepted'),
      '0002-b': adr('status: decided', 'created: yesterday'),
      '0003-c': '---\nstatus: accepted\n\n# Title\n'
    })
    expect(log.problems.map((problem) => [problem.kind, repairsOf(log, problem)])).toEqual([
      ['invalid-frontmatter', []],
      ['invalid-metadata', []],
      ['invalid-metadata', []],
      ['unterminated-frontmatter', []]
    ])
  })
})

describe('a repair is refused', () => {
  const refusal = async (adrs: Record<string, string>, repair: Repair): Promise<Plan> => {
    const { fs, log } = await repository(adrs)
    return planRepair(fs, log, repair)
  }

  it('when the Problem it repairs is not there (any more)', async () => {
    const plan = await refusal(
      { '0001-a': adr('status: accepted', 'tags: [keep]') },
      { kind: 'remove-item', adr: '0001-a', key: 'tags', item: 'keep' }
    )
    expect(plan).toEqual({ ok: false, reason: 'This Problem is no longer there.' })
  })

  it('when the Problem only follows from a file that cannot be read', async () => {
    const plan = await refusal(
      {
        '0001-old': adr('status: superseded', 'superseded-by: [0002-new]'),
        '0002-new': adr('status: [accepted', 'supersedes: [0001-old]')
      },
      { kind: 'remove-item', adr: '0001-old', key: 'superseded-by', item: '0002-new' }
    )
    expect(plan).toEqual({
      ok: false,
      reason:
        'This is only reported because the frontmatter of 0002-new cannot be read. Fix that file first.'
    })
  })
})

describe('a deliberately broken Decision Log', () => {
  it('is repaired entirely by repairs, each of which writes only what it says', async () => {
    const names = fixtureNames('broken/docs/adr')
    const fs = memoryFileSystem(
      Object.fromEntries(
        names.map((name) => [`docs/adr/${name}`, fixture(`broken/docs/adr/${name}`)])
      )
    )
    const seen = new Set<Problem['kind']>()

    for (let step = 0; ; step++) {
      const log = (await openRepository(fs)).logs[0]!
      const groups = groupProblems(log)
      if (groups.length === 0) break
      expect(step).toBeLessThan(30)

      const { problem, consequences } = groups[0]!
      expect(consequences).toEqual([])
      seen.add(problem.kind)
      const plan = await planRepair(fs, log, repairsOf(log, problem)[0]!)
      if (!plan.ok) throw new Error(plan.reason)
      // One repair, one or two lines of one file — or one rename.
      expect(plan.changeSet.files).toHaveLength(1)
      for (const change of Object.values(changes(plan.changeSet))) {
        expect(change.removed.length + change.added.length).toBeLessThanOrEqual(2)
      }
      expect(await applyChangeSet(fs, plan.changeSet)).toEqual({ applied: true })
    }

    expect([...seen].sort()).toEqual([
      'duplicate-number',
      'missing-back-reference',
      'not-marked-superseded',
      'self-reference',
      'status-not-lowercase',
      'superseded-without-successor',
      'supersedes-cycle',
      'unfounded-back-reference',
      'unknown-target'
    ])
    // Byte for byte: every file is what it was, but for the lines the repairs were about.
    const rewritten: Record<string, [from: string, to: string][]> = {
      '0001-foundation.md': [
        ['tags: [structure]\n', 'tags: [structure]\namended-by: [0005-split-module]\n']
      ],
      '0002-old-database.md': [
        ['status: accepted # nobody updated this\n', 'status: superseded # nobody updated this\n']
      ],
      // The file with CRLF line endings and a foreign key: a line changed, a line inserted.
      '0003-new-database.md': [
        [
          "depends-on: [0001-foundation, '0042-never-written']\r\n",
          'depends-on: [0001-foundation]\r\namended-by: [0005-split-module]\r\n'
        ]
      ],
      '0004-api-style.md': [
        ['status: "Rejected"\n', 'status: "rejected"\n'],
        ['relates-to:\n  - 0004-api-style\n', '']
      ],
      '0007-caching.md': [
        ['status: superseded\n', 'status: accepted\n'],
        ['superseded-by: [0008-no-caching]\n', '']
      ],
      '0009-queue.md': [['supersedes: [0010-cron]\n', '']]
    }
    for (const name of names) {
      let expected = fixture(`broken/docs/adr/${name}`)
      for (const [from, to] of rewritten[name] ?? []) {
        expect(expected).toContain(from)
        expected = expected.replace(from, to)
      }
      const now = name === '0006-export.md' ? '0011-export.md' : name
      expect(await fs.readText(`docs/adr/${now}`), name).toBe(expected)
    }
    expect(await fs.readText('docs/adr/0006-export.md')).toBeUndefined()
  })
})
