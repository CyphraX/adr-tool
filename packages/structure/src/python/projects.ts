/**
 * The Python projects of a repository and the directories their packages lie in — their
 * source roots (docs/structure-format.md, section 3, "Python") — and the members of a uv
 * workspace, which the Draft takes as units. `pyproject.toml`, `setup.cfg` and `setup.py` are
 * read as text; nothing is run, and nothing is installed.
 */
import { parse as parseToml } from 'smol-toml'
import { normalizePath, type FileSystem } from '@adr-tool/kernel'
import { matcherOf } from '../patterns'
import { isNeverLookedAt } from '../source-files'

/** The files that make a directory a Python project. */
export const PYTHON_PROJECT_FILES = ['pyproject.toml', 'setup.cfg', 'setup.py'] as const

export interface PythonProject {
  /** The directory of its `pyproject.toml`, `setup.cfg` or `setup.py`; `''` is the root. */
  readonly directory: string
  /**
   * Where its absolute imports are looked up, in order: what its configuration names, then
   * its `src`, then its own directory. Relative to the repository root.
   */
  readonly roots: readonly string[]
}

const join = (directory: string, path: string): string =>
  directory === '' ? path : `${directory}/${path}`

const strings = (value: unknown): string[] =>
  typeof value === 'string'
    ? [value]
    : Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : []

/** A table of a TOML document, by its keys; `undefined` where it is not one. */
function tableAt(document: unknown, ...keys: string[]): Record<string, unknown> | undefined {
  let value = document
  for (const key of keys) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
    value = (value as Record<string, unknown>)[key]
  }
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

/** `pyproject.toml` as data; `undefined` where it is missing or is not TOML. */
export async function readPyproject(
  fs: FileSystem,
  path: string
): Promise<Record<string, unknown> | undefined> {
  const text = await fs.readText(path).catch(() => undefined)
  if (text === undefined) return undefined
  try {
    return parseToml(text) as Record<string, unknown>
  } catch {
    // A file that cannot be read names nothing.
    return undefined
  }
}

/**
 * The directories `pyproject.toml` names as the place of its packages, relative to it, and
 * those pytest imports from where `pytest` is asked for.
 */
function rootsInPyproject(document: Record<string, unknown>, pytest: boolean): string[] {
  const tool = tableAt(document, 'tool') ?? {}
  const roots: string[] = []
  // setuptools: `package-dir = { "" = "src" }`, `[tool.setuptools.packages.find] where`.
  const packageDir = tableAt(tool, 'setuptools', 'package-dir')?.['']
  roots.push(...strings(packageDir))
  roots.push(...strings(tableAt(tool, 'setuptools', 'packages', 'find')?.['where']))
  // Poetry: `packages = [{ include = "shop", from = "src" }]`.
  const poetry = tableAt(tool, 'poetry')?.['packages']
  if (Array.isArray(poetry)) {
    for (const entry of poetry) {
      if (typeof entry === 'object' && entry !== null) {
        roots.push(...strings((entry as Record<string, unknown>)['from']))
      }
    }
  }
  // Hatch: `packages = ["src/shop"]` names the package, which lies in its root.
  for (const path of strings(tableAt(tool, 'hatch', 'build', 'targets', 'wheel')?.['packages'])) {
    // Without its trailing slashes, counted rather than matched: the text is the repository's.
    let end = path.length
    while (end > 0 && path[end - 1] === '/') end--
    const at = end === 0 ? -1 : path.lastIndexOf('/', end - 1)
    if (at > 0) roots.push(path.slice(0, at))
  }
  // PDM and uv's build backend.
  roots.push(...strings(tableAt(tool, 'pdm', 'build')?.['package-dir']))
  roots.push(...strings(tableAt(tool, 'uv', 'build-backend')?.['module-root']))
  if (pytest) roots.push(...strings(tableAt(tool, 'pytest', 'ini_options')?.['pythonpath']))
  return roots
}

/**
 * `setup.cfg`, an INI file: `package_dir` of `[options]` with its root for `""` — written
 * `=src` —, `where` of `[options.packages.find]`, and `pythonpath` of `[tool:pytest]` where
 * `pytest` is asked for.
 */
function rootsInSetupCfg(text: string, pytest: boolean): string[] {
  const roots: string[] = []
  let section = ''
  let key = ''
  const take = (value: string): void => {
    const trimmed = value.trim()
    if (trimmed === '') return
    if (section === 'options' && key === 'package_dir') {
      const mapping = /^([^=\s]*)\s*=\s*(\S+)$/.exec(trimmed)
      if (mapping && mapping[1] === '') roots.push(mapping[2]!)
    } else if (
      (section === 'options.packages.find' && key === 'where') ||
      (pytest && section === 'tool:pytest' && key === 'pythonpath')
    ) {
      roots.push(...trimmed.split(/\s+/))
    }
  }
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*[#;]/.test(line) || line.trim() === '') continue
    const header = /^\[([^\]]+)\]\s*$/.exec(line)
    if (header) {
      section = header[1]!.trim()
      key = ''
    } else if (/^\s/.test(line)) {
      // A value continued on the next, indented line.
      take(line)
    } else {
      // `key = value` or `key: value`, split at the first `=` or `:` that follows a key. Found
      // with indexOf, not with a pattern, so that a long line takes as long as it is long.
      const equals = line.indexOf('=')
      const colon = line.indexOf(':')
      const at = equals === -1 ? colon : colon === -1 ? equals : Math.min(equals, colon)
      key = at > 0 ? line.slice(0, at).trim() : ''
      if (at > 0) take(line.slice(at + 1))
    }
  }
  return roots
}

/** `setup.py`, as text and string literals only: `package_dir={'': 'src'}`, `where='src'`. */
function rootsInSetupPy(text: string): string[] {
  const roots: string[] = []
  for (const match of text.matchAll(/package_dir\s*=\s*\{\s*(['"])\1\s*:\s*(['"])([^'"\n]+)\2/g)) {
    roots.push(match[3]!)
  }
  for (const match of text.matchAll(/\bwhere\s*=\s*(['"])([^'"\n]+)\1/g)) roots.push(match[2]!)
  return roots
}

/**
 * The directories a project's configuration names as the place of its packages, and where
 * `pytest` is asked for, those its tests import from.
 */
async function configuredRoots(
  fs: FileSystem,
  known: ReadonlySet<string>,
  directory: string,
  pytest: boolean
): Promise<string[]> {
  const roots: string[] = []
  const at = (name: string): string => join(directory, name)
  if (known.has(at('pyproject.toml'))) {
    const document = await readPyproject(fs, at('pyproject.toml'))
    if (document) roots.push(...rootsInPyproject(document, pytest))
  }
  if (known.has(at('setup.cfg'))) {
    const text = (await fs.readText(at('setup.cfg')).catch(() => '')) ?? ''
    roots.push(...rootsInSetupCfg(text, pytest))
  }
  if (known.has(at('setup.py'))) {
    roots.push(...rootsInSetupPy((await fs.readText(at('setup.py')).catch(() => '')) ?? ''))
  }
  return roots.flatMap((root) => {
    // Inside the repository only, wherever the file points.
    const path = normalizePath(join(directory, root))
    return path === undefined ? [] : [path]
  })
}

/**
 * Every directory that holds a `pyproject.toml`, `setup.cfg` or `setup.py`, and the root of the
 * repository in any case, each with its source roots: what its configuration names — pytest's
 * `pythonpath` included —, then its `src` where that holds Python, then its own directory.
 */
export async function pythonProjects(
  fs: FileSystem,
  files: readonly string[],
  python: readonly string[]
): Promise<PythonProject[]> {
  const known = new Set(files)
  const directories = new Set([''])
  for (const path of files) {
    if (isNeverLookedAt(path)) continue
    const name = path.slice(path.lastIndexOf('/') + 1)
    if ((PYTHON_PROJECT_FILES as readonly string[]).includes(name)) {
      directories.add(path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '')
    }
  }
  const projects: PythonProject[] = []
  for (const directory of [...directories].sort()) {
    const src = join(directory, 'src')
    const roots = [
      ...(await configuredRoots(fs, known, directory, true)),
      ...(python.some((path) => path.startsWith(`${src}/`)) ? [src] : []),
      directory
    ]
    projects.push({ directory, roots: [...new Set(roots)] })
  }
  return projects
}

/**
 * The directory the Draft takes as a Python project's source root: the first that its
 * packaging configuration names — not pytest's, which may name the tests. `undefined` where
 * it names none.
 */
export async function configuredSourceRoot(
  fs: FileSystem,
  files: readonly string[],
  directory: string
): Promise<string | undefined> {
  const roots = await configuredRoots(fs, new Set(files), directory, false)
  return roots.find((root) => root !== directory)
}

/**
 * The members of a uv workspace: the directories the globs of `members` in
 * `[tool.uv.workspace]` of the root `pyproject.toml` name, without those of `exclude`, that
 * hold a `pyproject.toml`.
 */
export async function uvWorkspaceMembers(
  fs: FileSystem,
  files: readonly string[]
): Promise<string[]> {
  if (!files.includes('pyproject.toml')) return []
  const workspace = tableAt(await readPyproject(fs, 'pyproject.toml'), 'tool', 'uv', 'workspace')
  const members = strings(workspace?.['members'])
  if (members.length === 0) return []
  const isMember = matcherOf(
    [...members, ...strings(workspace?.['exclude']).map((glob) => `!${glob}`)],
    true
  )
  return files
    .filter((path) => path.endsWith('/pyproject.toml'))
    .map((path) => path.slice(0, -'/pyproject.toml'.length))
    .filter(isMember)
}
