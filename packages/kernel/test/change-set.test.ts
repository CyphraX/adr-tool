import { describe, expect, it } from 'vitest'
import { applyChangeSet, memoryFileSystem, type WritableFileSystem } from '../src'

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

  it('renames before it writes, so that a rename that fails fails before anything is written', async () => {
    const calls: string[] = []
    const memory = memoryFileSystem({ 'a.md': 'one\n', 'old.md': 'text\n' })
    const fs: WritableFileSystem = {
      readText: (path) => memory.readText(path),
      list: (path) => memory.list(path),
      async writeText(path, text) {
        calls.push(`write ${path}`)
        await memory.writeText(path, text)
      },
      async rename(from, to) {
        calls.push(`rename ${from}`)
        await memory.rename(from, to)
      }
    }
    await applyChangeSet(fs, {
      files: [
        { path: 'a.md', before: 'one\n', after: 'ONE\n' },
        { path: 'old.md', before: 'text\n', after: 'text\n', renameTo: 'new.md' }
      ]
    })
    expect(calls).toEqual(['rename old.md', 'write a.md'])
  })
})
