import { describe, expect, it } from 'vitest'
import { joinPath, memoryFileSystem, normalizePath } from '../src'

describe('memoryFileSystem', () => {
  const fs = memoryFileSystem({
    'README.md': 'readme\n',
    'docs/adr/0001-first.md': 'first\n',
    'docs/plan.md': 'plan\n'
  })

  it('reads a file, and nothing where there is none', async () => {
    expect(await fs.readText('docs/plan.md')).toBe('plan\n')
    expect(await fs.readText('docs/nothing.md')).toBeUndefined()
  })

  it('lists files and the directories that exist by having files in them', async () => {
    const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)
    expect((await fs.list(''))!.sort(byName)).toEqual([
      { name: 'docs', kind: 'directory' },
      { name: 'README.md', kind: 'file' }
    ])
    expect((await fs.list('docs'))!.sort(byName)).toEqual([
      { name: 'adr', kind: 'directory' },
      { name: 'plan.md', kind: 'file' }
    ])
    expect(await fs.list('docs/nothing')).toBeUndefined()
  })

  it('does not take a directory for a longer name that starts the same', async () => {
    const similar = memoryFileSystem({ 'docs-old/a.md': 'a\n' })
    expect(await similar.list('docs')).toBeUndefined()
  })
})

describe('paths', () => {
  it('joins onto the root, which is the empty string', () => {
    expect(joinPath('', 'docs')).toBe('docs')
    expect(joinPath('docs', 'adr')).toBe('docs/adr')
  })

  it('brings a configured path into the form of the port', () => {
    expect(normalizePath(' ./docs\\adr/ ')).toBe('docs/adr')
    expect(normalizePath('.')).toBe('')
  })

  it('refuses a path that is absolute or leaves the repository', () => {
    for (const path of ['/etc', 'C:\\Users', 'c:/x', '../elsewhere', 'docs/../../x']) {
      expect(normalizePath(path)).toBeUndefined()
    }
  })
})
