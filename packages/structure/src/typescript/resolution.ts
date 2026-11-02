/**
 * Module resolution for TypeScript, JavaScript and Svelte (docs/structure-format.md, section
 * 3): TypeScript's own `resolveModuleName`, under the compiler options that apply to the
 * importing file, on top of the file-system port.
 *
 * The port is asynchronous and TypeScript's hosts are synchronous. Everything resolution
 * reads is therefore known before the first question: the files of the repository as the
 * caller hands them in, and the text of the configuration files among them (`package.json`,
 * `tsconfig*.json`, `jsconfig*.json`). What a configuration reaches for beyond that — an
 * `extends` into `node_modules`, or into a generated file git ignores — is noted as a miss,
 * loaded, and the configurations are parsed again until nothing is missing.
 *
 * Resolution itself only ever lands on a file of the repository. `node_modules` is never
 * walked and need not exist: the packages of the workspace are offered to TypeScript under a
 * `node_modules` directory that exists only for it, so a fresh clone resolves like an
 * installed one, and a bare specifier that names no workspace package is a Library.
 */
import ts from 'typescript'
import { joinPath, type FileSystem } from '@adr-tool/kernel'
import { isNeverLookedAt, languageOf } from '../source-files'
import { workspacePackages } from '../workspace'

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

/** Where the repository lies for TypeScript, which wants absolute paths. Nothing is read there. */
const ROOT = '/repo'
const CONFIG_FILE = /(?:^|\/)(?:package|[tj]sconfig(?:\.[^/]+)?)\.json$/
const TS_CONFIG = /(?:^|\/)[tj]sconfig(?:\.[^/]+)?\.json$/
const SVELTE: ts.FileExtensionInfo = {
  extension: '.svelte',
  isMixedContent: true,
  scriptKind: ts.ScriptKind.Deferred
}
/** Node's built-in modules, which are not Libraries. Those that exist only as `node:…` need no entry. */
const BUILT_IN = new Set(
  (
    'assert async_hooks buffer child_process cluster console constants crypto dgram ' +
    'diagnostics_channel dns domain events fs http http2 https inspector module net os path ' +
    'perf_hooks process punycode querystring readline repl stream string_decoder sys timers ' +
    'tls trace_events tty url util v8 vm wasi worker_threads zlib'
  ).split(' ')
)
/** `virtual:…`, `https://…`, `npm:…`: a scheme only a bundler or another runtime understands. */
const SCHEME = /^[a-z][a-z0-9+.-]*:/i

const virtual = (path: string): string => (path === '' ? ROOT : `${ROOT}/${path}`)
/** The path relative to the root; `undefined` for a path outside of the repository. */
const local = (path: string): string | undefined =>
  path === ROOT ? '' : path.startsWith(`${ROOT}/`) ? path.slice(ROOT.length + 1) : undefined
const directoryOf = (path: string): string =>
  path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''

/**
 * Prepare resolution for a repository. `files` are the files it consists of, as for
 * `openStructure`: what git tracks plus what it neither tracks nor ignores, or a walk.
 */
export async function prepareResolver(
  fs: FileSystem,
  repositoryFiles: readonly string[]
): Promise<Resolver> {
  const files = new Set(repositoryFiles.filter((path) => !isNeverLookedAt(path)))
  const directories = new Set<string>([''])
  for (const file of files) {
    for (let directory = directoryOf(file); !directories.has(directory);) {
      directories.add(directory)
      directory = directoryOf(directory)
    }
  }

  /** Text by path relative to the root; `null` for a file that was asked for and is not there. */
  const texts = new Map<string, string | null>()
  const load = async (path: string): Promise<void> => {
    // A path that is a directory, or cannot be read for another reason, is as good as absent.
    texts.set(path, (await fs.readText(path).catch(() => undefined)) ?? null)
  }
  await Promise.all([...files].filter((file) => CONFIG_FILE.test(file)).map(load))

  /** The packages of the workspace, and the repository's own package: name → directory. */
  const workspace = new Map<string, string>()
  for (const directory of ['', ...(await workspacePackages(fs, repositoryFiles))]) {
    const text = texts.get(joinPath(directory, 'package.json'))
    if (typeof text !== 'string') continue
    try {
      const name: unknown = (JSON.parse(text) as { name?: unknown } | null)?.name
      if (typeof name === 'string' && !workspace.has(name)) workspace.set(name, directory)
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

  // The host for parsing configuration files. It may reach beyond the files of the
  // repository — `extends` is followed wherever it points — but only for JSON, only inside
  // the repository, and only by reading.
  const misses = new Set<string>()
  const ask = (virtualPath: string): string | null | undefined => {
    const path = local(real(virtualPath))
    if (path === undefined) return undefined
    if (!texts.has(path) && path.endsWith('.json')) misses.add(path)
    return texts.get(path)
  }
  const fileExists = (virtualPath: string): boolean => {
    const path = local(real(virtualPath))
    if (path !== undefined && files.has(path) && !path.endsWith('.json')) return true
    return typeof ask(virtualPath) === 'string'
  }

  function readDirectory(
    rootDirectory: string,
    extensions: readonly string[] = [],
    excludes: readonly string[] = [],
    includes: readonly string[] = ['**/*']
  ): string[] {
    const base = local(rootDirectory)
    if (base === undefined) return []
    const included = includes.map((spec) => specToRegExp(spec, 'include'))
    const excluded = excludes.map((spec) => specToRegExp(spec, 'exclude'))
    const found: string[] = []
    for (const file of files) {
      if (base !== '' && !file.startsWith(`${base}/`)) continue
      const relative = base === '' ? file : file.slice(base.length + 1)
      if (!extensions.some((extension) => relative.endsWith(extension))) continue
      if (!included.some((pattern) => pattern.test(relative))) continue
      if (excluded.some((pattern) => pattern.test(relative))) continue
      found.push(virtual(file))
    }
    return found
  }

  const parseHost: ts.ParseConfigHost = {
    useCaseSensitiveFileNames: true,
    fileExists,
    readFile: (path) => ask(path) ?? undefined,
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
  const configFiles = [...files].filter((file) => TS_CONFIG.test(file))
  let parsed = new Map<string, ts.ParsedCommandLine>()
  for (let round = 0; round < 8; round++) {
    misses.clear()
    parsed = new Map()
    for (const config of configFiles) {
      const result = parse(config)
      if (result) parsed.set(config, result)
    }
    if (misses.size === 0) break
    await Promise.all([...misses].map(load))
  }

  const covered = new Map<string, Set<string>>()
  const covers = (config: string, file: string): boolean => {
    let names = covered.get(config)
    if (names === undefined) {
      names = new Set(parsed.get(config)?.fileNames ?? [])
      covered.set(config, names)
    }
    return names.has(virtual(file))
  }

  const nearest = new Map<string, string | undefined>()
  function nearestConfig(directory: string): string | undefined {
    if (nearest.has(directory)) return nearest.get(directory)
    const here = ['tsconfig.json', 'jsconfig.json']
      .map((name) => joinPath(directory, name))
      .find((candidate) => parsed.has(candidate))
    const found = here ?? (directory === '' ? undefined : nearestConfig(directoryOf(directory)))
    nearest.set(directory, found)
    return found
  }

  function configOf(file: string): string | undefined {
    const config = nearestConfig(directoryOf(file))
    if (config === undefined) return undefined
    for (const reference of parsed.get(config)?.projectReferences ?? []) {
      const path = local(reference.path)
      if (path === undefined) continue
      const referenced = directories.has(path) ? joinPath(path, 'tsconfig.json') : path
      if (covers(referenced, file)) return referenced
    }
    return config
  }

  const options = new Map<string | undefined, ts.CompilerOptions>()
  function optionsOf(file: string): ts.CompilerOptions {
    const config = configOf(file)
    let found = options.get(config)
    if (found === undefined) {
      const own = config === undefined ? {} : (parsed.get(config)?.options ?? {})
      found = {
        ...own,
        allowJs: true,
        moduleResolution: own.moduleResolution ?? ts.ModuleResolutionKind.Bundler
      }
      options.set(config, found)
    }
    return found
  }

  // TypeScript does not know `.svelte`, and finds a component only by a path written to the
  // letter. For an alias (`$lib/Row.svelte`) it looks for `Row.svelte.ts` instead, so a
  // component is offered to it under that name, where no file of that name exists.
  const componentOf = (path: string): string | undefined => {
    const component = path.slice(0, -'.ts'.length)
    return path.endsWith('.svelte.ts') && !files.has(path) && files.has(component)
      ? component
      : undefined
  }
  const resolutionHost: ts.ModuleResolutionHost = {
    fileExists: (virtualPath) => {
      const path = local(real(virtualPath))
      return path !== undefined && (files.has(path) || componentOf(path) !== undefined)
    },
    readFile: (virtualPath) => {
      const path = local(real(virtualPath))
      return path === undefined ? undefined : (texts.get(path) ?? undefined)
    },
    directoryExists: (virtualPath) => {
      if (isVirtualDirectory(virtualPath)) return true
      const path = local(real(virtualPath))
      return path !== undefined && directories.has(path)
    },
    realpath: real,
    getCurrentDirectory: () => ROOT,
    useCaseSensitiveFileNames: true
  }
  const caches = new Map<ts.CompilerOptions, ts.ModuleResolutionCache>()
  const cacheFor = (compilerOptions: ts.CompilerOptions): ts.ModuleResolutionCache => {
    let cache = caches.get(compilerOptions)
    if (cache === undefined) {
      cache = ts.createModuleResolutionCache(ROOT, (name) => name, compilerOptions)
      caches.set(compilerOptions, cache)
    }
    return cache
  }

  const classify = (path: string): Resolution => {
    const language = languageOf(path)
    return language === 'typescript' || language === 'svelte'
      ? { kind: 'source-file', path }
      : { kind: 'ignored' }
  }

  function resolve(written: string, from: string): Resolution {
    // A query only a bundler understands (`./worker?nodeWorker`, `./icon.svg?raw`) changes
    // how the file is used, not which file it is.
    const specifier = written.replace(/\?[^/]*$/, '')
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

    const compilerOptions = optionsOf(from)
    const resolved = ts.resolveModuleName(
      specifier,
      virtual(from),
      compilerOptions,
      resolutionHost,
      cacheFor(compilerOptions)
    ).resolvedModule?.resolvedFileName
    if (resolved !== undefined) {
      const found = local(real(resolved))
      const path = found === undefined ? undefined : (componentOf(found) ?? found)
      return path !== undefined && files.has(path) ? classify(path) : { kind: 'not-resolved' }
    }
    // What is not a package name cannot be the use of a Library: a path, a subpath import
    // of `package.json` (`#internal`), a scheme a bundler or another runtime understands.
    if (isRelative || /^[/#]/.test(specifier) || SCHEME.test(specifier)) {
      return { kind: 'not-resolved' }
    }

    const parts = specifier.split('/')
    const name = parts.slice(0, specifier.startsWith('@') ? 2 : 1).join('/')
    const aliased = Object.keys(compilerOptions.paths ?? {}).some((pattern) =>
      pattern.includes('*')
        ? specifier.startsWith(pattern.slice(0, pattern.indexOf('*')))
        : specifier === pattern
    )
    return workspace.has(name) || aliased ? { kind: 'not-resolved' } : { kind: 'library', name }
  }

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
