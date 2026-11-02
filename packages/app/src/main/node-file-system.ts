import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import type { WritableFileSystem } from '@adr-tool/core'

/**
 * The file system below `root`, as `core` wants to see it. The main process is the only one with
 * disk access, and this is where it touches the disk: a path that would lead out of `root` —
 * with `..`, or absolute — is no file of the repository, whoever handed it in.
 */
export function nodeFileSystem(root: string): WritableFileSystem {
  const base = resolve(root)
  const inside = (path: string): string | undefined => {
    const full = resolve(base, path)
    return full === base || full.startsWith(base + sep) ? full : undefined
  }
  const writable = (path: string): string => {
    const full = inside(path)
    if (full === undefined) throw new Error(`${path} lies outside the repository.`)
    return full
  }
  const missing = (error: unknown): undefined => {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'ENOTDIR') return undefined
    throw error
  }
  return {
    readText: async (path) => {
      const full = inside(path)
      return full === undefined ? undefined : readFile(full, 'utf8').catch(missing)
    },
    list: async (path) => {
      const full = inside(path)
      if (full === undefined) return undefined
      return readdir(full, { withFileTypes: true })
        .then((entries) =>
          entries.map((entry) => ({
            name: entry.name,
            kind: entry.isDirectory() ? ('directory' as const) : ('file' as const)
          }))
        )
        .catch(missing)
    },
    writeText: async (path, text) => {
      const full = writable(path)
      await mkdir(dirname(full), { recursive: true })
      await writeFile(full, text, 'utf8')
    },
    rename: async (from, to) => rename(writable(from), writable(to))
  }
}
