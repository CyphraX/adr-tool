import { describe, expect, it } from 'vitest'
import { applyChangeSet, joinChangeSets, memoryFileSystem, type WritableFileSystem } from '../src'

describe('applyChangeSet', () => {
  it('writes every file of the change set', async () => {
    const fs = memoryFileSystem({ 'a.md': 'one\n', 'b.md': 'two\n' })
    const applied = await applyChangeSet(fs, {
      files: [
        { path: 'a.md', before: 'one\n', after: 'ONE\n' },
        { path: 'b.md', before: 'two\n', after: 'TWO\n' }
      ]
    })
    expect(applied).toEqual({ applied: true })
    expect(await fs.readText('a.md')).toBe('ONE\n')
    expect(await fs.readText('b.md')).toBe('TWO\n')
  })

  it('writes nothing when one file is no longer what the change was planned against', async () => {
    const fs = memoryFileSystem({ 'a.md': 'one\n', 'b.md': 'edited elsewhere\n' })
    const applied = await applyChangeSet(fs, {
      files: [
        { path: 'a.md', before: 'one\n', after: 'ONE\n' },
        { path: 'b.md', before: 'two\n', after: 'TWO\n' }
      ]
    })
    expect(applied).toEqual({ applied: false, conflicts: ['b.md'] })
    expect(await fs.readText('a.md')).toBe('one\n')
  })

  it('creates a file, and refuses when it has appeared in the meantime', async () => {
    const change = { path: 'new.md', before: '', after: 'new\n', creates: true } as const
    const empty = memoryFileSystem({})
    expect(await applyChangeSet(empty, { files: [change] })).toEqual({ applied: true })
    expect(await empty.readText('new.md')).toBe('new\n')

    const taken = memoryFileSystem({ 'new.md': 'someone else\n' })
    expect(await applyChangeSet(taken, { files: [change] })).toEqual({
      applied: false,
      conflicts: ['new.md']
    })
    expect(await taken.readText('new.md')).toBe('someone else\n')
  })

  it('moves a file and writes its text where it went', async () => {
    const fs = memoryFileSystem({ 'old.md': 'text\n' })
    const applied = await applyChangeSet(fs, {
      files: [{ path: 'old.md', before: 'text\n', after: 'TEXT\n', renameTo: 'new.md' }]
    })
    expect(applied).toEqual({ applied: true })
    expect(await fs.readText('old.md')).toBeUndefined()
    expect(await fs.readText('new.md')).toBe('TEXT\n')
  })

  it('refuses a move onto a file that is there', async () => {
    const fs = memoryFileSystem({ 'old.md': 'text\n', 'new.md': 'in the way\n' })
    const applied = await applyChangeSet(fs, {
      files: [{ path: 'old.md', before: 'text\n', after: 'text\n', renameTo: 'new.md' }]
    })
    expect(applied).toEqual({ applied: false, conflicts: ['new.md'] })
  })

  it('writes the new texts beside the files first, and then renames them into place, moves first', async () => {
    const calls: string[] = []
    const fs = watched(memoryFileSystem({ 'a.md': 'one\n', 'old.md': 'text\n' }), (call) => {
      calls.push(`${call.step} ${call.paths.join(' ')}`)
    })
    await applyChangeSet(fs, {
      files: [
        { path: 'a.md', before: 'one\n', after: 'ONE\n' },
        { path: 'old.md', before: 'text\n', after: 'text\n', renameTo: 'new.md' }
      ]
    })
    const [token] = /\.a\.md\.(\w+)\.new/.exec(calls[0]!)!.slice(1)
    expect(calls).toEqual([
      `writeText .a.md.${token}.new`,
      `link a.md .a.md.${token}.old`,
      'rename old.md new.md',
      `rename .a.md.${token}.new a.md`,
      `remove .a.md.${token}.new`,
      `remove .a.md.${token}.old`
    ])
  })

  it('cuts the names beside a long file name, and keeps two that are cut alike apart', async () => {
    const long = (end: string): string => `docs/adr/0001-${'a'.repeat(236)}${end}.md`
    const written: string[] = []
    const fs = watched(memoryFileSystem({ [long('x')]: 'x\n', [long('y')]: 'y\n' }), (call) => {
      if (call.step === 'writeText') written.push(call.paths[0]!)
    })
    const applied = await applyChangeSet(fs, {
      files: [
        { path: long('x'), before: 'x\n', after: 'X\n' },
        { path: long('y'), before: 'y\n', after: 'Y\n' }
      ]
    })
    expect(applied).toEqual({ applied: true })
    const names = written.map((path) => path.slice(path.lastIndexOf('/') + 1))
    expect(names.every((name) => name.length < 80)).toBe(true)
    expect(new Set(names).size).toBe(2)
    expect(await fs.readText(long('y'))).toBe('Y\n')
  })

  it('keeps the permissions of a file it replaces', async () => {
    const likes: (string | undefined)[] = []
    const memory = memoryFileSystem({ 'a.md': 'one\n' })
    const fs: WritableFileSystem = {
      ...memory,
      writeText: async (path, text, options) => {
        likes.push(options?.like)
        await memory.writeText(path, text)
      }
    }
    await applyChangeSet(fs, {
      files: [
        { path: 'a.md', before: 'one\n', after: 'ONE\n' },
        { path: 'b.md', before: '', after: 'new\n', creates: true }
      ]
    })
    expect(likes).toEqual(['a.md', undefined])
  })
})

/** What `applyChangeSet` asks of the file system, step by step. */
interface Call {
  readonly step: 'writeText' | 'link' | 'rename' | 'remove'
  readonly paths: readonly string[]
  /** How many steps that write — every one but `remove` — were asked for so far, this one included. */
  readonly writes: number
}

/** A file system that tells `watch` of every step before it takes it; `watch` throws to refuse it. */
function watched(memory: WritableFileSystem, watch: (call: Call) => void): WritableFileSystem {
  let writes = 0
  const ask = (step: Call['step'], ...paths: string[]): void =>
    watch({ step, paths, writes: step === 'remove' ? writes : ++writes })
  return {
    readText: (path) => memory.readText(path),
    list: (path) => memory.list(path),
    writeText: async (path, text, options) => {
      ask('writeText', path)
      await memory.writeText(path, text, options)
    },
    link: async (from, to) => {
      ask('link', from, to)
      await memory.link(from, to)
    },
    rename: async (from, to) => {
      ask('rename', from, to)
      await memory.rename(from, to)
    },
    remove: async (path) => {
      ask('remove', path)
      await memory.remove(path)
    }
  }
}

/** Every file below the root with its text. */
async function everything(fs: WritableFileSystem, directory = ''): Promise<Record<string, string>> {
  const files: Record<string, string> = {}
  for (const entry of (await fs.list(directory)) ?? []) {
    const path = directory === '' ? entry.name : `${directory}/${entry.name}`
    if (entry.kind === 'directory') Object.assign(files, await everything(fs, path))
    else files[path] = (await fs.readText(path))!
  }
  return files
}

const full = (): Error => new Error('ENOSPC: no space left on device')

describe('applyChangeSet on a disk that fails', () => {
  const before = {
    'docs/adr/0001-a.md': 'A\n',
    'docs/adr/0002-b.md': 'B\n',
    'docs/adr/0003-c.md': 'C\n',
    'docs/adr/0004-d.md': 'D\n'
  }
  // Each kind of file a change set has: one that changes, one that is created in a directory
  // that is not there yet, one that only moves, and one that moves and changes — a Renumber.
  const change = {
    files: [
      { path: 'docs/adr/0001-a.md', before: 'A\n', after: 'A, accepted\n' },
      { path: 'docs/new/0001-x.md', before: '', after: 'X\n', creates: true as const },
      { path: 'docs/adr/0002-b.md', before: 'B\n', after: 'B\n', renameTo: 'docs/adr/0012-b.md' },
      {
        path: 'docs/adr/0003-c.md',
        before: 'C\n',
        after: 'C, 13\n',
        renameTo: 'docs/adr/0013-c.md'
      }
    ]
  }
  const after = {
    'docs/adr/0001-a.md': 'A, accepted\n',
    'docs/new/0001-x.md': 'X\n',
    'docs/adr/0012-b.md': 'B\n',
    'docs/adr/0013-c.md': 'C, 13\n',
    'docs/adr/0004-d.md': 'D\n'
  }
  const sorted = (files: Record<string, string>): [string, string][] =>
    Object.entries(files).sort(([a], [b]) => a.localeCompare(b))

  it('writes all of it when nothing fails, and leaves nothing beside the files', async () => {
    const fs = memoryFileSystem(before)
    expect(await applyChangeSet(fs, change)).toEqual({ applied: true })
    expect(sorted(await everything(fs))).toEqual(sorted(after))
  })

  it('leaves every file as it was, and nothing beside them, whichever step fails', async () => {
    let steps = 0
    await applyChangeSet(
      watched(memoryFileSystem(before), (call) => void (steps = call.writes)),
      change
    )
    // Three new texts, one second name, five renames.
    expect(steps).toBe(9)
    for (let failing = 1; failing <= steps; failing++) {
      const memory = memoryFileSystem(before)
      const fs = watched(memory, (call) => {
        if (call.step !== 'remove' && call.writes === failing) throw full()
      })
      const applied = await applyChangeSet(fs, change)
      expect(applied, `step ${failing}`).toEqual({
        applied: false,
        failed: 'ENOSPC: no space left on device',
        stranded: []
      })
      expect(sorted(await everything(memory)), `step ${failing}`).toEqual(sorted(before))
    }
  })

  it('names what it could not put back, and keeps the text each file had', async () => {
    const memory = memoryFileSystem(before)
    // The third rename fails, and so does every rename after it: the two that undo.
    let renames = 0
    const fs = watched(memory, (call) => {
      if (call.step === 'rename' && ++renames >= 3) throw new Error('EIO: i/o error')
    })
    const applied = await applyChangeSet(fs, change)
    const token = /\.0003-c\.md\.(\w+)\.old/.exec(JSON.stringify(applied))?.[1]
    expect(applied).toEqual({
      applied: false,
      failed: 'EIO: i/o error',
      stranded: [
        { path: 'docs/adr/0002-b.md', textAt: 'docs/adr/0012-b.md' },
        { path: 'docs/adr/0003-c.md', textAt: `docs/adr/.0003-c.md.${token ?? '?'}.old` }
      ]
    })
    const files = await everything(memory)
    expect(files[`docs/adr/.0003-c.md.${token}.old`]).toBe('C\n')
    expect(files['docs/adr/0012-b.md']).toBe('B\n')
    // What no file needs to be put back from is removed.
    expect(Object.keys(files).filter((path) => /\.(new|old)$/.test(path))).toEqual([
      `docs/adr/.0003-c.md.${token}.old`
    ])
  })

  it('still counts as written when what it wrote beside the files cannot be removed', async () => {
    const memory = memoryFileSystem(before)
    const fs = watched(memory, (call) => {
      if (call.step === 'remove') throw new Error('EBUSY: resource busy')
    })
    expect(await applyChangeSet(fs, change)).toEqual({ applied: true })
    const files = await everything(memory)
    for (const [path, text] of Object.entries(after)) expect(files[path]).toBe(text)
  })
})

describe('joinChangeSets', () => {
  it('puts the files of several change sets into one, in their order', () => {
    const a = { path: 'a.md', before: 'a', after: 'A' }
    const b = { path: 'b.md', before: '', after: 'b', creates: true as const }
    expect(joinChangeSets({ files: [a] }, { files: [b] })).toEqual({ files: [a, b] })
  })

  it('refuses change sets that both touch a file, or a place a file moves to', () => {
    const a = { path: 'a.md', before: 'a', after: 'A' }
    expect(() => joinChangeSets({ files: [a] }, { files: [{ ...a, after: 'AA' }] })).toThrow('a.md')
    const moved = { path: 'old.md', before: 'x', after: 'x', renameTo: 'a.md' }
    expect(() => joinChangeSets({ files: [a] }, { files: [moved] })).toThrow('a.md')
  })
})
