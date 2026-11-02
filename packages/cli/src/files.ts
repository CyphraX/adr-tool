import { readFile, readdir } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import type { FileSystem } from '@adr-tool/core'

/**
 * The repository below `root`, as `core` reads it, and nothing else: the command never writes,
 * and a path that would lead out of `root` is no file of the repository.
 */
export function repositoryFiles(root: string): FileSystem {
  const base = resolve(root)
  const inside = (path: string): string | undefined => {
    const full = resolve(base, path)
    return full === base || full.startsWith(base + sep) ? full : undefined
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
    }
  }
}
