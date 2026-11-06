/**
 * The Libraries a repository's manifests declare, for the Library inventory
 * (docs/structure-format.md, section 3, "Manifests"): `package.json`, `pom.xml`,
 * `build.gradle` and `build.gradle.kts`, `pyproject.toml`, `requirements.txt` and `go.mod`,
 * read as text. Nothing is run, installed or looked up: what is listed is what the files say,
 * as they say it. What the repository holds itself — a workspace package, a Maven module, a
 * Go module of the repository — is no Library.
 */
import type { FileSystem } from '@adr-tool/kernel'
import { goModules } from './go/modules'
import { inGradle, readCatalog } from './libraries/gradle'
import { inPoms } from './libraries/maven'
import { inPackageJson, packageName } from './libraries/package-json'
import { parsePyproject } from './python/projects'
import { isNeverLookedAt } from './source-files'
import { workspacePackages } from './workspace'

/** A Library as a manifest declares it. */
export interface ManifestLibrary {
  /** The manifest, relative to the repository root: `pyproject.toml`, `api/go.mod`. */
  readonly manifest: string
  /** As the manifest names it: the distribution `PyYAML`, the module `github.com/google/uuid`. */
  readonly name: string
  /** As written: `>=2.31`, `^2.0`, `v1.6.0`. Missing where none is. */
  readonly version?: string
  /**
   * Where the manifest does not count it among what the code needs to run: the key of a
   * `package.json` it is under (`dev`, `peer`, `optional`), the scope of Maven (`test`,
   * `provided`) or the configuration of Gradle (`testImplementation`), the optional or
   * development group of Python it is in (`dev`), or `indirect` for a requirement go.mod marks so.
   */
  readonly group?: string
  /**
   * The line of the manifest that declares it, from 1: the first of a requirement continued
   * over several. Missing only where a `pyproject.toml` writes it so that its text does not
   * show it as it reads — a string with an escape in it, say.
   */
  readonly line?: number
}

const fileName = (path: string): string => path.slice(path.lastIndexOf('/') + 1)
const isRequirements = (path: string): boolean =>
  /^requirements(?:[-_.][^/]*)?\.txt$/.test(fileName(path)) ||
  (/\.txt$/.test(path) && path.split('/').at(-2) === 'requirements')

/** The manifests that are read whole, the poms of the repository together. */
const isPom = (path: string): boolean => fileName(path) === 'pom.xml'
const isGradle = (path: string): boolean => /^build\.gradle(?:\.kts)?$/.test(fileName(path))

/** A manifest that could not be read to its end, and why: it names no Library. */
export interface ManifestNotRead {
  readonly manifest: string
  /** What its reader said: the message of the error it failed with. */
  readonly message: string
}

/** The message of what a reader failed with. */
const messageOf = (error: unknown): string =>
  error instanceof RangeError && /call stack/i.test(error.message)
    ? 'It is nested too deeply for its reader.'
    : error instanceof Error
      ? error.message
      : String(error)

/**
 * Every Library the manifests of a repository declare, manifest by manifest in path order. A
 * manifest whose reader fails on it names nothing and is told to `notRead`; every other one is
 * read all the same.
 */
export async function manifestLibraries(
  fs: FileSystem,
  files: readonly string[],
  notRead: (manifest: ManifestNotRead) => void = () => {}
): Promise<ManifestLibrary[]> {
  const failed = (manifest: string, error: unknown): void =>
    notRead({ manifest, message: messageOf(error) })
  /** What `read` gives, or nothing where it fails: one manifest does not stop the others. */
  const guarded = <T>(manifest: string, read: () => T): T | undefined => {
    try {
      return read()
    } catch (error) {
      failed(manifest, error)
      return undefined
    }
  }
  const found: ManifestLibrary[] = []
  const manifests = files.filter((path) => !isNeverLookedAt(path)).sort()
  const read = (path: string): Promise<string | undefined> =>
    fs.readText(path).catch(() => undefined)
  const goRead = await goModules(fs, manifests)
  const go = new Map(
    goRead.modules.map((module) => [
      module.directory === '' ? 'go.mod' : `${module.directory}/go.mod`,
      module
    ])
  )
  // A module of the repository, or one replaced by a directory of it, is the repository's own.
  const goLocal = new Set([
    ...goRead.modules.map((module) => module.path),
    ...goRead.modules.flatMap((module) => module.replaces.map((replace) => replace.path)),
    ...goRead.replaces.map((replace) => replace.path)
  ])

  // The packages the workspace holds, and the root package: by their names.
  const local = new Set<string>()
  if (manifests.some((path) => fileName(path) === 'package.json')) {
    for (const directory of ['', ...(await workspacePackages(fs, manifests))]) {
      const path = directory === '' ? 'package.json' : `${directory}/package.json`
      const text = await read(path)
      const name = guarded(path, () => packageName(text))
      if (name !== undefined) local.add(name)
    }
  }
  const poms = new Map<string, string>()
  for (const path of manifests.filter(isPom)) {
    const text = await read(path)
    if (text !== undefined) poms.set(path, text)
  }
  const fromPoms = new Map<string, ManifestLibrary[]>()
  for (const library of inPoms(poms, failed)) {
    fromPoms.set(library.manifest, [...(fromPoms.get(library.manifest) ?? []), library])
  }
  const catalogText = manifests.includes('gradle/libs.versions.toml')
    ? await read('gradle/libs.versions.toml')
    : undefined
  const catalog =
    catalogText === undefined
      ? undefined
      : guarded('gradle/libs.versions.toml', () => readCatalog(catalogText))

  for (const path of manifests) {
    if (fileName(path) === 'package.json') {
      const text = await read(path)
      if (text !== undefined) {
        found.push(...(guarded(path, () => inPackageJson(path, text, (n) => local.has(n))) ?? []))
      }
    } else if (isPom(path)) {
      found.push(...(fromPoms.get(path) ?? []))
    } else if (isGradle(path)) {
      const text = await read(path)
      if (text !== undefined)
        found.push(...(guarded(path, () => inGradle(path, text, catalog)) ?? []))
    } else if (fileName(path) === 'pyproject.toml') {
      const text = await read(path)
      const document = text === undefined ? undefined : guarded(path, () => parsePyproject(text))
      if (document) {
        found.push(...(guarded(path, () => inPyproject(path, document, linesOf(text!))) ?? []))
      }
    } else if (isRequirements(path)) {
      const text = await read(path)
      if (text !== undefined) found.push(...(guarded(path, () => inRequirements(path, text)) ?? []))
    } else if (go.has(path)) {
      for (const requirement of go.get(path)!.requires) {
        if (goLocal.has(requirement.path)) continue
        found.push({
          manifest: path,
          name: requirement.path,
          version: requirement.version,
          ...(requirement.indirect ? { group: 'indirect' } : {}),
          line: requirement.line
        })
      }
    }
  }
  return found
}

/**
 * A requirement as PEP 508 writes it: `requests[socks]>=2.31; python_version < "3.13"`. The
 * name without extras; the version is what stands between them and the markers, unless it is
 * a URL (`name @ https://…`).
 */
function requirementOf(
  manifest: string,
  written: string,
  group: string | undefined,
  line: number | undefined
): ManifestLibrary | undefined {
  const match = /^\s*([A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?)\s*(?:\[[^\]]*\])?\s*([^;]*)/.exec(
    written
  )
  if (!match) return undefined
  const rest = match[2]!
    .trim()
    .replace(/^\((.*)\)$/, '$1')
    .trim()
  // What follows the name is a version, a URL, or nothing; else it was a path, not a name.
  if (rest !== '' && !/^[<>=!~@]/.test(rest)) return undefined
  const version = rest === '' || rest.startsWith('@') ? undefined : rest
  return {
    manifest,
    name: match[1]!,
    ...(version === undefined ? {} : { version }),
    ...(group === undefined ? {} : { group }),
    ...(line === undefined ? {} : { line })
  }
}

/** Where a string or a key stands in a `pyproject.toml`: its line, and the table it is in. */
interface Place {
  readonly line: number
  readonly table: string
  taken: boolean
}

/** The places of one value, in the order of the text; those before `next` are all taken. */
interface Places {
  readonly all: Place[]
  next: number
}

/** The line a string or a key of a `pyproject.toml` stands on, each taken once. */
interface Lines {
  /** A string of an array: a requirement as PEP 508 writes it. */
  readonly string: (within: readonly string[], value: string) => number | undefined
  /** A key of a table: a Library as Poetry names it. */
  readonly key: (within: readonly string[], name: string) => number | undefined
}

/**
 * Finds the lines of a `pyproject.toml` that declare what its data holds: smol-toml gives the
 * data, not where it stands. One pass over the text notes every string and every key with its
 * line and the table its header opened; a place is taken once, so that a requirement written
 * twice gets the line of each. A string with an escape in it is not noted: its text is not
 * what it reads.
 */
function linesOf(text: string): Lines {
  const strings = new Map<string, Places>()
  const keys = new Map<string, Places>()
  const note = (places: Map<string, Places>, value: string, line: number, table: string): void => {
    const place = { line, table, taken: false }
    const known = places.get(value)
    if (known) known.all.push(place)
    else places.set(value, { all: [place], next: 0 })
  }
  /** The brackets and braces open across lines, outside of strings. */
  const open: string[] = []
  let table = ''
  text.split(/\r?\n/).forEach((line, index) => {
    let at = 0
    const skipBlanks = (): void => {
      while (line[at] === ' ' || line[at] === '\t') at++
    }
    skipBlanks()
    if (open.length === 0 && line[at] === '[') {
      const end = line.indexOf(']', at)
      if (end > at) {
        table = line
          .slice(at, end)
          .replace(/^\[+/, '')
          .split('.')
          .map((part) => part.trim().replace(/^["']|["']$/g, ''))
          .join('.')
        return
      }
    }
    // A key begins a line outside of an array, and follows `{` or `,` in an inline table.
    let key = open.length === 0
    while (at < line.length) {
      const char = line[at]!
      if (char === '#') break
      if (char === '"' || char === "'") {
        let end = at + 1
        let escaped = false
        while (end < line.length && line[end] !== char) {
          if (char === '"' && line[end] === '\\') {
            escaped = true
            end++
          }
          end++
        }
        // A string that goes on over the next line is not followed.
        if (end >= line.length) break
        const value = line.slice(at + 1, end)
        at = end + 1
        skipBlanks()
        const isKey = key && line[at] === '='
        if (!escaped) note(isKey ? keys : strings, value, index + 1, table)
        key = false
        continue
      }
      if (key && /[A-Za-z0-9_-]/.test(char)) {
        const begin = at
        while (at < line.length && /[A-Za-z0-9_.-]/.test(line[at]!)) at++
        const name = line.slice(begin, at)
        skipBlanks()
        if (line[at] === '=') note(keys, name, index + 1, table)
        key = false
        continue
      }
      if (char === ' ' || char === '\t') {
        at++
        continue
      }
      if (char === '[' || char === '{') open.push(char)
      else if (char === ']' || char === '}') open.pop()
      key = (char === '{' || char === ',') && open.at(-1) === '{'
      at++
    }
  })
  /** The first place of a value not yet taken, in one of the tables it may stand in. */
  const take = (
    places: Map<string, Places>,
    value: string,
    within: readonly string[]
  ): number | undefined => {
    const known = places.get(value)
    if (!known) return undefined
    for (let index = known.next; index < known.all.length; index++) {
      const place = known.all[index]!
      if (place.taken || !within.includes(place.table)) continue
      place.taken = true
      // What a value written many times takes comes mostly from the front: skip it next time.
      while (known.next < known.all.length && known.all[known.next]!.taken) known.next++
      return place.line
    }
    return undefined
  }
  return {
    string: (within, value) => take(strings, value, within),
    key: (within, name) => take(keys, name, within)
  }
}

const tableOf = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
const listOf = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

/**
 * PEP 621's `dependencies` and `optional-dependencies` of `[project]`, PEP 735's
 * `[dependency-groups]`, and Poetry's `[tool.poetry.dependencies]`, its `dev-dependencies` and
 * its groups. Poetry's `python` is the interpreter, not a Library.
 */
function inPyproject(
  manifest: string,
  document: Record<string, unknown>,
  lines: Lines
): ManifestLibrary[] {
  const found: ManifestLibrary[] = []
  // The tables a key may stand in: its own, or one above it with a dotted key or inline.
  const above = (...tables: string[]): string[] => [...tables, '']
  const add = (written: readonly string[], within: string[], group?: string): void => {
    for (const item of written) {
      const library = requirementOf(manifest, item, group, lines.string(within, item))
      if (library) found.push(library)
    }
  }
  const project = tableOf(document['project'])
  add(listOf(project['dependencies']), above('project'))
  for (const [group, list] of Object.entries(tableOf(project['optional-dependencies']))) {
    add(listOf(list), above('project.optional-dependencies', 'project'), group)
  }
  for (const [group, list] of Object.entries(tableOf(document['dependency-groups']))) {
    add(listOf(list), above('dependency-groups'), group)
  }

  const poetry = tableOf(tableOf(document['tool'])['poetry'])
  const addPoetry = (table: unknown, within: string[], group?: string): void => {
    for (const [name, value] of Object.entries(tableOf(table))) {
      if (name === 'python') continue
      const version = typeof value === 'string' ? value : tableOf(value)['version']
      const line = lines.key(within, name)
      found.push({
        manifest,
        name,
        ...(typeof version === 'string' ? { version } : {}),
        ...(group === undefined ? {} : { group }),
        ...(line === undefined ? {} : { line })
      })
    }
  }
  const poetryTables = ['tool.poetry', 'tool']
  addPoetry(poetry['dependencies'], above('tool.poetry.dependencies', ...poetryTables))
  addPoetry(
    poetry['dev-dependencies'],
    above('tool.poetry.dev-dependencies', ...poetryTables),
    'dev'
  )
  for (const [group, table] of Object.entries(tableOf(poetry['group']))) {
    addPoetry(
      tableOf(table)['dependencies'],
      above(
        `tool.poetry.group.${group}.dependencies`,
        `tool.poetry.group.${group}`,
        'tool.poetry.group',
        ...poetryTables
      ),
      group
    )
  }
  return found
}

/**
 * `requirements.txt`: one requirement a line, comments and options (`-r`, `-e`, `--hash`) left
 * out, a line continued with `\`. Another file named with `-r` is read where it is a manifest
 * of its own, not through the one that names it.
 */
function inRequirements(manifest: string, text: string): ManifestLibrary[] {
  const found: ManifestLibrary[] = []
  const lines = text.split(/\r?\n/)
  for (let index = 0; index < lines.length; index++) {
    const first = index + 1
    const parts = [lines[index]!]
    while (parts.at(-1)!.endsWith('\\') && index + 1 < lines.length) {
      parts.push(parts.pop()!.slice(0, -1), lines[++index]!)
    }
    const line = parts.join(' ')
    const written = line.replace(/(^|\s)#.*$/, '').trim()
    if (written === '' || written.startsWith('-') || /^[a-z+]+:\/\//i.test(written)) continue
    const library = requirementOf(manifest, written.replace(/\s--\S+.*$/, ''), undefined, first)
    if (library) found.push(library)
  }
  return found
}
