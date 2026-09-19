import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { FileSystem } from '@adr-tool/core'

/** The file system below `root`, as `core` wants to see it. The main process is the only one with disk access. */
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
