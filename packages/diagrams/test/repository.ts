import { link, mkdir, readFile, readdir, rename, rm, rmdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { FileSystem, WritableFileSystem } from '@adr-tool/kernel'
import { analyseDependencies, openStructure } from '@adr-tool/structure'

/** The real file system below `root`, for the tests that read a repository from the disk. */
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

/**
 * The same, writable: only for exporting this repository's own Diagrams on purpose
 * (`pnpm --filter @adr-tool/diagrams export-own`). No test writes into the repository.
 */
export function writableFileSystem(root: string): WritableFileSystem {
  const at = (path: string): string => join(root, path)
  return {
    ...nodeFileSystem(root),
    writeText: async (path, text) => {
      await mkdir(dirname(at(path)), { recursive: true })
      await writeFile(at(path), text, 'utf8')
    },
    rename: (from, to) => rename(at(from), at(to)),
    link: (from, to) => link(at(from), at(to)),
    remove: (path) => rm(at(path), { force: true }),
    removeDirectory: (path) => rmdir(at(path))
  }
}

/** Every file below `root`, as the paths of a repository: what a fixture consists of. */
export async function filesBelow(root: string, directory = ''): Promise<string[]> {
  const entries = await readdir(join(root, directory), { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const path = directory === '' ? entry.name : `${directory}/${entry.name}`
    if (entry.isDirectory()) files.push(...(await filesBelow(root, path)))
    else files.push(path)
  }
  return files
}

/** A repository on the disk, with its Components and its Dependencies, as the app would see it. */
export async function analysedAt(root: string, files?: readonly string[]) {
  const fs = nodeFileSystem(root)
  const all = files ?? (await filesBelow(root))
  const structure = await openStructure(fs, all)
  const analysis = await analyseDependencies(fs, all, structure.sourceFiles)
  return { fs, structure, analysis, ...analysis }
}
