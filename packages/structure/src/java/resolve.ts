/**
 * Java's uses, resolved against what the repository's own files declare
 * (docs/structure-format.md, section 3, "Java"). There is no classpath and no compiler: every
 * file contributes its package and its top-level types, and together they form one symbol
 * table per package, across the whole repository.
 */
import type { LibraryUseAt } from '../dependencies'
import type { JavaName, JavaOutline } from './outline'

/** One use of another file of the repository, on the line that makes it. */
export interface JavaUse {
  readonly from: string
  readonly to: string
  readonly line: number
}

export interface JavaResolution {
  readonly uses: readonly JavaUse[]
  /** What names a type of the repository, or may, and cannot be told apart. */
  readonly notResolved: readonly { file: string; specifier: string; line: number }[]
  /** The package of each import that no file of the repository declares, at each import. */
  readonly libraries: readonly LibraryUseAt[]
}

/** The Java platform itself, which is not a Library. */
const PLATFORM = /^(?:java|javax|jdk)(?:\.|$)/

const lastOf = (name: string): string => name.slice(name.lastIndexOf('.') + 1)
const withoutLast = (name: string): string => name.slice(0, Math.max(0, name.lastIndexOf('.')))

/**
 * The package of a class outside the repository: its segments up to the first one that is
 * written like a type — `org.slf4j` for `org.slf4j.Logger`, `org.x` for `org.x.Outer.Inner`.
 * The name alone cannot say more; without a classpath this is what Java's naming says.
 */
function packageOutside(qualifiedClass: string): string {
  const segments = qualifiedClass.split('.')
  const firstType = segments.findIndex((segment) => /^[A-Z]/.test(segment))
  return firstType > 0
    ? segments.slice(0, firstType).join('.')
    : withoutLast(qualifiedClass) || qualifiedClass
}

export function resolveJava(outlines: ReadonlyMap<string, JavaOutline>): JavaResolution {
  /** Package → simple name of a top-level type → the files that declare it. */
  const table = new Map<string, Map<string, string[]>>()
  for (const [path, outline] of outlines) {
    const types = table.get(outline.package) ?? new Map<string, string[]>()
    table.set(outline.package, types)
    for (const type of outline.types) types.set(type, [...(types.get(type) ?? []), path])
  }

  /**
   * A class named by its qualified name: the longest package of the repository followed by
   * a type it declares — for `a.b.Outer.Inner`, the file of `Outer`. Nothing can be imported
   * from the default package.
   */
  const classOf = (
    qualified: string
  ): { kind: 'files'; files: readonly string[] } | { kind: 'missing' } | undefined => {
    const segments = qualified.split('.')
    for (let length = segments.length - 1; length > 0; length--) {
      const types = table.get(segments.slice(0, length).join('.'))
      if (!types) continue
      const files = types.get(segments[length]!)
      return files ? { kind: 'files', files } : { kind: 'missing' }
    }
    return undefined
  }

  const uses: JavaUse[] = []
  const notResolved: { file: string; specifier: string; line: number }[] = []
  const libraries: LibraryUseAt[] = []

  for (const [path, outline] of outlines) {
    const useLibrary = (library: string, line: number): void => {
      if (!PLATFORM.test(library)) libraries.push({ file: path, library, line, typeOnly: false })
    }
    const use = (files: readonly string[], specifier: string, line: number): void => {
      if (files.length === 1) {
        if (files[0] !== path) uses.push({ from: path, to: files[0]!, line })
      } else {
        // Two files of the repository declare the name in one package: nothing is counted.
        notResolved.push({ file: path, specifier, line })
      }
    }
    /** A single-type or static import: the use of the class it names. */
    const importClass = (qualified: string, written: string, line: number): void => {
      if (PLATFORM.test(qualified)) return
      const found = classOf(qualified)
      if (found?.kind === 'files') use(found.files, written, line)
      else if (found?.kind === 'missing') notResolved.push({ file: path, specifier: written, line })
      else useLibrary(packageOutside(qualified), line)
    }

    // Single-type imports bind a simple name before anything else does.
    const bound = new Set<string>()
    /** The packages of the repository that are imported on demand. */
    const onDemand: string[] = []
    for (const entry of outline.imports) {
      if (entry.isStatic) {
        importClass(entry.onDemand ? entry.name : withoutLast(entry.name), entry.name, entry.line)
      } else if (!entry.onDemand) {
        bound.add(lastOf(entry.name))
        importClass(entry.name, entry.name, entry.line)
      } else if (entry.name !== '' && table.has(entry.name)) {
        onDemand.push(entry.name)
      } else if (!PLATFORM.test(entry.name)) {
        // `import a.b.Outer.*` imports the nested types of a class.
        const found = classOf(entry.name)
        if (found?.kind === 'files') use(found.files, `${entry.name}.*`, entry.line)
        else useLibrary(entry.name, entry.line)
      }
    }

    // A simple name: single-type import, own package, on-demand imports — in that order.
    const own = table.get(outline.package)
    const resolveName = ({ name, line }: JavaName, mayBeAVariable: boolean): void => {
      if (bound.has(name) || outline.types.includes(name) || outline.local.includes(name)) return
      const inOwn = own?.get(name)
      if (inOwn) {
        if (inOwn.length > 1 && mayBeAVariable) return
        use(inOwn, name, line)
        return
      }
      const candidates = onDemand.filter((name_) => table.get(name_)!.has(name))
      if (candidates.length === 0) return
      if (candidates.length > 1) {
        if (!mayBeAVariable) notResolved.push({ file: path, specifier: name, line })
        return
      }
      const files = table.get(candidates[0]!)!.get(name)!
      if (files.length > 1 && mayBeAVariable) return
      use(files, `${candidates[0]}.${name}`, line)
    }
    const typeNames = new Set(outline.typeNames.map(({ name }) => name))
    for (const name of outline.typeNames) resolveName(name, false)
    // A qualifier counts only where it resolves to a type: `lines` in `lines.size()` does not.
    for (const name of outline.qualifiers) if (!typeNames.has(name.name)) resolveName(name, true)
  }
  return { uses, notResolved, libraries }
}
