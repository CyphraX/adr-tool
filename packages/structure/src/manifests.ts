/**
 * The Libraries a repository's manifests declare, for the Library inventory
 * (docs/structure-format.md, section 3, "Manifests"): `pyproject.toml`, `requirements.txt` and
 * `go.mod`, read as text. Nothing is run, installed or looked up: what is listed is what the
 * files say, as they say it.
 */
import type { FileSystem } from '@adr-tool/kernel'
import { goModules } from './go/modules'
import { readPyproject } from './python/projects'
import { isNeverLookedAt } from './source-files'

/** A Library as a manifest declares it. */
export interface ManifestLibrary {
  /** The manifest, relative to the repository root: `pyproject.toml`, `api/go.mod`. */
  readonly manifest: string
  /** As the manifest names it: the distribution `PyYAML`, the module `github.com/google/uuid`. */
  readonly name: string
  /** As written: `>=2.31`, `^2.0`, `v1.6.0`. Missing where none is. */
  readonly version?: string
  /**
   * Where the manifest does not count it among what the code needs to run: the optional or
   * development group of Python it is in (`dev`), or `indirect` for a requirement go.mod marks so.
   */
  readonly group?: string
}

const fileName = (path: string): string => path.slice(path.lastIndexOf('/') + 1)
const isRequirements = (path: string): boolean =>
  /^requirements(?:[-_.][^/]*)?\.txt$/.test(fileName(path)) ||
  (/\.txt$/.test(path) && path.split('/').at(-2) === 'requirements')

/** Every Library the manifests of a repository declare, manifest by manifest in path order. */
export async function manifestLibraries(
  fs: FileSystem,
  files: readonly string[]
): Promise<ManifestLibrary[]> {
  const found: ManifestLibrary[] = []
  const manifests = files.filter((path) => !isNeverLookedAt(path)).sort()
  const go = new Map(
    (await goModules(fs, manifests)).modules.map((module) => [
      module.directory === '' ? 'go.mod' : `${module.directory}/go.mod`,
      module
    ])
  )
  for (const path of manifests) {
    if (fileName(path) === 'pyproject.toml') {
      const document = await readPyproject(fs, path)
      if (document) found.push(...inPyproject(path, document))
    } else if (isRequirements(path)) {
      const text = await fs.readText(path).catch(() => undefined)
      if (text !== undefined) found.push(...inRequirements(path, text))
    } else if (go.has(path)) {
      for (const requirement of go.get(path)!.requires) {
        found.push({
          manifest: path,
          name: requirement.path,
          version: requirement.version,
          ...(requirement.indirect ? { group: 'indirect' } : {})
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
  group?: string
): ManifestLibrary | undefined {
  const match = /^\s*([A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?)\s*(?:\[[^\]]*\])?\s*([^;]*)/.exec(
    written
  )
  if (!match) return undefined
  const rest = match[2]!.trim().replace(/^\((.*)\)$/, '$1').trim()
  // What follows the name is a version, a URL, or nothing; else it was a path, not a name.
  if (rest !== '' && !/^[<>=!~@]/.test(rest)) return undefined
  const version = rest === '' || rest.startsWith('@') ? undefined : rest
  return {
    manifest,
    name: match[1]!,
    ...(version === undefined ? {} : { version }),
    ...(group === undefined ? {} : { group })
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
function inPyproject(manifest: string, document: Record<string, unknown>): ManifestLibrary[] {
  const found: ManifestLibrary[] = []
  const add = (written: readonly string[], group?: string): void => {
    for (const item of written) {
      const library = requirementOf(manifest, item, group)
      if (library) found.push(library)
    }
  }
  const project = tableOf(document['project'])
  add(listOf(project['dependencies']))
  for (const [group, list] of Object.entries(tableOf(project['optional-dependencies']))) {
    add(listOf(list), group)
  }
  for (const [group, list] of Object.entries(tableOf(document['dependency-groups']))) {
    add(listOf(list), group)
  }

  const poetry = tableOf(tableOf(document['tool'])['poetry'])
  const addPoetry = (table: unknown, group?: string): void => {
    for (const [name, value] of Object.entries(tableOf(table))) {
      if (name === 'python') continue
      const version = typeof value === 'string' ? value : tableOf(value)['version']
      found.push({
        manifest,
        name,
        ...(typeof version === 'string' ? { version } : {}),
        ...(group === undefined ? {} : { group })
      })
    }
  }
  addPoetry(poetry['dependencies'])
  addPoetry(poetry['dev-dependencies'], 'dev')
  for (const [group, table] of Object.entries(tableOf(poetry['group']))) {
    addPoetry(tableOf(table)['dependencies'], group)
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
  for (const line of text.replace(/\\\r?\n/g, ' ').split(/\r?\n/)) {
    const written = line.replace(/(^|\s)#.*$/, '').trim()
    if (written === '' || written.startsWith('-') || /^[a-z+]+:\/\//i.test(written)) continue
    const library = requirementOf(manifest, written.replace(/\s--\S+.*$/, ''))
    if (library) found.push(library)
  }
  return found
}
