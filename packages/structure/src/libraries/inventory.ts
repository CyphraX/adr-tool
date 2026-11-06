/**
 * The Library inventory (docs/structure-format.md, section 3, "The Library inventory"): the
 * Libraries the manifests declare, joined with the Libraries the code uses, per Component —
 * declared and used, declared and not used, used and not declared —, with their versions and
 * the licence an installed package declares. The name a distribution is declared by is tied to
 * the name the code uses it by, and how each was tied is said: nothing is guessed silently.
 */
import type { FileSystem } from '@adr-tool/kernel'
import type { LibraryUse } from '../dependencies'
import type { ManifestLibrary, ManifestNotRead } from '../manifests'
import type { OwnedSourceFile } from '../ownership'
import { isIgnoredByGo, isNeverLookedAt, type Language } from '../source-files'
import {
  goVendored,
  npmPackages,
  pythonDistributions,
  type Installed,
  type InstalledDistribution,
  type Licence
} from './installed'
import {
  JAVA_PACKAGES,
  normalisedPython,
  PYTHON_IMPORTS,
  PYTHON_NAMESPACES,
  typedPackage
} from './names'

/** Where a Library comes from: which kind of manifest declares it, which language uses it. */
export type Ecosystem = 'npm' | 'maven' | 'python' | 'go'

/**
 * How the name a Library is declared by was tied to the names the code uses:
 * - `same`: the code uses the declared name — an npm package, a Go module (as the prefix of
 *   the import path), `@types/x` the types of `x`;
 * - `installed`: the top-level packages the installed distribution lists (Python);
 * - `known`: the suite's table of well-known differences (`PyYAML` → `yaml`, Guava →
 *   `com.google.common`);
 * - `normalised`: Python's normalised name, its dashes as underscores — taken as the import
 *   name, which it need not be;
 * - `group`: the group ID of a Maven artefact, taken as the prefix of its packages, which it
 *   need not be, and is the same for every artefact of the group.
 * The last two are heuristics: a Library mapped so that shows no use may be used under
 * another name.
 */
export type Mapping = 'same' | 'installed' | 'known' | 'normalised' | 'group'

/** A declaration of a Library, with the Component its manifest belongs to. */
export interface LibraryDeclaration extends ManifestLibrary {
  /**
   * The innermost Component that contains every Source File in or below the manifest's
   * directory; missing for a manifest at the root, or above code that no one Component holds.
   */
  readonly component?: string
}

/** The use of a Library by the Source Files one Component owns. */
export interface LibraryUser {
  /** The Component that owns the files; missing for Unassigned files. */
  readonly component?: string
  /** The Source Files that use it, in path order. */
  readonly files: readonly string[]
  /** The lines of each file's imports of it, by its path. */
  readonly lines: Readonly<Record<string, readonly number[]>>
  /** Those of them that are tests, in path order. */
  readonly tests: readonly string[]
  /** Every one of them is a test. */
  readonly testOnly: boolean
  /** Those of them for which no manifest in their directory or above declares it. */
  readonly undeclared: readonly string[]
}

export interface InventoryLibrary {
  readonly ecosystem: Ecosystem
  /** The name it is declared by; where no manifest declares it, the name the code uses. */
  readonly name: string
  /** Every declaration of it, in the order of the manifests. */
  readonly declared: readonly LibraryDeclaration[]
  /**
   * The names the code uses it by: npm package names, Python top-level packages, Go module
   * paths and Java package prefixes. For a Library that is not declared, the name it is used by.
   */
  readonly imports: readonly string[]
  /** How `imports` was told; missing for a Library that is not declared. */
  readonly mapping?: Mapping
  /** Per Component, in the order of the Components' IDs; Unassigned files last. */
  readonly usedBy: readonly LibraryUser[]
  /** What is installed of it inside the repository, if anything is found. */
  readonly installed?: Omit<Installed, 'licence'>
  readonly licence: Licence
}

export interface LibraryInventory {
  /** By name, then ecosystem. */
  readonly libraries: readonly InventoryLibrary[]
  /** The manifests whose reader failed on them: they declare nothing here. Missing where none did. */
  readonly notRead?: readonly ManifestNotRead[]
}

const ECOSYSTEM_OF: Partial<Record<Language, Ecosystem>> = {
  typescript: 'npm',
  svelte: 'npm',
  java: 'maven',
  python: 'python',
  go: 'go'
}

/** The ecosystem whose Libraries a language uses; `undefined` for one that uses none. */
export const ecosystemOfLanguage = (language: Language): Ecosystem | undefined =>
  ECOSYSTEM_OF[language]

const fileName = (path: string): string => path.slice(path.lastIndexOf('/') + 1)
const directoryOf = (path: string): string =>
  path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''

/** The ecosystem of a manifest, by its name. */
export function ecosystemOfManifest(manifest: string): Ecosystem {
  const name = fileName(manifest)
  if (name === 'package.json') return 'npm'
  if (name === 'pom.xml' || name.startsWith('build.gradle')) return 'maven'
  if (name === 'go.mod') return 'go'
  return 'python'
}

/**
 * The directory a manifest speaks for: its own; for a requirements file in a directory
 * `requirements/`, the directory above.
 */
function manifestDirectory(manifest: string): string {
  const directory = directoryOf(manifest)
  return fileName(directory) === 'requirements' ? directoryOf(directory) : directory
}

const isAtOrBelow = (path: string, directory: string): boolean =>
  directory === '' || path === directory || path.startsWith(`${directory}/`)

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** The key a Library is known by within its ecosystem. */
const keyOf = (ecosystem: Ecosystem, name: string): string =>
  `${ecosystem}\n${ecosystem === 'python' ? normalisedPython(name) : name}`

/** Whether a declared Library is a package of types alone, for the package it is named after. */
const isTypesPackage = (ecosystem: Ecosystem, name: string): boolean =>
  ecosystem === 'npm' && typedPackage(name) !== undefined

/** How long the part of `used` is that `imported` names: a whole name, or a prefix of segments. */
function matchLength(ecosystem: Ecosystem, imported: string, used: string): number {
  if (used === imported) return imported.length
  // A Go module names the packages below it; a Java or Python package, those inside it.
  const separator = ecosystem === 'go' ? '/' : ecosystem === 'npm' ? undefined : '.'
  return separator !== undefined && used.startsWith(imported + separator) ? imported.length : 0
}

/**
 * The inventory of a repository. `files` are the files it consists of, as for
 * `openStructure`; `structure` says which Component owns which Source File, `dependencies`
 * what the code uses and the manifests declare. Reads what is installed in the repository,
 * within limits; never writes.
 */
export async function libraryInventory(
  fs: FileSystem,
  files: readonly string[],
  structure: { readonly sourceFiles: readonly OwnedSourceFile[] },
  dependencies: {
    readonly libraries: readonly LibraryUse[]
    readonly builtIns?: readonly LibraryUse[]
    readonly manifests: readonly ManifestLibrary[]
    readonly manifestsNotRead?: readonly ManifestNotRead[]
  }
): Promise<LibraryInventory> {
  const owned = new Map(structure.sourceFiles.map((file) => [file.path, file]))

  /** The Component of each manifest: innermost one over the Source Files below its directory. */
  const componentOfDirectory = new Map<string, string | undefined>()
  const componentOf = (manifest: string): string | undefined => {
    const directory = manifestDirectory(manifest)
    if (directory === '') return undefined
    if (componentOfDirectory.has(directory)) return componentOfDirectory.get(directory)
    let common: string[] | undefined
    for (const file of structure.sourceFiles) {
      if (!isAtOrBelow(file.path, directory)) continue
      const chain = file.component === undefined ? [] : file.component.split('/')
      if (common === undefined) common = chain
      else {
        let length = 0
        while (length < common.length && common[length] === chain[length]) length++
        common = common.slice(0, length)
      }
      if (common.length === 0) break
    }
    const component = common === undefined || common.length === 0 ? undefined : common.join('/')
    componentOfDirectory.set(directory, component)
    return component
  }

  // Python's installed distributions, where a virtual environment lies in the repository: at
  // the root, and beside each Python manifest.
  const pythonManifests = dependencies.manifests.filter(
    (library) => ecosystemOfManifest(library.manifest) === 'python'
  )
  const usesPython = dependencies.libraries.some(
    (use) => owned.get(use.file)?.language === 'python'
  )
  const distributions =
    pythonManifests.length > 0 || usesPython
      ? await pythonDistributions(fs, [
          '',
          ...pythonManifests.map((library) => manifestDirectory(library.manifest))
        ])
      : []
  const distributionOf = new Map<string, InstalledDistribution>()
  const distributionImporting = new Map<string, InstalledDistribution>()
  for (const distribution of distributions) {
    distributionOf.set(normalisedPython(distribution.name), distribution)
    for (const name of distribution.imports) {
      if (!distributionImporting.has(name)) distributionImporting.set(name, distribution)
    }
  }

  interface Entry {
    ecosystem: Ecosystem
    name: string
    declared: LibraryDeclaration[]
    imports: string[]
    mapping?: Mapping
    /** Per Component (`''` for none): the files with their lines, and those not declared for. */
    users: Map<string, { files: Map<string, Set<number>>; undeclared: Set<string> }>
  }
  const entries = new Map<string, Entry>()

  for (const library of dependencies.manifests) {
    const ecosystem = ecosystemOfManifest(library.manifest)
    const key = keyOf(ecosystem, library.name)
    let entry = entries.get(key)
    if (!entry) {
      entry = { ecosystem, name: library.name, declared: [], imports: [], users: new Map() }
      Object.assign(entry, mappingOf(ecosystem, library.name, distributionOf))
      entries.set(key, entry)
    }
    const component = componentOf(library.manifest)
    entry.declared.push({ ...library, ...(component === undefined ? {} : { component }) })
  }

  // The manifests by ecosystem and directory, to tell whether a use is declared for its file.
  const declaredIn = new Map<string, Set<string>>()
  for (const entry of entries.values()) {
    for (const declaration of entry.declared) {
      const directory = `${entry.ecosystem}\n${manifestDirectory(declaration.manifest)}`
      const keys = declaredIn.get(directory) ?? new Set<string>()
      keys.add(keyOf(entry.ecosystem, entry.name))
      declaredIn.set(directory, keys)
    }
  }
  const goModuleDirectories = new Set(
    files
      .filter(
        (path) => fileName(path) === 'go.mod' && !isNeverLookedAt(path) && !isIgnoredByGo(path)
      )
      .map(directoryOf)
  )
  /** Whether a manifest in the file's directory or above declares the Library — for Go, its own go.mod. */
  const isDeclaredFor = (ecosystem: Ecosystem, key: string, file: string): boolean => {
    for (let directory: string | undefined = directoryOf(file); ;) {
      if (declaredIn.get(`${ecosystem}\n${directory}`)?.has(key)) return true
      // A Go module ends at its go.mod: what an outer module requires is not the inner one's.
      if (ecosystem === 'go' && goModuleDirectories.has(directory)) return false
      if (directory === '') return false
      directory = directoryOf(directory)
    }
  }

  const byEcosystem = new Map<Ecosystem, Entry[]>()
  for (const entry of entries.values()) {
    byEcosystem.set(entry.ecosystem, [...(byEcosystem.get(entry.ecosystem) ?? []), entry])
  }
  for (const use of [
    ...dependencies.libraries.map((use) => ({ ...use, builtIn: false })),
    ...(dependencies.builtIns ?? []).map((use) => ({ ...use, builtIn: true }))
  ]) {
    const file = owned.get(use.file)
    const ecosystem = file === undefined ? undefined : ECOSYSTEM_OF[file.language]
    if (file === undefined || ecosystem === undefined) continue
    // The declared Libraries that name what is used, the longest name first.
    let best = 0
    let matching: Entry[] = []
    for (const entry of byEcosystem.get(ecosystem) ?? []) {
      const length = Math.max(
        0,
        ...entry.imports.map((name) => matchLength(ecosystem, name, use.library))
      )
      if (length === 0 || length < best) continue
      if (length > best) matching = []
      best = length
      matching.push(entry)
    }
    // A built-in module of Node is no Library: it is a use of `@types/node` where that is
    // declared, and of nothing else.
    if (use.builtIn) {
      if (matching.length === 0) continue
    } else if (
      // A package of types alone (`@types/x`) does not declare `x` for a use that runs: such a
      // use is of `x` as well, declared or not.
      matching.length > 0 &&
      !use.typeOnly &&
      matching.every((entry) => isTypesPackage(entry.ecosystem, entry.name))
    ) {
      matching = [...matching, undeclaredEntry(ecosystem, use.library)]
    }
    if (matching.length === 0) matching = [undeclaredEntry(ecosystem, use.library)]
    for (const entry of matching) {
      const component = file.component ?? ''
      const user = entry.users.get(component) ?? {
        files: new Map<string, Set<number>>(),
        undeclared: new Set<string>()
      }
      const lines = user.files.get(use.file) ?? new Set<number>()
      for (const line of use.lines) lines.add(line)
      user.files.set(use.file, lines)
      if (!isDeclaredFor(ecosystem, keyOf(ecosystem, entry.name), use.file))
        user.undeclared.add(use.file)
      entry.users.set(component, user)
    }
  }

  /** The entry of a Library by the name the code uses, made where no manifest declares it. */
  function undeclaredEntry(ecosystem: Ecosystem, library: string): Entry {
    const key = keyOf(ecosystem, library)
    let entry = entries.get(key)
    if (!entry) {
      entry = { ecosystem, name: library, declared: [], imports: [library], users: new Map() }
      entries.set(key, entry)
    }
    return entry
  }

  // What is installed, and the licence it declares.
  const npm = npmPackages(fs)
  const libraries: InventoryLibrary[] = []
  for (const entry of entries.values()) {
    const installed = await installedOf(fs, entry, npm, distributionOf, distributionImporting)
    const usedBy = [...entry.users]
      .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : compare(a, b)))
      .map(([component, user]): LibraryUser => {
        const files = [...user.files.keys()].sort(compare)
        const tests = files.filter((path) => owned.get(path)?.test === true)
        return {
          ...(component === '' ? {} : { component }),
          files,
          lines: Object.fromEntries(
            files.map((path) => [path, [...user.files.get(path)!].sort((a, b) => a - b)])
          ),
          tests,
          testOnly: tests.length === files.length,
          undeclared: [...user.undeclared].sort(compare)
        }
      })
    const { licence, ...where } = installed ?? {
      licence: {
        kind: 'unknown',
        reason: entry.ecosystem === 'maven' ? 'outside' : 'not-installed'
      } satisfies Licence
    }
    libraries.push({
      ecosystem: entry.ecosystem,
      name: entry.name,
      declared: entry.declared,
      imports: entry.imports,
      ...(entry.mapping === undefined ? {} : { mapping: entry.mapping }),
      usedBy,
      ...('path' in where ? { installed: where as Omit<Installed, 'licence'> } : {}),
      licence
    })
  }
  libraries.sort(
    (a, b) =>
      compare(a.name.toLowerCase(), b.name.toLowerCase()) ||
      compare(a.name, b.name) ||
      compare(a.ecosystem, b.ecosystem)
  )
  const notRead = dependencies.manifestsNotRead ?? []
  return { libraries, ...(notRead.length > 0 && { notRead }) }

  /** Where the entry is installed: from the manifests that declare it, or the files that use it. */
  async function installedOf(
    fs: FileSystem,
    entry: Entry,
    npm: ReturnType<typeof npmPackages>,
    distributionOf: ReadonlyMap<string, InstalledDistribution>,
    distributionImporting: ReadonlyMap<string, InstalledDistribution>
  ): Promise<Installed | undefined> {
    const from = [
      ...entry.declared.map((declaration) => manifestDirectory(declaration.manifest)),
      ...[...entry.users.values()].flatMap((user) => [...user.files.keys()].map(directoryOf))
    ]
    switch (entry.ecosystem) {
      case 'npm':
        for (const directory of new Set(from)) {
          const installed = await npm(entry.name, directory)
          if (installed) return installed
        }
        return undefined
      case 'python':
        return entry.declared.length > 0
          ? distributionOf.get(normalisedPython(entry.name))
          : distributionImporting.get(entry.name)
      case 'go':
        for (const declaration of entry.declared) {
          const vendored = await goVendored(fs, manifestDirectory(declaration.manifest), entry.name)
          if (vendored) return vendored
        }
        return undefined
      case 'maven':
        // The local repository of Maven lies outside the repository, and is not read.
        return undefined
    }
  }
}

/**
 * What a Library is to a scope — the whole repository, or a Component with the Components
 * inside it:
 * - `used`: its files use it, and a manifest declares it for each of them;
 * - `unused`: a manifest of the scope declares it, and none of its files uses it;
 * - `undeclared`: one of its files uses it, and no manifest in that file's directory or above
 *   declares it.
 */
export type LibraryStatus = 'used' | 'unused' | 'undeclared'

/** A Library as a scope sees it. */
export interface ScopedLibrary {
  readonly library: InventoryLibrary
  readonly status: LibraryStatus
  /** The declarations of the manifests that belong to the scope. */
  readonly declared: readonly LibraryDeclaration[]
  /**
   * The versions declared, each once, in the order of the manifests: those of the scope, or,
   * where none of its manifests declares the Library, those of every manifest that does.
   */
  readonly versions: readonly string[]
  /** The uses by the Source Files of the scope, per Component. */
  readonly usedBy: readonly LibraryUser[]
}

/**
 * The Libraries a scope declares or uses, in the order of the inventory: the whole repository
 * when `component` is left out, or else the Component and those inside it. A manifest belongs to
 * the scope by its Component; a manifest of no Component, to the repository's alone.
 */
export function librariesIn(inventory: LibraryInventory, component?: string): ScopedLibrary[] {
  const inScope = (id: string | undefined): boolean =>
    component === undefined ||
    (id !== undefined && (id === component || id.startsWith(`${component}/`)))
  const scoped: ScopedLibrary[] = []
  for (const library of inventory.libraries) {
    const declared = library.declared.filter((declaration) => inScope(declaration.component))
    const usedBy = library.usedBy.filter((user) => inScope(user.component))
    if (declared.length === 0 && usedBy.length === 0) continue
    const versionsOf = (declarations: readonly LibraryDeclaration[]): string[] => [
      ...new Set(declarations.flatMap((declaration) => declaration.version ?? []))
    ]
    const status: LibraryStatus = usedBy.some((user) => user.undeclared.length > 0)
      ? 'undeclared'
      : usedBy.length === 0
        ? 'unused'
        : 'used'
    scoped.push({
      library,
      status,
      declared,
      versions: versionsOf(declared.length > 0 ? declared : library.declared),
      usedBy
    })
  }
  return scoped
}

/** How a declared name is tied to the names the code uses. */
function mappingOf(
  ecosystem: Ecosystem,
  name: string,
  distributionOf: ReadonlyMap<string, InstalledDistribution>
): { imports: string[]; mapping: Mapping } {
  switch (ecosystem) {
    case 'npm':
      return { imports: [typedPackage(name) ?? name], mapping: 'same' }
    case 'go':
      return { imports: [name], mapping: 'same' }
    case 'python': {
      const normalised = normalisedPython(name)
      const installed = distributionOf.get(normalised)
      if (installed && installed.imports.length > 0) {
        return { imports: [...installed.imports], mapping: 'installed' }
      }
      const known = PYTHON_IMPORTS.get(normalised)
      if (known) return { imports: [...known], mapping: 'known' }
      // `google-cloud-storage` below the namespace `google`, as `google.cloud`.
      const [top, second] = normalised.split('-')
      if (second !== undefined && PYTHON_NAMESPACES.has(top!)) {
        return { imports: [`${top}.${second}`], mapping: 'normalised' }
      }
      return { imports: [normalised.replaceAll('-', '_')], mapping: 'normalised' }
    }
    case 'maven': {
      const known = JAVA_PACKAGES.get(name)
      if (known) return { imports: [...known], mapping: 'known' }
      return { imports: [name.slice(0, name.indexOf(':'))], mapping: 'group' }
    }
  }
}
