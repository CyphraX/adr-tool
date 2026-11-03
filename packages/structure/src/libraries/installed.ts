/**
 * What is installed inside the repository, and what it declares about itself
 * (docs/structure-format.md, section 3, "Declared licences"): the `package.json` of a package
 * in `node_modules`, the metadata of a Python distribution in a virtual environment of the
 * repository (`.venv`, `venv`), and the licence file of a Go module copied into `vendor`.
 * Read as text, within a limit of bytes each, through the file-system port, which never
 * follows a link out of the repository. Nothing is run, nothing is looked up outside, and a
 * licence is what a package declares: nothing is guessed from a text.
 */
import type { DirectoryEntry, FileSystem } from '@adr-tool/kernel'

/** What a Library declares about its licence, or why it cannot be told. */
export type Licence =
  /** As the metadata says it: an SPDX expression, or the text of a field. */
  | {
      readonly kind: 'declared'
      readonly licence: string
      /** The field it is read from. */
      readonly field: LicenceField
      /** The file it is read from, relative to the repository root. */
      readonly source: string
    }
  /** No metadata says it, but a licence file is there: it is not read for a name. */
  | { readonly kind: 'file'; readonly source: string }
  | { readonly kind: 'unknown'; readonly reason: UnknownLicence }

export type LicenceField = 'license' | 'licenses' | 'License-Expression' | 'License' | 'Classifier'

/**
 * Why a licence cannot be told: the Library is not installed inside the repository; it is,
 * and declares none; its metadata cannot be read or is larger than the limit; or it would lie
 * outside the repository, as a Java Library does in the local repository of Maven.
 */
export type UnknownLicence = 'not-installed' | 'not-declared' | 'unreadable' | 'outside'

/** An installed package: where, its version, and its licence. */
export interface Installed {
  /** The directory it is installed in, relative to the repository root. */
  readonly path: string
  readonly version?: string
  readonly licence: Licence
}

/** A Python distribution installed in a virtual environment of the repository. */
export interface InstalledDistribution extends Installed {
  /** As its metadata names it: `PyYAML`. */
  readonly name: string
  /** The top-level packages and modules it installs, which the code imports: `yaml`, `_yaml`. */
  readonly imports: readonly string[]
}

/** The most bytes of metadata read from a file. */
const LIMITS = {
  packageJson: 1024 * 1024,
  metadata: 1024 * 1024,
  topLevel: 64 * 1024,
  record: 8 * 1024 * 1024
}

const join = (directory: string, name: string): string =>
  directory === '' ? name : `${directory}/${name}`
const parentOf = (directory: string): string | undefined =>
  directory === ''
    ? undefined
    : directory.includes('/')
      ? directory.slice(0, directory.lastIndexOf('/'))
      : ''

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** The licence a `package.json` declares: `license`, or the older `licenses`. */
export function npmLicence(manifest: unknown, source: string): Licence {
  if (!isRecord(manifest)) return { kind: 'unknown', reason: 'unreadable' }
  const { license, licenses } = manifest
  const typeOf = (value: unknown): string | undefined =>
    typeof value === 'string'
      ? value
      : isRecord(value) && typeof value.type === 'string'
        ? value.type
        : undefined
  const single = typeOf(license)
  if (single !== undefined && single.trim() !== '') {
    return { kind: 'declared', licence: single.trim(), field: 'license', source }
  }
  const many = (Array.isArray(licenses) ? licenses : [licenses])
    .map(typeOf)
    .filter((type): type is string => type !== undefined && type.trim() !== '')
  if (many.length > 0) {
    return { kind: 'declared', licence: many.join(', '), field: 'licenses', source }
  }
  return { kind: 'unknown', reason: 'not-declared' }
}

/**
 * The npm packages installed for a directory, looked up as Node.js does: in `node_modules`
 * of the directory and of each one above it, up to the root of the repository. Each lookup
 * is remembered.
 */
export function npmPackages(
  fs: FileSystem
): (name: string, from: string) => Promise<Installed | undefined> {
  const holds = new Map<string, Promise<boolean>>()
  const found = new Map<string, Promise<Installed | undefined>>()
  const hasNodeModules = (directory: string): Promise<boolean> => {
    let known = holds.get(directory)
    if (!known) {
      known = fs.list(join(directory, 'node_modules')).then(
        (entries) => entries !== undefined,
        () => false
      )
      holds.set(directory, known)
    }
    return known
  }
  const at = async (directory: string, name: string): Promise<Installed | undefined> => {
    if (!(await hasNodeModules(directory))) return undefined
    const path = join(join(directory, 'node_modules'), name)
    const there = await fs.list(path).catch(() => undefined)
    if (there === undefined) return undefined
    const source = `${path}/package.json`
    const text = await fs.readText(source, { atMost: LIMITS.packageJson }).catch(() => undefined)
    let manifest: unknown
    try {
      manifest = text === undefined ? undefined : JSON.parse(text)
    } catch {
      manifest = undefined
    }
    const version =
      isRecord(manifest) && typeof manifest.version === 'string' ? manifest.version : undefined
    return {
      path,
      ...(version === undefined ? {} : { version }),
      licence:
        manifest === undefined
          ? { kind: 'unknown', reason: 'unreadable' }
          : npmLicence(manifest, source)
    }
  }
  return async (name, from) => {
    for (
      let directory: string | undefined = from;
      directory !== undefined;
      directory = parentOf(directory)
    ) {
      const key = `${directory}\n${name}`
      let known = found.get(key)
      if (!known) {
        known = at(directory, name)
        found.set(key, known)
      }
      const installed = await known
      if (installed) return installed
    }
    return undefined
  }
}

/**
 * The header fields of a Python distribution's `METADATA` (or `PKG-INFO`): up to the first
 * empty line, a line that begins with white space continuing the one before it.
 */
export function metadataFields(text: string): Map<string, string[]> {
  const fields = new Map<string, string[]>()
  let last: { name: string; values: string[] } | undefined
  for (const line of text.split('\n')) {
    const written = line.endsWith('\r') ? line.slice(0, -1) : line
    if (written === '') break
    if ((written.startsWith(' ') || written.startsWith('\t')) && last) {
      last.values[last.values.length - 1] += `\n${written.trim()}`
      continue
    }
    const colon = written.indexOf(':')
    if (colon <= 0) continue
    const name = written.slice(0, colon).trim()
    const value = written.slice(colon + 1).trim()
    const values = fields.get(name) ?? []
    values.push(value)
    fields.set(name, values)
    last = { name, values }
  }
  return fields
}

/**
 * The licence the metadata of a Python distribution declares: PEP 639's `License-Expression`,
 * else `License` where it says something, else the `License ::` classifiers; else none.
 */
export function pythonLicence(
  fields: ReadonlyMap<string, readonly string[]>,
  source: string
): Licence {
  const first = (name: string): string | undefined => fields.get(name)?.[0]?.trim() || undefined
  const expression = first('License-Expression')
  if (expression !== undefined) {
    return { kind: 'declared', licence: expression, field: 'License-Expression', source }
  }
  const license = first('License')
  if (license !== undefined && license.toUpperCase() !== 'UNKNOWN') {
    // A whole licence text is sometimes put here: its first line says what it is.
    return { kind: 'declared', licence: license.split('\n')[0]!.trim(), field: 'License', source }
  }
  const classifiers = (fields.get('Classifier') ?? [])
    .filter((classifier) => classifier.startsWith('License ::'))
    .map((classifier) => classifier.split('::').at(-1)!.trim())
    .filter((name) => name !== '' && name !== 'OSI Approved')
  if (classifiers.length > 0) {
    return { kind: 'declared', licence: classifiers.join(', '), field: 'Classifier', source }
  }
  return { kind: 'unknown', reason: 'not-declared' }
}

/** The top-level names a `RECORD` installs: `yaml` of `yaml/__init__.py`, `six` of `six.py`. */
export function recordTopLevels(text: string): string[] {
  const names = new Set<string>()
  for (const line of text.split('\n')) {
    const path = line.slice(0, line.indexOf(',') === -1 ? line.length : line.indexOf(',')).trim()
    if (path === '' || path.startsWith('..') || path.startsWith('/')) continue
    const slash = path.indexOf('/')
    const first = slash === -1 ? path : path.slice(0, slash)
    if (/\.(?:dist-info|egg-info|data)$/.test(first) || first === '__pycache__') continue
    if (slash !== -1) names.add(first)
    else if (first.endsWith('.py')) names.add(first.slice(0, -3))
    else if (/\.(?:so|pyd)$/.test(first)) names.add(first.slice(0, first.indexOf('.')))
  }
  return [...names].filter((name) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name)).sort()
}

/**
 * The Python distributions installed in the virtual environments of the repository: `.venv`
 * or `venv` in each of `directories`, with `lib/python*\/site-packages` (or
 * `Lib/site-packages`) in them.
 */
export async function pythonDistributions(
  fs: FileSystem,
  directories: readonly string[]
): Promise<InstalledDistribution[]> {
  const found: InstalledDistribution[] = []
  const list = (path: string): Promise<DirectoryEntry[] | undefined> =>
    fs.list(path).catch(() => undefined)
  const sitePackages: string[] = []
  for (const directory of new Set(directories)) {
    for (const venv of ['.venv', 'venv'].map((name) => join(directory, name))) {
      const entries = await list(venv)
      if (entries === undefined) continue
      for (const entry of entries) {
        if (entry.kind !== 'directory') continue
        if (entry.name === 'Lib') sitePackages.push(`${venv}/Lib/site-packages`)
        if (entry.name !== 'lib') continue
        for (const python of (await list(`${venv}/lib`)) ?? []) {
          if (python.kind === 'directory' && python.name.startsWith('python')) {
            sitePackages.push(`${venv}/lib/${python.name}/site-packages`)
          }
        }
      }
    }
  }
  for (const site of sitePackages) {
    for (const entry of (await list(site)) ?? []) {
      const kind = /\.dist-info$/.test(entry.name)
        ? 'dist'
        : /\.egg-info$/.test(entry.name)
          ? 'egg'
          : undefined
      if (entry.kind !== 'directory' || kind === undefined) continue
      const path = `${site}/${entry.name}`
      const source = `${path}/${kind === 'dist' ? 'METADATA' : 'PKG-INFO'}`
      const text = await fs.readText(source, { atMost: LIMITS.metadata }).catch(() => undefined)
      const fields = text === undefined ? new Map<string, string[]>() : metadataFields(text)
      const name =
        fields.get('Name')?.[0] ??
        entry.name.replace(/-[^-]*\.(?:dist|egg)-info$/, '').replace(/\.(?:dist|egg)-info$/, '')
      const version = fields.get('Version')?.[0]
      const topLevel = await fs
        .readText(`${path}/top_level.txt`, { atMost: LIMITS.topLevel })
        .catch(() => undefined)
      let imports =
        topLevel === undefined
          ? []
          : topLevel
              .split('\n')
              .map((line) => line.trim())
              .filter((line) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(line))
      if (imports.length === 0) {
        const record = await fs
          .readText(`${path}/RECORD`, { atMost: LIMITS.record })
          .catch(() => undefined)
        if (record !== undefined) imports = recordTopLevels(record)
      }
      let licence: Licence =
        text === undefined
          ? { kind: 'unknown', reason: 'unreadable' }
          : pythonLicence(fields, source)
      // No field says it: a licence file beside the metadata, or in its `licenses` (PEP 639).
      if (licence.kind === 'unknown' && text !== undefined) {
        licence =
          (await licenceFileIn(fs, path)) ??
          (await licenceFileIn(fs, `${path}/licenses`)) ??
          licence
      }
      found.push({ name, path, ...(version === undefined ? {} : { version }), imports, licence })
    }
  }
  return found
}

const LICENCE_FILE = /^(?:LICEN[CS]E|COPYING|UNLICENSE)(?:[-._].*)?$/i

/** A licence file in a directory, which is not read for a name; `undefined` where there is none. */
async function licenceFileIn(fs: FileSystem, directory: string): Promise<Licence | undefined> {
  const entries = await fs.list(directory).catch(() => undefined)
  const file = (entries ?? [])
    .filter((entry) => entry.kind === 'file' && LICENCE_FILE.test(entry.name))
    .map((entry) => entry.name)
    .sort()[0]
  return file === undefined ? undefined : { kind: 'file', source: `${directory}/${file}` }
}

/**
 * The licence of a Go module copied into `vendor/` beside the `go.mod` of its module: a
 * licence file, which is not read for a name — Go's metadata declares none.
 */
export async function goVendored(
  fs: FileSystem,
  moduleDirectory: string,
  modulePath: string
): Promise<Installed | undefined> {
  const path = join(join(moduleDirectory, 'vendor'), modulePath)
  if ((await fs.list(path).catch(() => undefined)) === undefined) return undefined
  return {
    path,
    licence: (await licenceFileIn(fs, path)) ?? { kind: 'unknown', reason: 'not-declared' }
  }
}
