import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { WritableFileSystem } from '@adr-tool/core'

/** The file system below `root`, as `core` wants to see it. The main process is the only one with disk access. */
export function nodeFileSystem(root: string): WritableFileSystem {
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
        .catch(missing),
    writeText: async (path, text) => {
      await mkdir(dirname(join(root, path)), { recursive: true })
      await writeFile(join(root, path), text, 'utf8')
    },
    rename: (from, to) => rename(join(root, from), join(root, to))
  }
}
