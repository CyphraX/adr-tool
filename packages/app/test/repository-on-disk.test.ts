import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { openRepository } from '@adr-tool/core'
import { nodeFileSystem } from '../src/main/node-file-system'
import { Repositories } from '../src/main/repositories'
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
      'proposed',
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

  it('stays inside its root, whatever path it is handed', async () => {
    const fs = nodeFileSystem(join(showcase, 'docs'))
    for (const path of ['../../own/0001-crlf-and-foreign-keys.md', '/etc/hostname']) {
      expect(await fs.readText(path)).toBeUndefined()
    }
    expect(await fs.list('..')).toBeUndefined()
    await expect(fs.writeText('../escaped.md', 'x')).rejects.toThrow('../escaped.md')
    await expect(fs.rename('adr/0001-modular-monolith.md', '../moved.md')).rejects.toThrow(
      '../moved.md'
    )
    expect(await fs.readText('adr/0001-modular-monolith.md')).toContain('# ')
  })

  it('does not follow a symbolic link out of its root, to read or to write', async () => {
    const scratch = mkdtempSync(join(tmpdir(), 'adr-links-'))
    try {
      const outside = join(scratch, 'outside')
      const root = join(scratch, 'repo')
      mkdirSync(outside)
      mkdirSync(join(root, 'docs/adr'), { recursive: true })
      writeFileSync(join(outside, 'secret.md'), 'secret')
      writeFileSync(join(root, 'docs/adr/0001-a.md'), '# A\n')
      symlinkSync(join(outside, 'secret.md'), join(root, 'docs/adr/0002-leak.md'))
      symlinkSync(outside, join(root, 'docs/out'))
      symlinkSync(join(root, 'docs/adr/0001-a.md'), join(root, 'docs/adr/0003-same.md'))
      const fs = nodeFileSystem(root)

      expect(await fs.readText('docs/adr/0002-leak.md')).toBeUndefined()
      expect(await fs.list('docs/out')).toBeUndefined()
      expect((await fs.list('docs/adr'))?.map((entry) => entry.name).sort()).toEqual([
        '0001-a.md',
        '0003-same.md'
      ])
      expect(await fs.readText('docs/adr/0003-same.md')).toBe('# A\n')
      await expect(fs.writeText('docs/adr/0002-leak.md', 'x')).rejects.toThrow('outside')
      await expect(fs.writeText('docs/out/new/0009-x.md', 'x')).rejects.toThrow('outside')
      await expect(fs.rename('docs/adr/0001-a.md', 'docs/out/moved.md')).rejects.toThrow('outside')
      expect(readFileSync(join(outside, 'secret.md'), 'utf8')).toBe('secret')
      await fs.writeText('docs/adr/new/0004-b.md', '# B\n')
      expect(await fs.readText('docs/adr/new/0004-b.md')).toBe('# B\n')
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  it('writes nothing through a symbolic link to nothing, and reads a loop of links as absent', async () => {
    const scratch = mkdtempSync(join(tmpdir(), 'adr-links-'))
    try {
      const outside = join(scratch, 'outside')
      const root = join(scratch, 'repo')
      mkdirSync(outside)
      mkdirSync(join(root, 'docs/adr'), { recursive: true })
      writeFileSync(join(root, 'docs/adr/0001-a.md'), '# A\n')
      // A file that is not there yet: writing through the link would create it outside.
      symlinkSync(join(outside, 'pwned.md'), join(root, 'docs/adr/0002-use-kafka.md'))
      symlinkSync('loop.md', join(root, 'docs/adr/loop.md'))
      const fs = nodeFileSystem(root)

      await expect(fs.writeText('docs/adr/0002-use-kafka.md', 'x')).rejects.toThrow(
        'docs/adr/0002-use-kafka.md is a symbolic link that leads nowhere: it is not written.'
      )
      expect(existsSync(join(outside, 'pwned.md'))).toBe(false)
      expect(await fs.readText('docs/adr/loop.md')).toBeUndefined()
      expect((await fs.list('docs/adr'))?.map((entry) => entry.name)).toEqual(['0001-a.md'])
      expect((await openRepository(fs)).logs[0]!.adrs).toHaveLength(1)
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  it('starts the first Decision Log where the configuration says', async () => {
    const root = mkdtempSync(join(tmpdir(), 'adr-first-'))
    const repositories = new Repositories(() => undefined)
    try {
      writeFileSync(join(root, '.adr-dir'), 'doc/architecture/decisions\n')
      const { id } = await repositories.open(root)
      const planned = await repositories.planCreate({
        repositoryId: id,
        logPath: undefined,
        title: 'Record decisions',
        template: 'minimal'
      })
      expect(planned.ok && planned.change.changeSet.files.map((file) => file.path)).toEqual([
        'doc/architecture/decisions/0001-record-decisions.md'
      ])
    } finally {
      await repositories.closeAll()
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('is watched at its Decision Logs and where new ones can appear, never as a whole tree', async () => {
    const repository = await openRepository(nodeFileSystem(showcase))
    expect(watchPaths(showcase, repository)).toEqual(
      [
        showcase,
        join(showcase, '.adr'),
        join(showcase, '.arch'),
        join(showcase, 'doc'),
        join(showcase, 'docs'),
        join(showcase, 'docs/adr')
      ].sort()
    )
  })
})
