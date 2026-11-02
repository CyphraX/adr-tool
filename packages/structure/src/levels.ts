/**
 * Dependencies between Components (docs/structure-format.md, section 4): one level of the
 * hierarchy at a time, its nodes, the weighted Dependencies between them, and its Cycles.
 */
import { findCycles, type Cycle } from './cycles'
import type { DeclaredComponent } from './declaration'
import type { Dependency } from './dependencies'
import type { Structure } from './structure'

export interface LevelNode {
  /**
   * A Component of the level; the Source Files a parent owns itself, beside its children;
   * the Unassigned Source Files, at the top level; a Source File, below a Component without
   * children. The second and third exist so that every Dependency is visible.
   */
  readonly kind: 'component' | 'own-files' | 'unassigned' | 'source-file'
  /** The Component ID; the parent's ID for its own files; `(unassigned)`; the path of the file. */
  readonly id: string
  /** The Source Files it stands for, in the order of their paths. */
  readonly files: readonly string[]
}

export interface LevelEdge {
  readonly from: string
  readonly to: string
  /** The number of distinct pairs of Source Files: the Dependencies behind the edge. */
  readonly weight: number
  /** Every Dependency behind it is type-only. */
  readonly typeOnly: boolean
  /** The Source File Dependencies behind the edge, in the order of their paths. */
  readonly dependencies: readonly Dependency[]
}

export interface Level {
  /** The Component whose children, or whose Source Files, are shown; `undefined` at the top. */
  readonly parent: string | undefined
  readonly nodes: readonly LevelNode[]
  /** In the order of `from`, then `to`. */
  readonly edges: readonly LevelEdge[]
  /** Among the nodes, never with `(unassigned)`; computed on what the level shows. */
  readonly cycles: readonly Cycle[]
}

export interface LevelOptions {
  /** Include test files. Views, Cycles and metrics leave them out by default. */
  readonly tests?: boolean
}

export const UNASSIGNED = '(unassigned)'

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/**
 * The level below `parent`, or the top level. `undefined` when no Component has that ID —
 * the declaration may have changed since the ID was shown.
 */
export function levelOf(
  structure: Pick<Structure, 'components' | 'sourceFiles'>,
  dependencies: readonly Dependency[],
  parent?: string,
  options: LevelOptions = {}
): Level | undefined {
  const owned = new Map<string | undefined, string[]>()
  for (const file of structure.sourceFiles) {
    if (file.test && !options.tests) continue
    const list = owned.get(file.component)
    if (list) list.push(file.path)
    else owned.set(file.component, [file.path])
  }
  const contained = (component: DeclaredComponent): string[] => [
    ...(owned.get(component.id) ?? []),
    ...component.children.flatMap(contained)
  ]
  const componentNode = (component: DeclaredComponent): LevelNode => ({
    kind: 'component',
    id: component.id,
    files: contained(component).sort(compare)
  })

  let nodes: LevelNode[]
  if (parent === undefined) {
    const unassigned = owned.get(undefined) ?? []
    nodes = [
      ...structure.components.map(componentNode),
      ...(unassigned.length > 0
        ? [{ kind: 'unassigned' as const, id: UNASSIGNED, files: unassigned }]
        : [])
    ]
  } else {
    const component = find(structure.components, parent)
    if (component === undefined) return undefined
    const own = owned.get(component.id) ?? []
    nodes =
      component.children.length === 0
        ? own.map((path) => ({ kind: 'source-file' as const, id: path, files: [path] }))
        : [
            ...(own.length > 0
              ? [{ kind: 'own-files' as const, id: component.id, files: own }]
              : []),
            ...component.children.map(componentNode)
          ]
  }

  const nodeOf = new Map<string, string>()
  for (const node of nodes) for (const file of node.files) nodeOf.set(file, node.id)
  const behind = new Map<string, { from: string; to: string; dependencies: Dependency[] }>()
  for (const dependency of dependencies) {
    const from = nodeOf.get(dependency.from)
    const to = nodeOf.get(dependency.to)
    if (from === undefined || to === undefined || from === to) continue
    const key = `${from}\n${to}`
    const edge = behind.get(key) ?? { from, to, dependencies: [] }
    edge.dependencies.push(dependency)
    behind.set(key, edge)
  }
  const edges = [...behind.values()]
    .map(({ from, to, dependencies: list }): LevelEdge => ({
      from,
      to,
      weight: list.length,
      typeOnly: list.every((dependency) => dependency.typeOnly),
      dependencies: list
    }))
    .sort((a, b) => compare(a.from, b.from) || compare(a.to, b.to))

  const isFileLevel = nodes.some((node) => node.kind === 'source-file')
  const cycles = findCycles(
    // A bag of unrelated files would tie everything together.
    nodes.filter((node) => node.kind !== 'unassigned').map((node) => node.id),
    edges,
    { weakest: !isFileLevel }
  )
  return { parent, nodes, edges, cycles }
}

function find(components: readonly DeclaredComponent[], id: string): DeclaredComponent | undefined {
  for (const component of components) {
    if (component.id === id) return component
    if (id.startsWith(`${component.id}/`)) return find(component.children, id)
  }
  return undefined
}
