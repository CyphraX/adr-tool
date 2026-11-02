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
