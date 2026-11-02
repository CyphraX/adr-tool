import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { applyChangeSet, memoryFileSystem } from '@adr-tool/kernel'
import {
  driftOf,
  driftWording,
  hasRepair,
  openDiagrams,
  planRepair,
  problemsOf,
  readDiagram,
  suggestConnections,
  wordingOf,
  type Diagram
} from '../src'
import { analysedAt } from './repository'

// A shop whose Diagrams differ from its code on purpose (test/fixtures/shop). What it shows is
// pinned here.
const root = fileURLToPath(new URL('fixtures/shop/', import.meta.url))

async function shop() {
  const repository = await analysedAt(root)
  const { diagrams, problems } = await openDiagrams(repository.fs)
  expect(problems).toEqual([])
  const byId = new Map(
    diagrams.map((diagram) => {
      if (!diagram.readable) throw new Error(wordingOf(diagram.problems[0]))
      return [diagram.id, diagram] as const
    })
  )
  return { ...repository, diagram: (id: string): Diagram => byId.get(id)! }
}

const pairs = (list: readonly { from: string; to: string }[]): string[] =>
  list.map(({ from, to }) => `${from} > ${to}`)

describe('the container view of the shop', () => {
  it('suggests the connections the code has between the Components it shows', async () => {
    const { structure, dependencies, notResolved, diagram } = await shop()
    expect(structure.origin).toBe('declared')
    expect(notResolved).toEqual([])
    const suggested = suggestConnections(diagram('containers'), structure, dependencies)
    expect(
      suggested.map(
        (one) =>
          `${one.from} > ${one.to} ${one.weight}${one.typeOnly ? ' (type)' : ''}${one.drawn ? ' drawn' : ''}`
      )
    ).toEqual([
      // The Dependencies of billing's children count for billing, which the Diagram shows.
      'billing > persistence 1 drawn',
      'web > billing 1 drawn',
      'web > persistence 1'
    ])
    expect(suggested[0]!.dependencies).toEqual([
      {
        from: 'src/billing/invoices/invoice.ts',
        to: 'src/persistence/store.ts',
        typeOnly: false,
        lines: [1]
      }
    ])
  })

  it('reports the connection drawn on purpose, and the Dependency left out, as Drift', async () => {
    const { structure, dependencies, diagram } = await shop()
    const drift = driftOf(diagram('containers'), structure, dependencies)
    expect(drift.map((one) => `${one.kind}: ${one.from} > ${one.to}`)).toEqual([
      'connection-not-in-code: persistence > web',
      'dependency-not-in-diagram: web > persistence'
    ])
    expect(drift.map(driftWording)).toEqual([
      'The Diagram connects persistence to web, but no Source File of persistence depends on one of web.',
      'web depends on persistence in the code, through one Source File Dependency, and the Diagram does not connect them.'
    ])
    expect(drift[0]).toMatchObject({ line: 27 })
    // Only a test of persistence uses the web. Counted, the connection is in the code.
    expect(pairs(driftOf(diagram('containers'), structure, dependencies, { tests: true }))).toEqual(
      ['web > persistence']
    )
  })

  it('reports the element whose Component is gone as a Problem, with its Repair', async () => {
    const { fs, structure, diagram } = await shop()
    const containers = diagram('containers')
    const problems = problemsOf(containers, structure)
    expect(problems.map((problem) => `${problem.line}: ${wordingOf(problem)}`)).toEqual([
      '14: The Diagram shows shipping, which is not a declared Component.'
    ])
    expect(hasRepair(problems[0]!)).toBe(true)

    const repair = await planRepair(fs, problems[0]!)
    if (!repair.ok) throw new Error(repair.reason)
    const [file] = repair.changeSet.files
    expect(file!.path).toBe('docs/architecture/diagrams/containers.yml')
    // Only the lines of the element and of its connection leave the file.
    const lines = file!.before.split('\n')
    expect([lines[13], lines[14], lines[29], lines[30]]).toEqual([
      '  - component: shipping',
      '    at: [260, 160]',
      '  - from: shipping',
      '    to: persistence'
    ])
    expect(file!.after).toBe(
      lines.filter((_, index) => ![13, 14, 29, 30].includes(index)).join('\n')
    )

    // Applied, the Problem is gone and the rest is as it was.
    const copy = memoryFileSystem({ [file!.path]: file!.before })
    expect(await applyChangeSet(copy, repair.changeSet)).toEqual({ applied: true })
    const after = readDiagram(file!.path, (await copy.readText(file!.path))!)
    if (!after.readable) throw new Error('unreadable')
    expect(problemsOf(after, structure)).toEqual([])
    expect(after.elements.map((element) => element.id)).toEqual([
      'persistence',
      'billing',
      'web',
      'bank'
    ])
    expect(pairs(after.connections)).toEqual([
      'web > billing',
      'billing > persistence',
      'persistence > web',
      'billing > bank'
    ])
  })
})

describe('the other views of the shop', () => {
  it('look into billing with the Components beside it, and have no Drift', async () => {
    const { structure, dependencies, diagram } = await shop()
    const billing = diagram('billing')
    expect(problemsOf(billing, structure)).toEqual([])
    expect(
      suggestConnections(billing, structure, dependencies).map(
        (one) => `${one.from} > ${one.to}${one.typeOnly ? ' (type)' : ''}`
      )
    ).toEqual(['billing/invoices > persistence', 'billing/payments > billing/invoices (type)'])
    // A type-only Dependency counts: the Diagram does not say whether a connection is one.
    expect(driftOf(billing, structure, dependencies)).toEqual([])
  })

  it('show the shop as one box in its context, with no connection the code could have', async () => {
    const { structure, dependencies, diagram } = await shop()
    const context = diagram('context')
    expect(problemsOf(context, structure)).toEqual([])
    expect(suggestConnections(context, structure, dependencies)).toEqual([])
    expect(driftOf(context, structure, dependencies)).toEqual([])
  })
})
