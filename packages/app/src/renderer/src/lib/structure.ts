import type { StructureNode } from '../../../shared/ipc'
import { t } from './strings'

/** How a node of a level is called wherever it shows up: drawing, matrix, table, details. */
export function nodeLabel(node: Pick<StructureNode, 'kind' | 'name'>): string {
  switch (node.kind) {
    case 'own-files':
      return t.structure.graph.ownFiles(node.name)
    case 'unassigned':
      return t.structure.graph.unassigned
    default:
      return node.name
  }
}

/**
 * The directory all the paths lie in, with its trailing slash, so that a list can name it once
 * and the files below it; the empty string when they share none.
 */
export function commonDirectory(paths: readonly string[]): string {
  if (paths.length === 0) return ''
  let common = paths[0]!.slice(0, paths[0]!.lastIndexOf('/') + 1)
  for (const path of paths) {
    while (!path.startsWith(common)) {
      common = common.slice(0, common.lastIndexOf('/', common.length - 2) + 1)
    }
  }
  return common
}
