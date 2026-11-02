/**
 * The directories below a Component without children (docs/structure-format.md, section 4):
 * the views go down as deep as the folders do. A directory node is no Component — nothing
 * declares it and nothing may name it — but levels, Cycles, the matrix and the metrics treat
 * it as one, so it is handed to them as one, in a copy of the Structure that is never written.
 */
import type { DeclaredComponent } from './declaration'
import type { OwnedSourceFile } from './ownership'
import type { Structure } from './structure'

/** A directory below a Component without children, as the views show it. */
export interface DirectoryNode extends DeclaredComponent {
  /** The directory it stands for, relative to the repository root. */
  readonly directory: string
  readonly children: readonly DirectoryNode[]
}

export const isDirectoryNode = (component: DeclaredComponent): component is DirectoryNode =>
  'directory' in component

type Explorable = Pick<Structure, 'components' | 'sourceFiles'>

/** A Structure is read once and never changes: its directories are found once. */
const explored = new WeakMap<object, Explorable>()

/**
 * The Structure as the views see it: every Component without children that owns Source Files
 * in more than one directory has its directory nodes as children, and each of those files is
 * owned by the deepest directory node it lies in. The declaration itself is not touched.
 */
export function withDirectories(structure: Explorable): Explorable {
  const known = explored.get(structure)
  if (known) return known

  const owned = new Map<string, string[]>()
  for (const file of structure.sourceFiles) {
    if (file.component === undefined) continue
    const list = owned.get(file.component)
    if (list) list.push(file.path)
    else owned.set(file.component, [file.path])
  }

  const ownerOf = new Map<string, string>()
  const extend = (component: DeclaredComponent): DeclaredComponent => {
    if (component.children.length > 0) {
      return { ...component, children: component.children.map(extend) }
    }
    const children = directoriesOf(component.id, owned.get(component.id) ?? [], ownerOf)
    return children.length === 0 ? component : { ...component, children }
  }
  const components = structure.components.map(extend)
  const sourceFiles = structure.sourceFiles.map((file): OwnedSourceFile => {
    const owner = ownerOf.get(file.path)
    return owner === undefined ? file : { ...file, component: owner }
  })

  const result = { components, sourceFiles }
  explored.set(structure, result)
  return result
}

const directoryOf = (path: string): string => {
  const slash = path.lastIndexOf('/')
  return slash === -1 ? '' : path.slice(0, slash)
}
const isBeneath = (path: string, directory: string): boolean =>
  directory === '' || path.startsWith(`${directory}/`)
const below = (path: string, directory: string): string =>
  directory === '' ? path : path.slice(directory.length + 1)

/** The deepest directory that holds all of these. */
function baseOf(directories: readonly string[]): string {
  let base = directories[0] ?? ''
  for (const directory of directories) {
    while (base !== '' && directory !== base && !isBeneath(directory, base))
      base = directoryOf(base)
  }
  return base
}

/**
 * The directory nodes below a Component without children: below its base, each directory that
 * holds its Source Files, one that only holds one directory passed over. `ownerOf` learns the
 * deepest directory node of each file that lies below the base.
 */
function directoriesOf(
  component: string,
  files: readonly string[],
  ownerOf: Map<string, string>
): DirectoryNode[] {
  const base = baseOf(files.map(directoryOf))

  const level = (directory: string, within: readonly string[]): DirectoryNode[] => {
    const deeper = within.filter((path) => below(path, directory).includes('/'))
    const names = [...new Set(deeper.map((path) => below(path, directory).split('/')[0]!))].sort()
    return names.map((name) => {
      let child = directory === '' ? name : `${directory}/${name}`
      let inside = deeper.filter((path) => isBeneath(path, child))
      // Down for as long as there is one directory and no Source File: a Java package path.
      for (;;) {
        const holdsFiles = inside.some((path) => !below(path, child).includes('/'))
        const next = new Set(inside.map((path) => below(path, child).split('/')[0]!))
        if (holdsFiles || next.size !== 1) break
        child = `${child}/${[...next][0]!}`
        inside = inside.filter((path) => isBeneath(path, child))
      }
      const id = `${component}/${below(child, base)}`
      for (const path of inside) {
        if (directoryOf(path) === child) ownerOf.set(path, id)
      }
      return {
        id,
        name: below(child, directory),
        paths: [],
        tests: [],
        directory: child,
        children: level(child, inside)
      }
    })
  }
  return level(base, files)
}
