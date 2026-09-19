import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { openRepository } from '../src'
import { nodeFileSystem } from './node-file-system'

const root = fileURLToPath(new URL('../../../', import.meta.url))

// The done-when of M1 (docs/plan.md). The counts are exact on purpose: a new ADR in
// docs/adr has to show up here, and a Problem in our own Decision Log fails the build.
it('reads the Decision Log of this repository without a Problem', async () => {
  const repository = await openRepository(nodeFileSystem(root))

  expect(repository.discoveredBy).toBe('default')
  expect(repository.problems).toEqual([])
  expect(repository.logs).toHaveLength(1)

  const log = repository.logs[0]!
  expect(log.path).toBe('docs/adr')
  expect(log.naming).toBe('sequential')
  expect(log.problems).toEqual([])
  expect(log.adrs.map((adr) => [adr.number, adr.id, adr.metadata.status])).toEqual([
    [1, '0001-electron-svelte-typescript-throughout', 'accepted'],
    [2, '0002-never-reserialize-markdown', 'accepted'],
    [3, '0003-on-disk-contract', 'accepted'],
    [4, '0004-operations-return-change-sets', 'accepted'],
    // Written as proposed; accepting it in the app must not break the build.
    [
      5,
      '0005-foreign-formats-are-read-never-written',
      expect.stringMatching(/^(proposed|accepted)$/)
    ]
  ])
  expect(log.adrs[1]!.title).toBe('The tool never re-serializes Markdown')
  expect(log.adrs[1]!.body.trimStart().startsWith('# The tool never re-serializes Markdown')).toBe(
    true
  )
  expect(JSON.parse(JSON.stringify(repository))).toEqual(repository)
  expect(log.adrs[0]!.metadata.decisionMakers).toHaveLength(1)
  expect(log.relations).toEqual([
    {
      type: 'relates-to',
      from: '0003-on-disk-contract',
      to: '0002-never-reserialize-markdown',
      state: 'in-effect'
    },
    {
      type: 'depends-on',
      from: '0004-operations-return-change-sets',
      to: '0002-never-reserialize-markdown',
      state: 'in-effect'
    },
    // What ADR-0005 depends on is pending until it is accepted.
    ...[
      '0002-never-reserialize-markdown',
      '0003-on-disk-contract',
      '0004-operations-return-change-sets'
    ].map((to) => ({
      type: 'depends-on',
      from: '0005-foreign-formats-are-read-never-written',
      to,
      state: log.adrs[4]!.metadata.status === 'proposed' ? 'pending' : 'in-effect'
    }))
  ])
})
