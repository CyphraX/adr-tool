import { describe, expect, it } from 'vitest'
import { branchChanges, memoryFileSystem, numberTakenOn, openRepository } from '../src'

const adr = (status: string, title = 'Title'): string =>
  ['---', `status: ${status}`, '---', '', `# ${title}`, ''].join('\n')

const open = (files: Record<string, string>) => openRepository(memoryFileSystem(files))

const MAIN = {
  'docs/adr/0001-first.md': adr('accepted', 'First'),
  'docs/adr/0002-second.md': adr('proposed', 'Second')
}

describe('What a branch did to the ADRs (docs/plan-roadmap.md, part 8)', () => {
  it('lists an ADR the branch added, with what the overview shows of it', async () => {
    const here = await open(MAIN)
    const branch = await open({ ...MAIN, 'docs/adr/0003-kafka.md': adr('proposed', 'Use Kafka') })

    expect(branchChanges(branch, here, here)).toEqual([
      {
        log: 'docs/adr',
        id: '0003-kafka',
        path: 'docs/adr/0003-kafka.md',
        number: 3,
        title: 'Use Kafka',
        status: 'proposed',
        change: 'added',
        sameNumber: []
      }
    ])
  })

  it('lists an ADR the branch gave another Status, with the Status of the working tree', async () => {
    const here = await open(MAIN)
    const branch = await open({ ...MAIN, 'docs/adr/0002-second.md': adr('accepted', 'Second') })

    expect(branchChanges(branch, here, here)).toEqual([
      expect.objectContaining({
        id: '0002-second',
        change: 'status',
        status: 'accepted',
        statusHere: 'proposed'
      })
    ])
  })

  it('leaves out what the working tree removed or renamed since the branch began', async () => {
    const base = await open(MAIN)
    // The working tree renumbered 0002 to 0003; the branch still has it as it was.
    const here = await open({
      'docs/adr/0001-first.md': MAIN['docs/adr/0001-first.md'],
      'docs/adr/0003-second.md': MAIN['docs/adr/0002-second.md']
    })
    const branch = await open(MAIN)

    expect(branchChanges(branch, here, base)).toEqual([])
    // Without the merge base, the branch would seem to add it.
    expect(branchChanges(branch, here, undefined).map((adr) => adr.id)).toEqual(['0002-second'])
  })

  it('leaves out what the working tree has already, as the branch has it', async () => {
    const base = await open(MAIN)
    const added = { 'docs/adr/0003-kafka.md': adr('proposed', 'Use Kafka') }
    const here = await open({ ...MAIN, ...added })
    const branch = await open({ ...MAIN, ...added })

    expect(branchChanges(branch, here, base)).toEqual([])
  })

  it('says which ADR of the working tree has the same number', async () => {
    const base = await open(MAIN)
    const here = await open({ ...MAIN, 'docs/adr/0003-postgres.md': adr('proposed', 'Postgres') })
    const branch = await open({ ...MAIN, 'docs/adr/0003-kafka.md': adr('proposed', 'Kafka') })

    expect(branchChanges(branch, here, base)).toEqual([
      expect.objectContaining({ id: '0003-kafka', change: 'added', sameNumber: ['0003-postgres'] })
    ])
  })

  it('lists the ADRs of a Decision Log that only the branch has', async () => {
    const here = await open(MAIN)
    const branch = await open({
      ...MAIN,
      '.adr/config.yml': 'logs:\n  - path: docs/adr\n  - path: services/billing/adr\n',
      'services/billing/adr/0001-invoices.md': adr('proposed', 'Invoices')
    })

    expect(branchChanges(branch, here, here)).toEqual([
      expect.objectContaining({ log: 'services/billing/adr', id: '0001-invoices', change: 'added' })
    ])
  })

  it('gives an ADR of a log named by date no number', async () => {
    const dated = { 'docs/adr/20240101-first.md': adr('accepted') }
    const here = await open(dated)
    const branch = await open({ ...dated, 'docs/adr/20250101-second.md': adr('proposed') })

    const [change] = branchChanges(branch, here, here)
    expect(change).toMatchObject({ id: '20250101-second', sameNumber: [] })
    expect(change).not.toHaveProperty('number')
  })
})

describe('A number another branch takes', () => {
  const branches = [
    {
      name: 'feature/kafka',
      adrs: [
        {
          log: 'docs/adr',
          id: '0010-kafka',
          path: 'docs/adr/0010-kafka.md',
          number: 10,
          change: 'added' as const,
          sameNumber: []
        },
        {
          log: 'docs/adr',
          id: '0004-old',
          path: 'docs/adr/0004-old.md',
          number: 4,
          change: 'status' as const,
          sameNumber: []
        }
      ]
    },
    { name: 'origin/feature/kafka', adrs: [] }
  ]

  it('names the branch and the ADR that have the number', () => {
    expect(numberTakenOn(branches, 'docs/adr', '0010-postgres', 10)).toEqual([
      { branch: 'feature/kafka', id: '0010-kafka' }
    ])
  })

  it('finds nothing for the same ADR, another log, or an ADR the working tree has', () => {
    expect(numberTakenOn(branches, 'docs/adr', '0010-kafka', 10)).toEqual([])
    expect(numberTakenOn(branches, 'docs/decisions', '0010-postgres', 10)).toEqual([])
    expect(numberTakenOn(branches, 'docs/adr', '0004-new', 4)).toEqual([])
  })
})
