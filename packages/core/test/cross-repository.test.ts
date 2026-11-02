import { describe, expect, it } from 'vitest'
import {
  applyChangeSet,
  memoryFileSystem,
  openRepository,
  outsideReference,
  outsideTo,
  planEditMetadata,
  planRepair,
  repairsOf
} from '../src'

// docs/file-format.md, section 3, "Across repositories"; docs/plan-roadmap.md, part 13

const adr = (...frontmatter: string[]): string =>
  ['---', ...frontmatter, '---', '', '# Title', ''].join('\n')

describe('Relations across repositories (docs/file-format.md, section 3)', () => {
  it('reads a reference to another repository by its name, a colon and the ADR as it names it', () => {
    expect(outsideReference('payments:docs/adr/0003-ledger')).toEqual({
      repository: 'payments',
      log: 'docs/adr',
      id: '0003-ledger'
    })
    expect(outsideReference('payments:./0001-x')).toEqual({
      repository: 'payments',
      log: '',
      id: '0001-x'
    })
    expect(outsideTo('payments', 'docs/adr', '0003-ledger')).toBe('payments:docs/adr/0003-ledger')
    expect(outsideTo('payments', '', '0001-x')).toBe('payments:./0001-x')
    // An ID of this repository, or of another log of it, is none.
    for (const reference of [
      '0003-ledger',
      'docs/adr/0003-ledger',
      ':docs/adr/0001-x',
      '-x:0001-y'
    ]) {
      expect(outsideReference(reference)).toBeUndefined()
    }
  })

  it('takes depends-on and relates-to across as written, and nothing else', async () => {
    const fs = memoryFileSystem({
      'docs/adr/0001-a.md': adr(
        'status: accepted',
        'depends-on: [payments:docs/adr/0003-ledger]',
        'relates-to: [billing:./0001-x]'
      ),
      'docs/adr/0002-b.md': adr('status: proposed', 'supersedes: [payments:docs/adr/0003-ledger]'),
      'docs/adr/0003-c.md': adr('status: accepted', 'superseded-by: [payments:docs/adr/0004-y]')
    })
    const repository = await openRepository(fs)
    const [log] = repository.logs
    expect(log!.relations).toEqual([])
    expect(log!.problems).toEqual([
      {
        kind: 'other-repository',
        adr: '0002-b',
        key: 'supersedes',
        target: 'payments:docs/adr/0003-ledger'
      },
      {
        kind: 'other-repository',
        adr: '0003-c',
        key: 'superseded-by',
        target: 'payments:docs/adr/0004-y'
      }
    ])

    // The Repair takes the item out, where it stands.
    const [repair] = repairsOf(log!, log!.problems[0]!)
    expect(repair).toEqual({
      kind: 'remove-item',
      adr: '0002-b',
      key: 'supersedes',
      item: 'payments:docs/adr/0003-ledger'
    })
    const plan = await planRepair(fs, log!, repair!)
    expect(plan.ok).toBe(true)
    if (plan.ok) await applyChangeSet(fs, plan.changeSet)
    expect(await fs.readText('docs/adr/0002-b.md')).toBe(adr('status: proposed'))
  })

  it('adds an ADR of another repository to depends-on and relates-to, and nowhere else', async () => {
    const fs = memoryFileSystem({ 'docs/adr/0001-a.md': adr('status: proposed') })
    const [log] = (await openRepository(fs)).logs
    const added = await planEditMetadata(fs, log!, '0001-a', {
      relations: { 'relates-to': ['payments:docs/adr/0003-ledger'] }
    })
    expect(added.ok).toBe(true)
    if (added.ok) {
      expect(added.changeSet.files[0]!.after).toBe(
        adr('status: proposed', 'relates-to: [payments:docs/adr/0003-ledger]')
      )
    }
    const superseding = await planEditMetadata(fs, log!, '0001-a', {
      relations: { supersedes: ['payments:docs/adr/0003-ledger'] }
    })
    expect(superseding.ok).toBe(false)
  })
})
