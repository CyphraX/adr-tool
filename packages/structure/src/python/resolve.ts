/**
 * Python's imports, resolved against the files of the repository (docs/structure-format.md,
 * section 3, "Python"). There is no interpreter and no installed environment: a module is
 * looked up as a file below the source roots of the Python projects, a relative import below
 * the directory of the file that makes it.
 */
import type { PythonImport, PythonOutline } from './outline'
import type { PythonProject } from './projects'
import { PYTHON_STANDARD_LIBRARY } from './standard-library'

/** One use of another file of the repository, on the line of its import. */
export interface PythonUse {
  readonly from: string
  readonly to: string
  readonly typeOnly: boolean
  readonly line: number
}

export interface PythonResolution {
  readonly uses: readonly PythonUse[]
  readonly notResolved: readonly { file: string; specifier: string; line: number }[]
  /** The top-level package of each import from outside the repository, once per file. */
  readonly libraries: readonly { file: string; library: string }[]
}

/**
 * Where a module was found: its file — `a/b.py` or `a/b/__init__.py` —, a namespace package —
 * a directory with Python beneath it and no `__init__.py` —, or more than one file.
 */
type Found =
  | { readonly kind: 'file'; readonly path: string }
  | { readonly kind: 'namespace' }
  | { readonly kind: 'ambiguous' }

const directoryOf = (path: string): string =>
  path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
const join = (directory: string, path: string): string =>
  directory === '' ? path : path === '' ? directory : `${directory}/${path}`
const isBeneath = (path: string, directory: string): boolean =>
  directory === '' || path.startsWith(`${directory}/`)

/**
 * `python` are the Python Source Files of the repository, `projects` its Python projects with
 * their source roots, the root among them.
 */
export function resolvePython(
  outlines: ReadonlyMap<string, PythonOutline>,
  python: readonly string[],
  projects: readonly PythonProject[]
): PythonResolution {
  const files = new Set(python)
  /** Every directory with Python beneath it. */
  const directories = new Set<string>()
  for (const path of python) {
    for (let directory = directoryOf(path); ; directory = directoryOf(directory)) {
      directories.add(directory)
      if (directory === '') break
    }
  }
  const isPackage = (directory: string): boolean => files.has(join(directory, '__init__.py'))

  /**
   * The names a module or a package can be imported by from somewhere: those that lie in no
   * package — `a.py` or `a/__init__.py` in a directory without `__init__.py`.
   */
  const topLevelSomewhere = new Set<string>()
  for (const path of python) {
    const name = path.slice(path.lastIndexOf('/') + 1)
    const directory = directoryOf(path)
    if (name === '__init__.py') {
      if (directory !== '' && !isPackage(directoryOf(directory))) {
        topLevelSomewhere.add(directory.slice(directory.lastIndexOf('/') + 1))
      }
    } else if (!isPackage(directory)) {
      topLevelSomewhere.add(name.slice(0, -'.py'.length))
    }
  }

  /** A module by its dotted name below one directory: its package, its file, or a namespace. */
  const lookup = (root: string, dotted: string): Found | undefined => {
    // The empty name is the directory itself, for `from . import x`.
    const base = join(root, dotted.split('.').join('/'))
    if (files.has(join(base, '__init__.py')))
      return { kind: 'file', path: join(base, '__init__.py') }
    if (dotted !== '' && files.has(`${base}.py`)) return { kind: 'file', path: `${base}.py` }
    return directories.has(base) ? { kind: 'namespace' } : undefined
  }

  /** The project a file belongs to: the deepest that holds it. The root holds every file. */
  const projectOf = (path: string): PythonProject =>
    projects
      .filter((project) => isBeneath(path, project.directory))
      .reduce((deepest, project) =>
        project.directory.length > deepest.directory.length ? project : deepest
      )

  /**
   * The directory a file's top-level package lies in: the first above it that is no package —
   * the file's own directory where that is none. Python puts a script's directory first, and
   * pytest this one, for a test: `backend/` of `backend/orders/models.py`, run by
   * `backend/manage.py`.
   */
  const baseOf = (path: string): string => {
    let directory = directoryOf(path)
    while (directory !== '' && isPackage(directory)) directory = directoryOf(directory)
    return directory
  }

  /**
   * A module by its absolute name, as seen from a file: first the directory its top-level
   * package lies in, and the roots of the file's own project, in order; then those of every
   * other project, where the name must be found in exactly one file.
   */
  const find = (from: string, dotted: string): Found | undefined => {
    const own = projectOf(from)
    const first = [...new Set([baseOf(from), ...own.roots])]
    let namespace = false
    for (const root of first) {
      const found = lookup(root, dotted)
      if (found?.kind === 'file') return found
      if (found?.kind === 'namespace') namespace = true
    }
    const elsewhere = new Set<string>()
    for (const project of projects) {
      if (project === own) continue
      for (const root of project.roots) {
        const found = lookup(root, dotted)
        if (found?.kind === 'file') elsewhere.add(found.path)
        if (found?.kind === 'namespace') namespace = true
      }
    }
    if (elsewhere.size === 1) return { kind: 'file', path: [...elsewhere][0]! }
    if (elsewhere.size > 1) return { kind: 'ambiguous' }
    return namespace ? { kind: 'namespace' } : undefined
  }

  const uses: PythonUse[] = []
  const notResolved: { file: string; specifier: string; line: number }[] = []
  const libraries: { file: string; library: string }[] = []

  for (const [path, outline] of outlines) {
    const libraryUsed = new Set<string>()
    const use = (to: string, entry: PythonImport): void => {
      // A file never depends on itself: `from . import x` in `__init__.py` may land there.
      if (to !== path) uses.push({ from: path, to, typeOnly: entry.typeOnly, line: entry.line })
    }
    const notFound = (specifier: string, entry: PythonImport): void => {
      notResolved.push({ file: path, specifier, line: entry.line })
    }

    /**
     * A module that is not in the repository by that name: where its top-level package is the
     * repository's, or could be, it is not resolved; the standard library is no Library.
     */
    const outside = (dotted: string, entry: PythonImport): void => {
      const top = dotted.split('.')[0]!
      if (find(path, top) !== undefined) return notFound(dotted, entry)
      if (PYTHON_STANDARD_LIBRARY.has(top)) return
      if (topLevelSomewhere.has(top)) return notFound(dotted, entry)
      if (!libraryUsed.has(top)) libraries.push({ file: path, library: top })
      libraryUsed.add(top)
    }

    for (const entry of outline.imports) {
      const written = `${'.'.repeat(entry.level)}${entry.module}`
      let module: Found | undefined
      /** A module below the one imported from, by its name. */
      let below: (name: string) => Found | undefined
      if (entry.level > 0) {
        // Relative: from the file's own directory, one level up for every further dot — but
        // not above its top-level package, which Python refuses. A file outside of a package,
        // in a namespace package say, may go no further than its own directory.
        let packages = 0
        for (let directory = directoryOf(path); isPackage(directory); ) {
          packages++
          if (directory === '') break
          directory = directoryOf(directory)
        }
        let base: string | undefined = directoryOf(path)
        for (let level = 1; level < entry.level && base !== undefined; level++) {
          base = base === '' ? undefined : directoryOf(base)
        }
        if (base === undefined || entry.level > Math.max(1, packages)) {
          notFound(written, entry)
          continue
        }
        const at = base
        module = lookup(at, entry.module)
        below = (name) => lookup(at, entry.module === '' ? name : `${entry.module}.${name}`)
        if (module === undefined) {
          notFound(written, entry)
          continue
        }
      } else {
        // A directory without `__init__.py` named like a module of the standard library is
        // passed over: Python finds a module or a package anywhere before a namespace package.
        const top = entry.module.split('.')[0]!
        if (PYTHON_STANDARD_LIBRARY.has(top) && find(path, top)?.kind === 'namespace') continue
        module = find(path, entry.module)
        below = (name) => find(path, `${entry.module}.${name}`)
        if (module === undefined) {
          outside(entry.module, entry)
          continue
        }
      }
      if (module.kind === 'ambiguous') {
        notFound(written, entry)
        continue
      }

      // `import a.b`, and `from a.b import *`: the module itself, where it has a file.
      if (entry.names === undefined || entry.names.includes('*')) {
        if (module.kind === 'file') use(module.path, entry)
        continue
      }
      // `from a.b import c`: the module `a.b.c` where there is one, else a name `a.b` defines.
      for (const name of entry.names) {
        const submodule = below(name)
        if (submodule?.kind === 'file') use(submodule.path, entry)
        else if (submodule?.kind === 'namespace') continue
        else if (submodule === undefined && module.kind === 'file') use(module.path, entry)
        else notFound(written.endsWith('.') ? `${written}${name}` : `${written}.${name}`, entry)
      }
    }
  }
  return { uses, notResolved, libraries }
}
