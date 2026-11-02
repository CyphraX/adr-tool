/**
 * The file system as `core` sees it. `core` never touches the disk itself: the app, the
 * CLI and the tests each plug in their own implementation.
 *
 * Paths are relative to the repository root and use forward slashes on every platform,
 * e.g. `docs/adr/0001-first.md`. The root itself is the empty string.
 */
export interface FileSystem {
  /** The text of a file, or `undefined` when there is no such file. */
  readText(path: string): Promise<string | undefined>
  /** The entries of a directory in no particular order, or `undefined` when there is no such directory. */
  list(path: string): Promise<DirectoryEntry[] | undefined>
}

/**
 * A file system that can be written to. Reading a repository only ever takes a
 * `FileSystem`, so that it cannot write; applying a change set takes this, and builds
 * an all-or-nothing write out of these steps (`applyChangeSet`).
 */
export interface WritableFileSystem extends FileSystem {
  /**
   * Write a file, creating it and its directories when they do not exist. When the promise
   * resolves, the text is on the disk and not only in a cache. With `like`, the file takes
   * the permissions of that existing one: a new text that is to replace it keeps them.
   */
  writeText(path: string, text: string, options?: { readonly like?: string }): Promise<void>
  /** Move a file in one step, replacing what is at `to`. */
  rename(from: string, to: string): Promise<void>
  /**
   * Give a file a second name, the same bytes under both: a hard link, or a copy where the
   * file system has none. Refused when something is at `to`.
   */
  link(from: string, to: string): Promise<void>
  /** Remove a file. Nothing happens when there is none. */
  remove(path: string): Promise<void>
  /** Remove a directory that is empty. Refused when it is not empty, or not a directory. */
  removeDirectory(path: string): Promise<void>
}

export interface DirectoryEntry {
  readonly name: string
  readonly kind: 'file' | 'directory'
}

export function joinPath(directory: string, name: string): string {
  return directory === '' ? name : `${directory}/${name}`
}

/**
 * Bring a path from a configuration file into the port's form. Returns `undefined` for
 * a path that is absolute or leaves the repository.
 */
export function normalizePath(path: string): string | undefined {
  const parts: string[] = []
  const trimmed = path.trim().replaceAll('\\', '/')
  if (trimmed.startsWith('/') || /^[A-Za-z]:/.test(trimmed)) return undefined
  for (const part of trimmed.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') return undefined
    parts.push(part)
  }
  return parts.join('/')
}
