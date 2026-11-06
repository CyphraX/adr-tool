import { constants, type Stats } from 'node:fs'
import { open, readdir, realpath, stat } from 'node:fs/promises'
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
  const infoOf = async (path: string): Promise<Stats | undefined> => {
    const target = await real(path)
    return target === undefined ? undefined : await stat(target).catch(failed(path))
  }
  const kindOf = async (path: string): Promise<'file' | 'directory' | undefined> => {
    const info = await infoOf(path)
    return info?.isFile() ? 'file' : info?.isDirectory() ? 'directory' : undefined
  }

  return {
    readText: async (path, options) => {
      const target = await real(path)
      return target === undefined
        ? undefined
        : readRegular(target, options?.atMost).catch(failed(path))
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
    },
    leadsOutside: async (path) => {
      const full = resolve(base, path)
      if (!within(base, full)) return false
      realBase ??= realpath(base)
      const target = await realpath(full).catch(() => undefined)
      return target !== undefined && !within(await realBase, target)
    }
  }
}

/**
 * The text of the regular file at `target`, opened once: what is checked is what is read. With
 * `atMost`, no more than one byte beyond it is ever read, however the file grows meanwhile. A
 * FIFO is not waited for, and a link put in the file's place is not followed.
 */
async function readRegular(
  target: string,
  atMost: number | undefined
): Promise<string | undefined> {
  const flags = constants.O_RDONLY | (constants.O_NONBLOCK ?? 0) | (constants.O_NOFOLLOW ?? 0)
  const handle = await open(target, flags).catch((error: unknown) => {
    // A directory, where it cannot be opened as a file (Windows): no file.
    if ((error as NodeJS.ErrnoException).code === 'EISDIR') return undefined
    throw error
  })
  if (handle === undefined) return undefined
  try {
    const info = await handle.stat()
    if (!info.isFile()) return undefined
    if (atMost === undefined) return await handle.readFile('utf8')
    // More than it may have: as good as not there.
    if (info.size > atMost) return undefined
    const buffer = Buffer.alloc(atMost + 1)
    let length = 0
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length)
      if (bytesRead === 0) break
      length += bytesRead
    }
    return length > atMost ? undefined : buffer.toString('utf8', 0, length)
  } finally {
    await handle.close()
  }
}
