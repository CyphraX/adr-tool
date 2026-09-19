import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { openRepository } from '@adr-tool/core'
import { nodeFileSystem } from '../src/main/node-file-system'
import { watchPaths } from '../src/main/watch-paths'

const showcase = fileURLToPath(
  new URL('../../core/test/fixtures/showcase/', import.meta.url)
).replace(/[\\/]$/, '')

describe('a repository on disk', () => {
  it('is read through the file system the main process gives to core', async () => {
    const repository = await openRepository(nodeFileSystem(showcase))
    const [log] = repository.logs
    expect(repository.discoveredBy).toBe('default')
    expect(log!.adrs.map((adr) => adr.metadata.status)).toEqual([
      'accepted',
      'superseded',
      'rejected',
      'accepted',
      'accepted',
      'deprecated',
      'proposed'
    ])
    // The showcase carries one Problem on purpose, so that the app has one to show.
    expect(log!.problems).toEqual([
      {
        kind: 'unknown-target',
        adr: '0007-read-replica-for-reports',
        key: 'depends-on',
        target: '0011-reporting-api'
      }
    ])
  })

  it('reads a missing file and a missing directory as absent, not as an error', async () => {
    const fs = nodeFileSystem(showcase)
    expect(await fs.readText('.adr/config.yml')).toBeUndefined()
    expect(await fs.list('doc/adr')).toBeUndefined()
    expect(await fs.list('docs/adr/0001-modular-monolith.md')).toBeUndefined()
  })

  it('is watched at its Decision Logs and where new ones can appear, never as a whole tree', async () => {
    const repository = await openRepository(nodeFileSystem(showcase))
    expect(watchPaths(showcase, repository)).toEqual(
      [
        showcase,
        join(showcase, '.adr'),
        join(showcase, 'doc'),
        join(showcase, 'docs'),
        join(showcase, 'docs/adr')
      ].sort()
    )
  })
})
