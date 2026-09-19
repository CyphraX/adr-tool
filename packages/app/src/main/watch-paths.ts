import { join } from 'node:path'
import { DEFAULT_LOG_PATHS, type Repository } from '@adr-tool/core'

/**
 * What has to be watched so that the view follows the disk: the repository root (for
 * `.adr-dir`, and for `.adr` appearing), the tool's configuration directory, the parents
 * of the well-known directories (for a first `docs/adr` appearing), and every Decision
 * Log. Each of them one level deep — never the whole tree, a repository can hold a
 * `node_modules`.
 */
export function watchPaths(root: string, repository: Repository): string[] {
  const parentsOfDefaults = DEFAULT_LOG_PATHS.map((path) => path.split('/')[0]!)
  const paths = [
    root,
    join(root, '.adr'),
    ...parentsOfDefaults.map((parent) => join(root, parent)),
    ...repository.logs.map((log) => join(root, log.path))
  ]
  return [...new Set(paths)].sort()
}
