import { dirname, join } from 'node:path'
import { DEFAULT_LOG_PATHS, type Repository } from '@adr-tool/core'

/**
 * What has to be watched so that the view follows the disk: the repository root (for
 * `.adr-dir`, and for `.adr` appearing), the tool's configuration directory, the directory
 * of the Component declaration that the Traces are checked against, the parents
 * of the well-known directories (for a first `docs/adr` appearing), every Decision
 * Log, and the directory of the Diagrams with its parent (for it appearing). Each of them one
 * level deep — never the whole tree, a repository can hold a `node_modules`.
 */
export function watchPaths(
  root: string,
  repository: Repository,
  diagrams: string | undefined = undefined
): string[] {
  const parentsOfDefaults = DEFAULT_LOG_PATHS.map((path) => path.split('/')[0]!)
  const paths = [
    root,
    join(root, '.adr'),
    join(root, '.arch'),
    ...parentsOfDefaults.map((parent) => join(root, parent)),
    ...repository.logs.map((log) => join(root, log.path)),
    ...(diagrams === undefined ? [] : [join(root, diagrams), dirname(join(root, diagrams))])
  ]
  return [...new Set(paths)].sort()
}
