import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  applyChangeSet,
  openRepository,
  type ChangeSet,
  type WritableFileSystem
} from '@adr-tool/core'
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

/** Every file below `root` with its bytes; a symbolic link as what it points to. */
function everything(root: string, directory = ''): Record<string, string> {
  const files: Record<string, string> = {}
  for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
    const path = directory === '' ? entry.name : `${directory}/${entry.name}`
    if (entry.isDirectory()) Object.assign(files, everything(root, path))
    else if (entry.isSymbolicLink()) files[path] = `-> ${readlinkSync(join(root, path))}`
    else files[path] = readFileSync(join(root, path)).toString('base64')
  }
  return files
}

/** The file system of the main process, refusing the `failing`-th step that writes. */
function failingAt(root: string, failing: number): WritableFileSystem & { steps: () => number } {
  const fs = nodeFileSystem(root)
  let steps = 0
  const step = (): void => {
    if (++steps === failing) throw new Error('ENOSPC: no space left on device')
  }
  return {
    ...fs,
    steps: () => steps,
    writeText: async (path, text, options) => {
      step()
      await fs.writeText(path, text, options)
    },
    link: async (from, to) => {
      step()
      await fs.link(from, to)
    },
    rename: async (from, to) => {
      step()
      await fs.rename(from, to)
    }
  }
}

describe('a change set applied on disk', () => {
  const files = {
    'docs/adr/0001-a.md': '---\nstatus: proposed\n---\n\n# A\n',
    'docs/adr/0002-b.md': '# B — ä\r\n',
    'docs/adr/0003-c.md': '# C\n'
  }
  // Each kind of file a change set has: one that changes, one that is created in a directory
  // that is not there yet, one that moves and changes — a Renumber —, and one that only moves.
  const change: ChangeSet = {
    files: [
      {
        path: 'docs/adr/0001-a.md',
        before: files['docs/adr/0001-a.md'],
        after: '---\nstatus: accepted\n---\n\n# A\n'
      },
      { path: 'docs/new/0001-x.md', before: '', after: '# X\n', creates: true },
      {
        path: 'docs/adr/0002-b.md',
        before: files['docs/adr/0002-b.md'],
        after: '# B — ä, 12\r\n',
        renameTo: 'docs/adr/0012-b.md'
      },
      {
        path: 'docs/adr/0003-c.md',
        before: '# C\n',
        after: '# C\n',
        renameTo: 'docs/adr/0013-c.md'
      }
    ]
  }

  function scratch(): string {
    const root = mkdtempSync(join(tmpdir(), 'adr-apply-'))
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true })
      writeFileSync(join(root, path), text)
    }
    return root
  }

  it('writes every file, keeps their permissions, and leaves nothing beside them', async () => {
    const root = scratch()
    try {
      chmodSync(join(root, 'docs/adr/0001-a.md'), 0o640)
      expect(await applyChangeSet(nodeFileSystem(root), change)).toEqual({ applied: true })
      expect(Object.keys(everything(root)).sort()).toEqual([
        'docs/adr/0001-a.md',
        'docs/adr/0012-b.md',
        'docs/adr/0013-c.md',
        'docs/new/0001-x.md'
      ])
      expect(readFileSync(join(root, 'docs/adr/0012-b.md'), 'utf8')).toBe('# B — ä, 12\r\n')
      expect(readFileSync(join(root, 'docs/adr/0001-a.md'), 'utf8')).toContain('accepted')
      if (process.platform !== 'win32') {
        expect(statSync(join(root, 'docs/adr/0001-a.md')).mode & 0o777).toBe(0o640)
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('leaves every byte as it was, and nothing beside the files, whichever step fails', async () => {
    const counted = scratch()
    let steps = 0
    try {
      const counting = failingAt(counted, 0)
      await applyChangeSet(counting, change)
      steps = counting.steps()
    } finally {
      rmSync(counted, { recursive: true, force: true })
    }
    // Three new texts, one second name, five renames.
    expect(steps).toBe(9)
    for (let failing = 1; failing <= steps; failing++) {
      const root = scratch()
      try {
        const before = everything(root)
        const applied = await applyChangeSet(failingAt(root, failing), change)
        expect(applied, `step ${failing}`).toEqual({
          applied: false,
          failed: 'ENOSPC: no space left on device',
          stranded: []
        })
        expect(everything(root), `step ${failing}`).toEqual(before)
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    }
  })

  it('writes nothing when the disk itself refuses a step', async () => {
    const root = scratch()
    try {
      const before = everything(root)
      // A file stands where the new ADR's directory would have to be.
      const blocked: ChangeSet = {
        files: [
          change.files[0]!,
          { path: 'docs/adr/0003-c.md/0009-y.md', before: '', after: '# Y\n', creates: true }
        ]
      }
      const applied = await applyChangeSet(nodeFileSystem(root), blocked)
      expect(applied).toMatchObject({ applied: false, stranded: [] })
      expect(everything(root)).toEqual(before)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it.skipIf(process.platform === 'win32')(
    'replaces the file a symbolic link inside the repository leads to, and keeps the link',
    async () => {
      const root = scratch()
      try {
        symlinkSync('0003-c.md', join(root, 'docs/adr/0004-same.md'))
        const applied = await applyChangeSet(nodeFileSystem(root), {
          files: [{ path: 'docs/adr/0004-same.md', before: '# C\n', after: '# C, linked\n' }]
        })
        expect(applied).toEqual({ applied: true })
        expect(lstatSync(join(root, 'docs/adr/0004-same.md')).isSymbolicLink()).toBe(true)
        expect(readFileSync(join(root, 'docs/adr/0003-c.md'), 'utf8')).toBe('# C, linked\n')
        expect(Object.keys(everything(root)).sort()).toEqual([
          'docs/adr/0001-a.md',
          'docs/adr/0002-b.md',
          'docs/adr/0003-c.md',
          'docs/adr/0004-same.md'
        ])
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    }
  )
})
