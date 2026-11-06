import { describe, expect, it } from 'vitest'
import { memoryFileSystem, openRepository } from '@adr-tool/core'
import type { ConformanceView, OpenRepository, StructureOutline } from '../src/shared/ipc'
import { repositoryProblems } from '../src/renderer/src/lib/repository-problems'

// docs/plan-vision.md, part 2: the Problems of the repository, of every module, in one list.

const adr = (front: string, title: string): string => `---\n${front}\n---\n\n# ${title}\n`

const FILES = {
  '.adr/config.yml': 'logs:\n  - path: docs/adr\n  - path: services/billing/adr\n',
  'docs/adr/0001-shared-kernel.md': adr('status: accepted\naffects: [kernel, plugins]', 'Kernel'),
  'docs/adr/0002-one-core.md': adr('status: accepted\ndepends-on: [0099-gone]', 'One core'),
  'docs/adr/0003-fine.md': adr('status: proposed\naffects: [core]', 'Fine'),
  'services/billing/adr/0001-invoices.md': adr('status: Accepted', 'Invoices')
}

async function opened(): Promise<OpenRepository> {
  const repository = await openRepository(memoryFileSystem(FILES), {
    components: ['kernel', 'core', 'core/metadata']
  })
  return { id: 'r1', root: '/r1', name: 'shop', repository }
}

const OUTLINE: StructureOutline = {
  repositoryId: 'r1',
  current: true,
  analysedAt: 0,
  origin: 'declared',
  components: [
    { id: 'kernel', name: 'kernel' },
    { id: 'core', name: 'Decisions core' },
    { id: 'core/metadata', name: 'metadata' }
  ],
  sourceFiles: [],
  problems: [
    { kind: 'dead-pattern', component: 'core/metadata', key: 'paths', pattern: 'nowhere/**' },
    {
      kind: 'overlapping-components',
      components: ['kernel', 'core'],
      files: ['packages/shared/a.ts']
    },
    { kind: 'duplicate-component', component: 'gone-twice' }
  ],
  hints: []
}

describe('the Problems of the repository', () => {
  it('list the Problems of each Decision Log by log, with the Repairs core offers', async () => {
    const problems = repositoryProblems(await opened(), {
      known: OUTLINE,
      reading: false,
      failed: undefined
    })
    expect(problems.decisions.logs.map(({ log, groups }) => [log, groups.length])).toEqual([
      ['docs/adr', 1],
      ['services/billing/adr', 1]
    ])
    const [relation] = problems.decisions.logs[0]!.groups
    expect(relation!.problem).toEqual({
      kind: 'unknown-target',
      adr: '0002-one-core',
      key: 'depends-on',
      target: '0099-gone'
    })
    expect(relation!.subjects.map((one) => [one.log, one.adr.id])).toEqual([
      ['docs/adr', '0002-one-core']
    ])
    expect(relation!.repairs).toEqual([
      { kind: 'remove-item', adr: '0002-one-core', key: 'depends-on', item: '0099-gone' }
    ])
    const [status] = problems.decisions.logs[1]!.groups
    expect(status!.problem.kind).toBe('status-not-lowercase')
    expect(status!.repairs).toEqual([{ kind: 'lowercase-status', adr: '0001-invoices' }])
  })

  it('list a Trace to a Component that is not declared apart, opening its ADR, with its Repair', async () => {
    const { traces, decisions } = repositoryProblems(await opened(), {
      known: OUTLINE,
      reading: false,
      failed: undefined
    })
    expect(traces).toHaveLength(1)
    expect(traces[0]!.problem).toEqual({
      kind: 'unknown-component',
      adr: '0001-shared-kernel',
      component: 'plugins'
    })
    expect(traces[0]!.log).toBe('docs/adr')
    expect(traces[0]!.subject?.adr.id).toBe('0001-shared-kernel')
    expect(traces[0]!.repairs).toEqual([
      { kind: 'remove-item', adr: '0001-shared-kernel', key: 'affects', item: 'plugins' }
    ])
    // Once: not among the Problems of its log as well.
    const kinds = decisions.logs.flatMap(({ groups }) => groups.map(({ problem }) => problem.kind))
    expect(kinds).not.toContain('unknown-component')
  })

  it('list the Problems of the declaration, each at the Components it names that are there', async () => {
    const { structure, count } = repositoryProblems(await opened(), {
      known: OUTLINE,
      reading: false,
      failed: undefined
    })
    expect(structure.state).toBe('known')
    if (structure.state !== 'known') return
    expect(structure.entries.map(({ components, repairable }) => [components, repairable])).toEqual(
      [
        [['core/metadata'], true],
        [['kernel', 'core'], false],
        // Its name is not among the Components: there is no page to open.
        [[], false]
      ]
    )
    expect(structure.again).toBe(false)
    // Two Decision Logs, one Trace, three of the declaration.
    expect(count).toBe(6)
  })

  it('say that Structure has not answered yet, or why it could not, and count what is known', async () => {
    const reading = repositoryProblems(await opened(), {
      known: undefined,
      reading: true,
      failed: undefined
    })
    expect(reading.structure).toEqual({ state: 'reading' })
    expect(reading.count).toBe(3)
    const failed = repositoryProblems(await opened(), {
      known: undefined,
      reading: false,
      failed: 'The analysis stopped.'
    })
    expect(failed.structure).toEqual({ state: 'failed', reason: 'The analysis stopped.' })
    // An analysis that runs again: the last one's Problems stand until the new ones are there.
    const again = repositoryProblems(await opened(), {
      known: OUTLINE,
      reading: true,
      failed: undefined
    })
    expect(again.structure.state === 'known' && again.structure.again).toBe(true)
  })

  it('offer no Repair of the declaration on a Draft, whose findings are hints', async () => {
    const { structure } = repositoryProblems(await opened(), {
      known: {
        ...OUTLINE,
        origin: 'draft',
        problems: [{ kind: 'unreadable-declaration', detail: 'not YAML' }]
      },
      reading: false,
      failed: undefined
    })
    expect(structure.state === 'known' && structure.entries).toEqual([
      {
        problem: { kind: 'unreadable-declaration', detail: 'not YAML' },
        components: [],
        repairable: false
      }
    ])
  })
})

describe('the Problems of the Rules file in the list of the repository', () => {
  const fingerprint = {
    kind: 'cycle' as const,
    rule: 'features-apart',
    cycle: ['features/a', 'features/b', 'features/c']
  }
  const view: ConformanceView = {
    repositoryId: 'r1',
    present: true,
    evaluated: true,
    origin: 'declared',
    rules: [],
    exceptions: [],
    violations: [],
    problems: [
      {
        kind: 'unmatched-exception',
        line: 14,
        fingerprint: { kind: 'dependency', rule: 'billing-not-web', from: 'billing', to: 'web' }
      },
      { kind: 'exception-unknown-rule', line: 3, rule: 'gone' }
    ],
    notes: [
      { kind: 'exception-can-shrink', line: 9, fingerprint, members: ['features/a', 'features/b'] }
    ],
    current: true,
    analysedAt: 0
  }
  const outline = { known: OUTLINE, reading: false, failed: undefined }

  it('stand in the order of their lines, with their Repairs, and a note does not count', async () => {
    const problems = repositoryProblems(await opened(), outline, {
      view,
      reading: false,
      failed: undefined
    })
    const without = repositoryProblems(await opened(), outline)
    expect(problems.count).toBe(without.count + 2)
    expect(problems.conformance).toMatchObject({ state: 'known', again: false })
    if (problems.conformance.state !== 'known') return
    expect(problems.conformance.entries.map(({ found, note }) => [found.line, note])).toEqual([
      [3, false],
      [9, true],
      [14, false]
    ])
    expect(problems.conformance.entries.map(({ repair }) => repair)).toEqual([
      undefined,
      { kind: 'narrow-exception', line: 9, fingerprint, members: ['features/a', 'features/b'] },
      {
        kind: 'remove-exception',
        line: 14,
        fingerprint: { kind: 'dependency', rule: 'billing-not-web', from: 'billing', to: 'web' }
      }
    ])
  })

  it('say that the Rules are being checked, again, or why they could not be', async () => {
    const repository = await opened()
    expect(repositoryProblems(repository, outline).conformance).toEqual({ state: 'reading' })
    expect(
      repositoryProblems(repository, outline, { view: undefined, reading: false, failed: 'gone' })
        .conformance
    ).toEqual({ state: 'failed', reason: 'gone' })
    expect(
      repositoryProblems(repository, outline, { view, reading: true, failed: undefined })
        .conformance
    ).toMatchObject({ state: 'known', again: true })
  })
})
