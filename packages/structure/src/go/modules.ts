/**
 * The Go modules of a repository (docs/structure-format.md, section 3, "Go"): every `go.mod`,
 * with its module path, what it requires and what it replaces by a directory of the
 * repository, and the `replace` directives of a `go.work` at the root. Read as text; the go
 * command never runs, and nothing is downloaded.
 */
import { normalizePath, type FileSystem } from '@adr-tool/kernel'
import { isNeverLookedAt } from '../source-files'

export interface GoRequirement {
  /** The module path: `github.com/google/uuid`. */
  readonly path: string
  /** As written: `v1.6.0`. */
  readonly version: string
  /** go.mod marks it `// indirect`: it is needed by what is required, not by the module. */
  readonly indirect: boolean
  /** The line of go.mod that requires it, from 1. */
  readonly line: number
}

/** A module path that a `replace` directive points at a directory of the repository. */
export interface GoReplacement {
  readonly path: string
  readonly directory: string
}

export interface GoModule {
  /** The directory of its `go.mod`; `''` is the root. */
  readonly directory: string
  /** Its `module` path; empty where go.mod names none. */
  readonly path: string
  readonly requires: readonly GoRequirement[]
  readonly replaces: readonly GoReplacement[]
}

export interface GoModules {
  readonly modules: readonly GoModule[]
  /** The `replace` directives of `go.work`, which go before those of every module. */
  readonly replaces: readonly GoReplacement[]
}

interface Directive {
  readonly verb: string
  readonly args: readonly string[]
  /** What follows `//` on its line. */
  readonly comment: string
  readonly line: number
}

const TOKEN = /"(?:[^"\\]|\\.)*"|`[^`]*`|=>|[()]|[^\s()]+/g
const unquote = (token: string): string =>
  /^["`]/.test(token) ? token.slice(1, -1).replace(/\\(.)/g, '$1') : token

/** The directives of go.mod or go.work, a block `require ( … )` as one directive per line. */
export function directivesOf(text: string): Directive[] {
  const found: Directive[] = []
  let block: string | undefined
  text.split(/\r?\n/).forEach((written, index) => {
    const at = written.indexOf('//')
    const code = at === -1 ? written : written.slice(0, at)
    const comment = at === -1 ? '' : written.slice(at + 2).trim()
    const tokens = [...code.matchAll(TOKEN)].map((match) => match[0])
    if (tokens.length === 0) return
    if (block !== undefined) {
      if (tokens[0] === ')') block = undefined
      else found.push({ verb: block, args: tokens.map(unquote), comment, line: index + 1 })
    } else if (tokens.length === 2 && tokens[1] === '(') {
      block = tokens[0]
    } else {
      found.push({ verb: tokens[0]!, args: tokens.slice(1).map(unquote), comment, line: index + 1 })
    }
  })
  return found
}

/** `replace a [v] => ./b`: the module path and, where it is one inside the repository, the directory. */
function replacementOf(directory: string, args: readonly string[]): GoReplacement | undefined {
  const arrow = args.indexOf('=>')
  const path = args[0]
  const target = args[arrow + 1]
  if (arrow < 1 || path === undefined || target === undefined) return undefined
  // A local replacement is a path that begins with `./` or `../`, as the go command has it.
  if (!/^\.\.?(?:\/|$)/.test(target)) return undefined
  const resolved = normalizePath(directory === '' ? target : `${directory}/${target}`)
  return resolved === undefined ? undefined : { path, directory: resolved }
}

/** Read every `go.mod` of the repository, and the `go.work` at its root. */
export async function goModules(fs: FileSystem, files: readonly string[]): Promise<GoModules> {
  const modules: GoModule[] = []
  for (const file of files) {
    if (file !== 'go.mod' && !file.endsWith('/go.mod')) continue
    if (isNeverLookedAt(file) || file.split('/').includes('vendor')) continue
    const directory = file === 'go.mod' ? '' : file.slice(0, -'/go.mod'.length)
    const text = await fs.readText(file).catch(() => undefined)
    if (text === undefined) continue
    let path = ''
    const requires: GoRequirement[] = []
    const replaces: GoReplacement[] = []
    for (const { verb, args, comment, line } of directivesOf(text)) {
      if (verb === 'module' && args[0] !== undefined) path = args[0]
      else if (verb === 'require' && args.length >= 2) {
        requires.push({
          path: args[0]!,
          version: args[1]!,
          indirect: /^indirect\b/.test(comment),
          line
        })
      } else if (verb === 'replace') {
        const replacement = replacementOf(directory, args)
        if (replacement) replaces.push(replacement)
      }
    }
    modules.push({ directory, path, requires, replaces })
  }
  const replaces: GoReplacement[] = []
  if (files.includes('go.work')) {
    const text = (await fs.readText('go.work').catch(() => undefined)) ?? ''
    for (const { verb, args } of directivesOf(text)) {
      const replacement = verb === 'replace' ? replacementOf('', args) : undefined
      if (replacement) replaces.push(replacement)
    }
  }
  modules.sort((a, b) => (a.directory < b.directory ? -1 : a.directory > b.directory ? 1 : 0))
  return { modules, replaces }
}
