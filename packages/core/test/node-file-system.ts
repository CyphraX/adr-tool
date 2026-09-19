import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { FileSystem } from '../src'

/** The real file system below `root`, for tests that read this repository. The app gets its own in M2. */
export function nodeFileSystem(root: string): FileSystem {
  const missing = (error: unknown): undefined => {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'ENOTDIR') return undefined
    throw error
  }
  return {
    readText: (path) => readFile(join(root, path), 'utf8').catch(missing),
    list: (path) =>
      readdir(join(root, path), { withFileTypes: true })
        .then((entries) =>
          entries.map((entry) => ({
            name: entry.name,
            kind: entry.isDirectory() ? ('directory' as const) : ('file' as const)
          }))
        )
        .catch(missing)
  }
}
