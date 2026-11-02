import { readFile, readdir, realpath, stat } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import type { FileSystem } from '@adr-tool/core'

/** Whether `path` is `root` or lies below it. Both are absolute. */
export function within(root: string, path: string): boolean {
  const rest = relative(root, path)
  return rest === '' || (!rest.startsWith('..') && !isAbsolute(rest))
}

/**
 * The repository below `root`, as `core` reads it, and nothing else: the command never writes,
 * and a path that would lead out of `root` — with `..`, absolute, or through a symbolic link —
 * is no file of the repository. Only regular files and directories are; a file that is there
 * and cannot be read is told to `warn` and left out, the check goes on.
 */
export function repositoryFiles(root: string, warn: (text: string) => void = () => {}): FileSystem {
  const base = resolve(root)
  let realBase: Promise<string> | undefined

  const failed =
    (path: string) =>
    (error: unknown): undefined => {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT' && code !== 'ENOTDIR') {
        warn(`${path} cannot be read (${code ?? String(error)}) and is left out.`)
      }
      return undefined
    }
  /** Where `path` really is, when that is inside the repository. */
  const real = async (path: string): Promise<string | undefined> => {
    const full = resolve(base, path)
    if (!within(base, full)) return undefined
    realBase ??= realpath(base)
    const target = await realpath(full).catch(failed(path))
    return target !== undefined && within(await realBase, target) ? target : undefined
  }
  const kindOf = async (path: string): Promise<'file' | 'directory' | undefined> => {
    const target = await real(path)
    const info = target === undefined ? undefined : await stat(target).catch(failed(path))
    return info?.isFile() ? 'file' : info?.isDirectory() ? 'directory' : undefined
  }

  return {
    readText: async (path) => {
      const target = (await kindOf(path)) === 'file' ? await real(path) : undefined
      return target === undefined ? undefined : readFile(target, 'utf8').catch(failed(path))
    },
    list: async (path) => {
      if ((await kindOf(path)) !== 'directory') return undefined
      const entries = await readdir((await real(path))!, { withFileTypes: true }).catch(
        failed(path)
      )
      if (entries === undefined) return undefined
      const listed = await Promise.all(
        entries.map(async (entry) => {
          const kind = entry.isDirectory()
            ? 'directory'
            : entry.isFile()
              ? 'file'
              : entry.isSymbolicLink()
                ? await kindOf(join(path, entry.name))
                : undefined
          return kind === undefined ? undefined : { name: entry.name, kind }
        })
      )
      return listed.filter((entry) => entry !== undefined)
    }
  }
}
