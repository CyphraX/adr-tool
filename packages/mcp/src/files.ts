import {
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  stat,
  writeFile
} from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import type { WritableFileSystem } from '@adr-tool/core'

/** Whether `path` is `root` or lies below it. Both are absolute. */
const within = (root: string, path: string): boolean => {
  const rest = relative(root, path)
  return rest === '' || (!rest.startsWith('..') && !isAbsolute(rest))
}

/** Not there, as far as reading goes: gone, not a directory, a loop of links, not readable. */
const missing = (error: unknown): undefined => {
  const code = (error as NodeJS.ErrnoException).code
  if (code === 'ENOENT' || code === 'ENOTDIR' || code === 'ELOOP' || code === 'EACCES') {
    return undefined
  }
  throw error
}

/**
 * The repository below `root`, as `core` reads and writes it, and nothing else: a path that
 * would lead out of `root` — with `..`, absolute, or through a symbolic link — is no file of
 * the repository, whatever an agent asks for. Only regular files and directories are. The same
 * rules as the app's main process (packages/app/src/main/node-file-system.ts).
 */
export function repositoryFiles(root: string): WritableFileSystem {
  const base = resolve(root)
  let realBase: Promise<string> | undefined
  const baseReally = (): Promise<string> => (realBase ??= realpath(base))

  /** Where `path` really is, when it is there and inside the repository. */
  const real = async (path: string): Promise<string | undefined> => {
    const full = resolve(base, path)
    if (!within(base, full)) return undefined
    const target = await realpath(full).catch(missing)
    return target !== undefined && within(await baseReally(), target) ? target : undefined
  }
  const kindOf = async (path: string): Promise<'file' | 'directory' | undefined> => {
    const target = await real(path)
    const info = target === undefined ? undefined : await stat(target).catch(missing)
    return info?.isFile() ? 'file' : info?.isDirectory() ? 'directory' : undefined
  }
  /** `path` to write: it, or the nearest directory above it that is there, is inside. */
  const writable = async (path: string): Promise<string> => {
    const full = resolve(base, path)
    const outside = new Error(`${path} lies outside the repository.`)
    if (!within(base, full)) throw outside
    for (let probe = full; ; probe = dirname(probe)) {
      const target = await realpath(probe).catch(missing)
      if (target !== undefined) {
        if (!within(await baseReally(), target)) throw outside
        return full
      }
      // There and still not found: a symbolic link to nothing, which a write would follow
      // wherever it points.
      if ((await lstat(probe).catch(missing)) !== undefined) {
        throw new Error(`${path} is a symbolic link that leads nowhere: it is not written.`)
      }
      if (dirname(probe) === probe) throw outside
    }
  }

  return {
    readText: async (path) => {
      const target = (await kindOf(path)) === 'file' ? await real(path) : undefined
      return target === undefined ? undefined : readFile(target, 'utf8').catch(missing)
    },
    list: async (path) => {
      if ((await kindOf(path)) !== 'directory') return undefined
      const entries = await readdir((await real(path))!, { withFileTypes: true }).catch(missing)
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
    },
    writeText: async (path, text) => {
      const full = await writable(path)
      await mkdir(dirname(full), { recursive: true })
      await writeFile(full, text, 'utf8')
    },
    rename: async (from, to) => rename(await writable(from), await writable(to))
  }
}
