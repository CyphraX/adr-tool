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
