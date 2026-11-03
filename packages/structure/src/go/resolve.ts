/**
 * Go's uses, resolved against the packages of the repository (docs/structure-format.md,
 * section 3, "Go"). A package is a directory; an import path names one through the module
 * path of a `go.mod`. A Dependency is between files, so a use of a package is a use of the
 * file that declares the name used: every file contributes what it declares at the top level
 * to its package, as a Java file contributes its types.
 */
import type { LibraryUseAt } from '../dependencies'
import type { GoModule, GoModules } from './modules'
import type { GoOutline } from './outline'

/** One use of another file of the repository, on the line that makes it. */
export interface GoUse {
  readonly from: string
  readonly to: string
  readonly line: number
}

export interface GoResolution {
  readonly uses: readonly GoUse[]
  readonly notResolved: readonly { file: string; specifier: string; line: number }[]
  /** The module of each import from outside the repository, at each import. */
  readonly libraries: readonly LibraryUseAt[]
}

const directoryOf = (path: string): string =>
  path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
const isBeneath = (path: string, directory: string): boolean =>
  directory === '' || path.startsWith(`${directory}/`)
/** Whether an import path lies at or below a module path: `a/b/c` below `a/b`, not `a/bc`. */
const isBelow = (importPath: string, modulePath: string): boolean =>
  modulePath !== '' && (importPath === modulePath || importPath.startsWith(`${modulePath}/`))
const below = (directory: string, importPath: string, modulePath: string): string => {
  const rest = importPath.slice(modulePath.length + 1)
  return directory === '' ? rest : rest === '' ? directory : `${directory}/${rest}`
}
/** A name other packages can use: it begins with a capital letter, as Go has it. */
const isExported = (name: string): boolean => /^\p{Lu}/u.test(name)
/** A test file is not part of the package others import, as the go command has it. */
const isTest = (path: string): boolean => path.endsWith('_test.go')

interface Package {
  readonly name: string
  readonly files: readonly string[]
  /** The files of the package that declare each name: looked up, not searched, for every use. */
  readonly declarers: ReadonlyMap<string, readonly string[]>
}

export function resolveGo(
  outlines: ReadonlyMap<string, GoOutline>,
  { modules, replaces: workspace }: GoModules
): GoResolution {
  /** The files of each directory that could be read, in the order of their paths. */
  const inDirectory = new Map<string, string[]>()
  for (const path of [...outlines.keys()].sort()) {
    const directory = directoryOf(path)
    const files = inDirectory.get(directory)
    if (files) files.push(path)
    else inDirectory.set(directory, [path])
  }

  /**
   * A package as its files are seen: the files of a directory under one package name, the test
   * files among them where `tests` asks for them — as a test file of the package sees it —,
   * with what each of them declares. Built once for each, so that a use is a lookup.
   */
  const views = new Map<string, Package>()
  const viewOf = (directory: string, name: string, tests: boolean): Package => {
    const key = `${directory}\n${name}\n${tests}`
    const known = views.get(key)
    if (known) return known
    const files = (inDirectory.get(directory) ?? []).filter(
      (path) => outlines.get(path)!.package === name && (tests || !isTest(path))
    )
    const declarers = new Map<string, string[]>()
    for (const file of files) {
      for (const declared of outlines.get(file)!.declares) {
        const list = declarers.get(declared)
        if (list === undefined) declarers.set(declared, [file])
        else if (list.at(-1) !== file) list.push(file)
      }
    }
    const view = { name, files, declarers }
    views.set(key, view)
    return view
  }

  /** The module a file or directory belongs to: the deepest go.mod above it. */
  const moduleOf = (path: string): GoModule | undefined =>
    modules
      .filter((module) => isBeneath(path, module.directory) || path === module.directory)
      .reduce<GoModule | undefined>(
        (deepest, module) =>
          deepest === undefined || module.directory.length > deepest.directory.length
            ? module
            : deepest,
        undefined
      )

  /**
   * The package others import from a directory: its files other than tests, under the name
   * that most of them give — not `main` where another is given, ties to the first file.
   */
  const packages = new Map<string, Package | undefined>()
  const packageAt = (directory: string): Package | undefined => {
    if (packages.has(directory)) return packages.get(directory)
    const files = (inDirectory.get(directory) ?? []).filter((path) => !isTest(path))
    const counts = new Map<string, number>()
    for (const path of files) {
      const name = outlines.get(path)!.package
      counts.set(name, (counts.get(name) ?? 0) + 1)
    }
    let chosen: string | undefined
    for (const [name, count] of counts) {
      const better =
        chosen === undefined ||
        (chosen === 'main' && name !== 'main') ||
        (name !== 'main' && count > counts.get(chosen)!)
      if (better) chosen = name
    }
    const found = chosen === undefined ? undefined : viewOf(directory, chosen, false)
    packages.set(directory, found)
    return found
  }

  /**
   * The directory an import path names, as seen from a module: through a `replace` that points
   * into the repository — go.work's before the module's —, else through the module of the
   * repository whose path is the longest that the import path lies below. A directory that a
   * module deeper down holds is that module's, and not reached through the outer one: `null`,
   * a path of the repository that names no directory of its.
   */
  const directoryFor = (
    importPath: string,
    from: GoModule | undefined
  ): string | null | undefined => {
    const longest = <T extends { path: string }>(candidates: readonly T[]): T | undefined =>
      candidates
        .filter((candidate) => isBelow(importPath, candidate.path))
        .reduce<T | undefined>(
          (best, candidate) =>
            best === undefined || candidate.path.length > best.path.length ? candidate : best,
          undefined
        )
    for (const replacements of [workspace, from?.replaces ?? []]) {
      const replacement = longest(replacements)
      if (replacement) return below(replacement.directory, importPath, replacement.path)
    }
    const module = longest(modules)
    if (!module) return undefined
    const directory = below(module.directory, importPath, module.path)
    return moduleOf(directory) === module ? directory : null
  }

  const uses: GoUse[] = []
  const notResolved: { file: string; specifier: string; line: number }[] = []
  const libraries: LibraryUseAt[] = []

  for (const [path, outline] of outlines) {
    const module = moduleOf(path)
    const use = (files: readonly string[], line: number): void => {
      for (const to of files) if (to !== path) uses.push({ from: path, to, line })
    }
    const declaring = (pkg: Package, name: string): readonly string[] =>
      pkg.declarers.get(name) ?? []

    /** The packages of the repository the file imports, by the name it uses them by. */
    const bound = new Map<string, { pkg: Package; path: string; line: number; used: boolean }>()
    const dotted: { pkg: Package; line: number; used: boolean }[] = []

    for (const entry of outline.imports) {
      // cgo's pseudo-package.
      if (entry.path === 'C') continue
      const directory = directoryFor(entry.path, module)
      if (directory === undefined) {
        // The standard library has no dot in its first element; a module of the repository may.
        if (!entry.path.split('/')[0]!.includes('.')) continue
        const required = (module?.requires ?? [])
          .filter((requirement) => isBelow(entry.path, requirement.path))
          .sort((a, b) => b.path.length - a.path.length)[0]
        const library = required?.path ?? entry.path
        libraries.push({ file: path, library, line: entry.line, typeOnly: false })
        continue
      }
      const imported = directory === null ? undefined : packageAt(directory)
      // An external test package (`package cart_test`) is built with the test files of the
      // package it tests, beside it: it sees what their `export_test.go` declares.
      const pkg =
        imported && directory === directoryOf(path) && isTest(path)
          ? viewOf(directory, imported.name, true)
          : imported
      if (pkg === undefined) {
        notResolved.push({ file: path, specifier: entry.path, line: entry.line })
      } else if (entry.name === '_') {
        // Imported for what its files do when they are loaded: all of them.
        use(pkg.files, entry.line)
      } else if (entry.name === '.') {
        dotted.push({ pkg, line: entry.line, used: false })
      } else {
        bound.set(entry.name ?? pkg.name, { pkg, path: entry.path, line: entry.line, used: false })
      }
    }

    // `cart.New`: the file of the package that declares `New`. Another package can be
    // selected from for an exported name alone, so `cart.items` selects from a value; so may
    // a selection whose qualifier the file declares inside as well. Neither is ever listed.
    for (const { qualifier, name, line, local } of outline.selections) {
      if (local || !isExported(name)) continue
      const imported = bound.get(qualifier)
      if (!imported) continue
      imported.used = true
      const files = declaring(imported.pkg, name)
      if (files.length > 0) use(files, line)
      else notResolved.push({ file: path, specifier: `${imported.path}.${name}`, line })
    }

    // A name without a qualifier: the file of its own package that declares it, or of a
    // package imported with `.`. A test file sees the other files of its package; others
    // do not see the tests.
    const ownPackage = viewOf(directoryOf(path), outline.package, isTest(path))
    for (const { name, line } of outline.names) {
      if (bound.has(name)) continue
      const files = declaring(ownPackage, name)
      if (files.length > 0) {
        use(files, line)
        continue
      }
      for (const imported of dotted) {
        const found = declaring(imported.pkg, name)
        if (found.length === 0) continue
        imported.used = true
        use(found, line)
      }
    }

    // An import whose use the syntax does not show is still a use of its package: all of it.
    for (const imported of [...bound.values(), ...dotted]) {
      if (!imported.used) use(imported.pkg.files, imported.line)
    }
  }
  return { uses, notResolved, libraries }
}
