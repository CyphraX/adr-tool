/**
 * Dependencies between Source Files (docs/structure-format.md, section 3): the uses each file
 * makes, resolved against the repository.
 */
import type { FileSystem } from '@adr-tool/kernel'
import { extractorOf, type Extract, type Extraction } from './extraction'
import type { JavaOutline } from './java/outline'
import { resolveJava } from './java/resolve'
import type { SourceFile } from './source-files'
import { prepareResolver } from './typescript/resolution'

/** A directed use of one Source File by another, both inside the repository. */
export interface Dependency {
  readonly from: string
  readonly to: string
  /** Every use between the two files exists for the compiler only. */
  readonly typeOnly: boolean
  /** The lines of `from` on which its uses of `to` begin, in order. */
  readonly lines: readonly number[]
}

/** A use whose target cannot be determined. It is neither a Dependency nor the use of a Library. */
export interface NotResolved {
  readonly file: string
  readonly specifier: string
  readonly line: number
}

/** A file that uses a Library, once per file and Library. */
export interface LibraryUse {
  readonly file: string
  /** The package name the code uses: `lodash` for `lodash/fp`. */
  readonly library: string
}

/**
 * A Source File that cannot be parsed: it keeps its Component and has no Dependencies of its
 * own. `line` and `message` say why; both are missing when the file could not be read at all.
 */
export interface NotAnalysed {
  readonly file: string
  readonly line?: number
  readonly message?: string
}

export interface Dependencies {
  /** In the order of `from`, then `to`. */
  readonly dependencies: readonly Dependency[]
  readonly notResolved: readonly NotResolved[]
  readonly libraries: readonly LibraryUse[]
  readonly notAnalysed: readonly NotAnalysed[]
  /** How many lines each Source File has that could be read (section 5, Size). */
  readonly lineCounts: ReadonlyMap<string, number>
}

/** How many files are read at a time: enough to keep the disk busy, few enough for any limit. */
const READ_AT_ONCE = 32
const DECLARATION_FILE = /\.d\.(?:[^/]+\.)?[cm]?ts$/

const byPath = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** As many lines as line breaks, and one more when text follows the last one. */
export function linesOf(text: string): number {
  let breaks = 0
  for (let at = text.indexOf('\n'); at !== -1; at = text.indexOf('\n', at + 1)) breaks++
  return text.length > 0 && !text.endsWith('\n') ? breaks + 1 : breaks
}

/**
 * The Dependencies among the Source Files of a repository, and what could not be resolved.
 * `files` are the files the repository consists of, as for `openStructure`; `sourceFiles`
 * are the Source Files among them. `extract` reads one file; without a reader for Java
 * (`extractorOf(prepareJava(…))`), Java files are not read and have no Dependencies.
 */
export async function analyseDependencies(
  fs: FileSystem,
  files: readonly string[],
  sourceFiles: readonly SourceFile[],
  extract: Extract = extractorOf()
): Promise<Dependencies> {
  const resolver = await prepareResolver(fs, files)
  const known = new Set(sourceFiles.map((file) => file.path))

  /** `null`: the file could not be read. `undefined`: its language is not read. */
  const extractions = new Map<string, Extraction | null | undefined>()
  const lineCounts = new Map<string, number>()
  for (let start = 0; start < sourceFiles.length; start += READ_AT_ONCE) {
    await Promise.all(
      sourceFiles.slice(start, start + READ_AT_ONCE).map(async ({ path }) => {
        const text = await fs.readText(path).catch(() => undefined)
        if (text !== undefined) lineCounts.set(path, linesOf(text))
        extractions.set(path, text === undefined ? null : extract(path, text))
      })
    )
  }

  const pairs = new Map<string, { from: string; to: string; typeOnly: boolean; lines: number[] }>()
  const notResolved: NotResolved[] = []
  const libraries: LibraryUse[] = []
  const notAnalysed: NotAnalysed[] = []
  const java = new Map<string, JavaOutline>()
  const depend = (from: string, to: string, typeOnly: boolean, line: number): void => {
    const key = `${from}\n${to}`
    const pair = pairs.get(key)
    if (pair === undefined) pairs.set(key, { from, to, typeOnly, lines: [line] })
    else {
      pair.typeOnly &&= typeOnly
      if (!pair.lines.includes(line)) pair.lines.push(line)
    }
  }

  for (const { path } of sourceFiles) {
    const extraction = extractions.get(path)
    if (extraction === undefined) continue
    if (extraction === null) {
      notAnalysed.push({ file: path })
      continue
    }
    if (!extraction.analysed) {
      notAnalysed.push({ file: path, line: extraction.line, message: extraction.message })
      continue
    }
    if ('java' in extraction) {
      java.set(path, extraction.java)
      continue
    }
    const used = new Set<string>()
    for (const use of extraction.uses) {
      const resolution = resolver.resolve(use.specifier, path)
      switch (resolution.kind) {
        case 'source-file': {
          const to = resolution.path
          // A file never depends on itself.
          if (to === path || !known.has(to)) break
          depend(path, to, use.typeOnly || DECLARATION_FILE.test(to), use.line)
          break
        }
        case 'library':
          if (!used.has(resolution.name)) libraries.push({ file: path, library: resolution.name })
          used.add(resolution.name)
          break
        case 'not-resolved':
          notResolved.push({ file: path, specifier: use.specifier, line: use.line })
          break
        case 'built-in':
        case 'ignored':
          break
      }
    }
  }

  // Java is resolved against the symbol table of the whole repository, once every file is read.
  // It has no type-only Dependencies.
  const resolved = resolveJava(java)
  for (const use of resolved.uses) if (known.has(use.to)) depend(use.from, use.to, false, use.line)
  notResolved.push(...resolved.notResolved)
  libraries.push(...resolved.libraries)

  const dependencies = [...pairs.values()]
    .map((pair) => ({ ...pair, lines: [...pair.lines].sort((a, b) => a - b) }))
    .sort((a, b) => byPath(a.from, b.from) || byPath(a.to, b.to))
  return { dependencies, notResolved, libraries, notAnalysed, lineCounts }
}
