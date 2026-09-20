/**
 * Spike (b) of docs/plan-structure.md: TypeScript's own module resolution on top of the
 * file-system port.
 *
 * The port is asynchronous and TypeScript's hosts are synchronous. The answer found here:
 * walk the repository once, keep the list of its paths and the text of the few files
 * resolution reads (`package.json`, `tsconfig*.json`), and answer TypeScript from that.
 * What a configuration file reaches for outside of it — an `extends` into `node_modules` —
 * is noted as a miss, loaded, and the configuration is parsed again, until nothing is missing.
 *
 * `node_modules` is never walked. Workspace packages are found by their `package.json`
 * and offered to TypeScript under a `node_modules` directory that exists only for it, so a
 * fresh clone resolves like an installed one.
 */
import ts from 'typescript'
import { joinPath, type FileSystem } from '@adr-tool/kernel'

export type Resolution =
  | { readonly kind: 'source-file'; readonly path: string }
  | { readonly kind: 'library'; readonly name: string }
  | { readonly kind: 'built-in' }
  /** A file that is there but is no Source File: a stylesheet, JSON, an image. */
  | { readonly kind: 'ignored' }
  | { readonly kind: 'not-resolved' }

export interface Resolver {
  /** The configuration file whose compiler options apply to a file, relative to the repository root. */
  configOf(file: string): string | undefined
  /** The compiler options resolution uses for a file. */
  optionsOf(file: string): ts.CompilerOptions
  resolve(specifier: string, from: string): Resolution
}

const ROOT = '/repo'
const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git'])
const CONFIG_FILE = /^(?:package|[tj]sconfig(?:\.[^/]+)?)\.json$/
const SOURCE_FILE = /\.(?:[cm]?[tj]s|[tj]sx|svelte)$/
const SVELTE: ts.FileExtensionInfo = {
  extension: '.svelte',
  isMixedContent: true,
  scriptKind: ts.ScriptKind.Deferred
}
const BUILT_IN = new Set(
  (
    'assert buffer child_process cluster console constants crypto dgram dns domain events fs http http2 ' +
    'https inspector module net os path perf_hooks process punycode querystring readline repl stream ' +
    'string_decoder sys timers tls tty url util v8 vm wasi worker_threads zlib'
  ).split(' ')
)

const virtual = (path: string): string => (path === '' ? ROOT : `${ROOT}/${path}`)
const relative = (path: string): string => (path === ROOT ? '' : path.slice(ROOT.length + 1))
const directoryOf = (path: string): string =>
  path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''

export async function prepareResolver(fs: FileSystem): Promise<Resolver> {
  const files = new Set<string>()
  const directories = new Set<string>([''])
  /** Text by path relative to the root; `null` for a file that was asked for and is not there. */
  const texts = new Map<string, string | null>()

  async function walk(directory: string): Promise<void> {
    for (const entry of (await fs.list(directory)) ?? []) {
      const path = joinPath(directory, entry.name)
      if (entry.kind === 'directory') {
        if (SKIPPED_DIRECTORIES.has(entry.name)) continue
        directories.add(path)
        await walk(path)
      } else {
        files.add(path)
        if (CONFIG_FILE.test(entry.name)) texts.set(path, (await fs.readText(path)) ?? null)
      }
    }
  }
  await walk('')

  /** Workspace packages: name → directory. */
  const workspace = new Map<string, string>()
  for (const [path, text] of texts) {
    if (!path.endsWith('package.json') || text === null) continue
    try {
      const name: unknown = (JSON.parse(text) as { name?: unknown }).name
      if (typeof name === 'string') workspace.set(name, directoryOf(path))
    } catch {
      // A package.json that is not JSON names no package.
    }
  }

  /** `/repo/node_modules/<workspace package>/…` is that package's directory; everything else is itself. */
  function real(path: string): string {
    const prefix = `${ROOT}/node_modules/`
    if (!path.startsWith(prefix)) return path
    const parts = path.slice(prefix.length).split('/')
    const length = parts[0]?.startsWith('@') ? 2 : 1
    const directory = workspace.get(parts.slice(0, length).join('/'))
    if (directory === undefined) return path
    return [virtual(directory), ...parts.slice(length)].join('/')
  }

  function isVirtualDirectory(path: string): boolean {
    if (workspace.size === 0) return false
    if (path === `${ROOT}/node_modules`) return true
    const scope = path.slice(`${ROOT}/node_modules/`.length)
    return (
      path.startsWith(`${ROOT}/node_modules/@`) &&
      !scope.includes('/') &&
      [...workspace.keys()].some((name) => name.startsWith(`${scope}/`))
    )
  }

  const misses = new Set<string>()
  const inNodeModules = (path: string): boolean => path.includes('/node_modules/')

  function fileExists(virtualPath: string): boolean {
    const path = relative(real(virtualPath))
    if (files.has(path)) return true
    if (!inNodeModules(`/${path}`)) return false
    // Outside of what was walked: only known once it has been asked for and loaded.
    if (!texts.has(path)) misses.add(path)
    return typeof texts.get(path) === 'string'
  }

  function readFile(virtualPath: string): string | undefined {
    const path = relative(real(virtualPath))
    if (!texts.has(path) && (files.has(path) || inNodeModules(`/${path}`))) misses.add(path)
    return texts.get(path) ?? undefined
  }

  const directoryExists = (virtualPath: string): boolean =>
    isVirtualDirectory(virtualPath) || directories.has(relative(real(virtualPath)))

  function readDirectory(
    rootDirectory: string,
    extensions: readonly string[] = [],
    excludes: readonly string[] = [],
    includes: readonly string[] = ['**/*']
  ): string[] {
    const base = relative(rootDirectory)
    const included = includes.map((spec) => specToRegExp(spec, 'include'))
    const excluded = excludes.map((spec) => specToRegExp(spec, 'exclude'))
    const found: string[] = []
    for (const file of files) {
      if (base !== '' && !file.startsWith(`${base}/`)) continue
      const local = base === '' ? file : file.slice(base.length + 1)
      if (!extensions.some((extension) => local.endsWith(extension))) continue
      if (!included.some((pattern) => pattern.test(local))) continue
      if (excluded.some((pattern) => pattern.test(local))) continue
      found.push(virtual(file))
    }
    return found
  }

  const parseHost: ts.ParseConfigHost = {
    useCaseSensitiveFileNames: true,
    fileExists,
    readFile,
    readDirectory
  }

  function parse(config: string): ts.ParsedCommandLine | undefined {
    const text = texts.get(config)
    if (typeof text !== 'string') return undefined
    const json = ts.parseConfigFileTextToJson(virtual(config), text)
    return ts.parseJsonConfigFileContent(
      json.config ?? {},
      parseHost,
      virtual(directoryOf(config)),
      undefined,
      virtual(config),
      undefined,
      [SVELTE]
    )
  }

  // Parse every configuration file, load what they reached for and did not find, and parse
  // again. Each round can only add to what is known, so this ends; the bound is for safety.
  const configFiles = [...files].filter((file) =>
    /(?:^|\/)[tj]sconfig(?:\.[^/]+)?\.json$/.test(file)
  )
  let parsed = new Map<string, ts.ParsedCommandLine>()
  for (let round = 0; round < 8; round++) {
    misses.clear()
    parsed = new Map()
    for (const config of configFiles) {
      const result = parse(config)
      if (result) parsed.set(config, result)
    }
    if (misses.size === 0) break
    for (const path of misses) texts.set(path, (await fs.readText(path)) ?? null)
  }

  function nearestConfig(file: string): string | undefined {
    for (let directory = directoryOf(file); ; directory = directoryOf(directory)) {
      for (const name of ['tsconfig.json', 'jsconfig.json']) {
        const candidate = joinPath(directory, name)
        if (parsed.has(candidate)) return candidate
      }
      if (directory === '') return undefined
    }
  }

  function configOf(file: string): string | undefined {
    const nearest = nearestConfig(file)
    if (nearest === undefined) return undefined
    for (const reference of parsed.get(nearest)?.projectReferences ?? []) {
      const path = relative(reference.path)
      const config = directories.has(path) ? joinPath(path, 'tsconfig.json') : path
      if (parsed.get(config)?.fileNames.includes(virtual(file))) return config
    }
    return nearest
  }

  function optionsOf(file: string): ts.CompilerOptions {
    const config = configOf(file)
    const options = config === undefined ? {} : (parsed.get(config)?.options ?? {})
    return {
      ...options,
      allowJs: true,
      moduleResolution: options.moduleResolution ?? ts.ModuleResolutionKind.Bundler
    }
  }

  const resolutionHost: ts.ModuleResolutionHost = {
    fileExists: (path) => files.has(relative(real(path))),
    readFile: (path) => texts.get(relative(real(path))) ?? undefined,
    directoryExists,
    realpath: real,
    getCurrentDirectory: () => ROOT,
    useCaseSensitiveFileNames: true
  }

  function resolve(specifier: string, from: string): Resolution {
    if (specifier.startsWith('node:') || BUILT_IN.has(specifier.split('/')[0]!)) {
      return { kind: 'built-in' }
    }
    const isRelative = /^\.\.?(?:\/|$)/.test(specifier)

    // A file that is there under exactly the name written — `./App.svelte`, `./style.css` —
    // needs no resolution, and TypeScript would not find the first of them.
    if (isRelative) {
      const literal = normalize(joinPath(directoryOf(from), specifier))
      if (literal !== undefined && files.has(literal)) return classify(literal)
    }

    const options = optionsOf(from)
    const resolved = ts.resolveModuleName(specifier, virtual(from), options, resolutionHost)
      .resolvedModule?.resolvedFileName
    if (resolved !== undefined) {
      const path = relative(real(resolved))
      return files.has(path) ? classify(path) : { kind: 'not-resolved' }
    }
    if (isRelative) return { kind: 'not-resolved' }

    const parts = specifier.split('/')
    const name = parts.slice(0, specifier.startsWith('@') ? 2 : 1).join('/')
    const aliased = Object.keys(options.paths ?? {}).some((pattern) =>
      pattern.includes('*')
        ? specifier.startsWith(pattern.slice(0, pattern.indexOf('*')))
        : specifier === pattern
    )
    return workspace.has(name) || aliased ? { kind: 'not-resolved' } : { kind: 'library', name }
  }

  const classify = (path: string): Resolution =>
    SOURCE_FILE.test(path) ? { kind: 'source-file', path } : { kind: 'ignored' }

  return { configOf, optionsOf, resolve }
}

/** `a/./b/../c` → `a/c`; `undefined` for a path that leaves the repository. */
function normalize(path: string): string | undefined {
  const parts: string[] = []
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      if (parts.length === 0) return undefined
      parts.pop()
    } else parts.push(part)
  }
  return parts.join('/')
}

/**
 * An `include` or `exclude` entry of a tsconfig as a pattern over paths relative to the
 * configuration file. TypeScript has this matcher, but does not make it public.
 */
function specToRegExp(spec: string, use: 'include' | 'exclude'): RegExp {
  const segments = spec
    .replaceAll('\\', '/')
    .split('/')
    .filter((segment) => segment !== '' && segment !== '.')
  const last = segments.at(-1) ?? ''
  // A last segment without wildcard and without extension names a directory.
  if (use === 'include' && !/[*?]/.test(last) && !last.includes('.')) segments.push('**', '*')
  let source = ''
  segments.forEach((segment, index) => {
    const isLast = index === segments.length - 1
    if (segment === '**') {
      source += '(?:[^/]+/)*'
      return
    }
    source += segment
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replaceAll('*', '[^/]*')
      .replaceAll('?', '[^/]')
    if (!isLast) source += '/'
  })
  return new RegExp(use === 'exclude' ? `^${source}(?:/.*)?$` : `^${source}$`)
}
