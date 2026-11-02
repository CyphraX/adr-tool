import { describe, expect, it } from 'vitest'
import { memoryFileSystem, openRepository } from '@adr-tool/core'
import type { OpenRepository } from '../src/shared/ipc'
import {
  everyAdr,
  outsideCandidates,
  outsideOf,
  outsideRelations,
  problemsAcross,
  searchAll
} from '../src/renderer/src/lib/together'

// docs/plan-roadmap.md, part 13

const adr = (front: string, body: string): string => `---\n${front}\n---\n\n${body}`

async function open(
  id: string,
  name: string,
  files: Record<string, string>
): Promise<OpenRepository> {
  return {
    id,
    root: `/work/${name}`,
    name,
    repository: await openRepository(memoryFileSystem(files))
  }
}

async function twoRepositories(): Promise<OpenRepository[]> {
  return [
    await open('a', 'shop', {
      'docs/adr/0001-modular-monolith.md': adr(
        'status: accepted',
        '# Start as a modular monolith\n'
      ),
      'docs/adr/0002-payments-by-ledger.md': adr(
        'status: proposed\ndepends-on: [payments:docs/adr/0001-ledger]\nrelates-to: [billing:docs/adr/0009-x, payments:docs/adr/0042-gone]',
        '# Pay by the ledger\n\nThe shop books every payment.\n'
      )
    }),
    await open('b', 'payments', {
      'docs/adr/0001-ledger.md': adr('status: accepted', '# A ledger for every payment\n'),
      'docs/adr/0002-broken.md': adr('status: [accepted', '# Broken\n')
    })
  ]
}

describe('the repositories seen together (part 13)', () => {
  it('leads a Relation to the ADR of the other repository, and reads it from both ends', async () => {
    const repositories = await twoRepositories()
    const relations = outsideRelations(repositories)
    expect(
      relations.map((relation) => [
        relation.type,
        relation.from.adr.id,
        relation.written,
        relation.to && `${relation.to.repository}:${relation.to.adr.id}`
      ])
    ).toEqual([
      [
        'depends-on',
        '0002-payments-by-ledger',
        'payments:docs/adr/0001-ledger',
        'payments:0001-ledger'
      ],
      // A repository that is not open, and an ADR the open one does not have, lead nowhere.
      ['relates-to', '0002-payments-by-ledger', 'billing:docs/adr/0009-x', undefined],
      ['relates-to', '0002-payments-by-ledger', 'payments:docs/adr/0042-gone', undefined]
    ])
    const shop = outsideOf(relations, 'a', 'docs/adr', '0002-payments-by-ledger')
    expect([shop.outgoing.length, shop.incoming.length]).toEqual([3, 0])
    const ledger = outsideOf(relations, 'b', 'docs/adr', '0001-ledger')
    expect(ledger.outgoing).toEqual([])
    expect(ledger.incoming.map((relation) => [relation.type, relation.from.repository])).toEqual([
      ['depends-on', 'shop']
    ])
  })

  it('offers the ADRs of the other open repositories by the reference a Relation writes', async () => {
    const repositories = await twoRepositories()
    expect(outsideCandidates(repositories, 'a').map((one) => one.id)).toEqual([
      'payments:docs/adr/0001-ledger',
      'payments:docs/adr/0002-broken'
    ])
    // A repository that shares the name of the one in front, or of one before it, is not offered:
    // a reference by that name would lead elsewhere.
    const twin = await open('c', 'shop', { 'docs/adr/0001-x.md': adr('status: accepted', '# X\n') })
    expect(outsideCandidates([...repositories, twin], 'a').map((one) => one.repositoryId)).toEqual([
      'b',
      'b'
    ])
    expect(outsideCandidates([...repositories, twin], 'b').map((one) => one.repositoryId)).toEqual([
      'a',
      'a'
    ])
  })

  it('searches every open repository, the one in front first where hits tie', async () => {
    const repositories = await twoRepositories()
    const hits = searchAll(repositories, 'ledger', { repositoryId: 'b', log: 'docs/adr' })
    expect(hits.map((hit) => `${hit.repository}:${hit.adr.id}`)).toContain('payments:0001-ledger')
    expect(hits.map((hit) => `${hit.repository}:${hit.adr.id}`)).toContain(
      'shop:0002-payments-by-ledger'
    )
    expect(searchAll(repositories, 'monolith').map((hit) => hit.repositoryId)).toEqual(['a'])
  })

  it('lists every ADR and every Problem of the open repositories, by repository', async () => {
    const repositories = await twoRepositories()
    expect(everyAdr(repositories).map((one) => `${one.repository}:${one.adr.id}`)).toEqual([
      'shop:0002-payments-by-ledger',
      'shop:0001-modular-monolith',
      'payments:0002-broken',
      'payments:0001-ledger'
    ])
    const problems = problemsAcross(repositories)
    expect(problems.map((one) => [one.repository, one.count])).toEqual([
      ['shop', 0],
      ['payments', 1]
    ])
    // Each Problem leads to the ADR it is about, in its repository.
    const [broken] = problems[1]!.logs[0]!.groups
    expect(broken!.problem.kind).toBe('invalid-frontmatter')
    expect(broken!.subjects.map((one) => [one.repositoryId, one.log, one.adr.id])).toEqual([
      ['b', 'docs/adr', '0002-broken']
    ])
    // A log without Problems is left out.
    expect(problems[0]!.logs).toEqual([])
  })
})
