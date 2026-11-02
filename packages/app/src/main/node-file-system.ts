import { constants } from 'node:fs'
import {
  copyFile,
  link,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rmdir,
  stat,
  unlink
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
 * The file system below `root`, as `core` wants to see it. The main process is the only one with
 * disk access, and this is where it touches the disk: a path that would lead out of `root` —
 * with `..`, absolute, or through a symbolic link — is no file of the repository, whoever handed
 * it in. Only regular files and directories are.
 */
export function nodeFileSystem(root: string): WritableFileSystem {
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
    writeText: async (path, text, options) => {
      const full = await writable(path)
      const like = options?.like === undefined ? undefined : await real(options.like)
      const mode = like === undefined ? undefined : (await stat(like).catch(missing))?.mode
      await mkdir(dirname(full), { recursive: true })
      const file = await open(full, 'w')
      try {
        await file.writeFile(text, 'utf8')
        if (mode !== undefined) await file.chmod(mode & 0o7777)
        // On the disk, not in a cache: a rename that puts it in place must not outlive its text.
        await file.sync()
      } finally {
        await file.close()
      }
    },
    // A file that stands where a symbolic link inside the repository leads is replaced
    // there, as a write through the link would; the link stays.
    rename: async (from, to) => {
      const source = await writable(from)
      const target = (await real(to)) ?? (await writable(to))
      await renameWaiting(source, target)
      await syncDirectory(dirname(target))
    },
    link: async (from, to) => {
      const source = await real(from)
      if (source === undefined) throw new Error(`${from} is not a file of the repository.`)
      const target = await writable(to)
      // Where there is no hard link, a copy: file systems without them say so in many ways —
      // EPERM, ENOTSUP, EXDEV, and EISDIR from FAT and exFAT on Windows. Only a name that is
      // taken is no reason to copy.
      await link(source, target).catch(async (error: unknown) => {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw error
        await copyFile(source, target, constants.COPYFILE_EXCL)
      })
    },
    remove: async (path) => {
      await unlink(await writable(path)).catch(missing)
    },
    removeDirectory: async (path) => {
      await rmdir(await writable(path))
    }
  }
}

/** What Windows says while another program — a virus scanner, the search indexer — holds a file a moment. */
const BUSY = new Set(['EPERM', 'EACCES', 'EBUSY'])

/**
 * A rename. On Windows, a file that was just written is often held open for a moment by a
 * virus scanner or the search indexer, and a rename of it refused; it is tried again for up
 * to two seconds, as graceful-fs does. A read-only file stays refused, and nothing is written.
 */
async function renameWaiting(from: string, to: string): Promise<void> {
  const start = Date.now()
  for (let wait = 10; ; wait = Math.min(wait + 10, 100)) {
    try {
      await rename(from, to)
      return
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? ''
      if (process.platform !== 'win32' || !BUSY.has(code) || Date.now() - start > 2000) throw error
      await new Promise((resolve) => setTimeout(resolve, wait))
    }
  }
}

/**
 * Make a rename in `directory` durable. Windows cannot open a directory for this and needs
 * it less; where it fails, the rename is still done.
 */
async function syncDirectory(directory: string): Promise<void> {
  if (process.platform === 'win32') return
  const handle = await open(directory, 'r').catch(() => undefined)
  if (!handle) return
  await handle.sync().catch(() => undefined)
  await handle.close()
}
