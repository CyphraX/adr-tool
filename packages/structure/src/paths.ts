/**
 * A path a build file writes relative to its own directory, folded as text — `..` included —
 * into a path of the repository: `../../libs` from `services/api` is `libs`. `undefined` for a
 * path that is absolute or climbs above the root of the repository.
 */
export function withinRepository(directory: string, written: string): string | undefined {
  const path = written.trim().replaceAll('\\', '/')
  if (path.startsWith('/') || /^[A-Za-z]:/.test(path)) return undefined
  const parts = directory === '' ? [] : directory.split('/')
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue
    if (part !== '..') parts.push(part)
    else if (parts.pop() === undefined) return undefined
  }
  return parts.join('/')
}
