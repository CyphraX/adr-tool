import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { goGrammar, javaGrammar, pythonGrammar, runtime } from '@adr-tool/cli/tree-sitter-wasm'
import {
  EXTRACTION_VERSION,
  analyseDependencies,
  extractorOf,
  libraryInventory,
  openStructure,
  prepareGo,
  prepareJava,
  preparePython,
  type Dependencies,
  type Extraction,
  type Language,
  type LibraryInventory,
  type Readers,
  type Structure
} from '@adr-tool/structure'
import { nodeFileSystem } from './node-file-system'
import { repositoryFiles } from './repository-files'

/**
 * What the Structure module knows about a repository: its Components, their Dependencies, and
 * the Libraries the manifests declare and the code uses.
 */
export interface Analysis {
  readonly structure: Structure
  readonly dependencies: Dependencies
  readonly inventory: LibraryInventory
  /** How long reading, parsing and resolving took, the inventory included. */
  readonly milliseconds: number
}

/**
 * What was extracted from each Source File, by its path and keyed by the hash of the text it
 * was extracted from (docs/structure-format.md, section 7). It lives in the app's user-data
 * folder, one file per repository, and is thrown away whole when the analysis changes.
 */
export interface ExtractionCache {
  readonly version: number
  readonly files: Readonly<
    Record<string, { readonly hash: string; readonly extraction: Extraction }>
  >
}

/** The languages read with tree-sitter, how each is prepared, and its grammar. */
const TREE_SITTER = {
  java: { prepare: prepareJava, grammar: javaGrammar },
  python: { prepare: preparePython, grammar: pythonGrammar },
  go: { prepare: prepareGo, grammar: goGrammar }
} as const
type TreeSitterLanguage = keyof typeof TREE_SITTER

const readers = new Map<TreeSitterLanguage, Promise<Readers[TreeSitterLanguage]>>()

/**
 * The reader of a language read with tree-sitter, prepared once per thread and only for a
 * repository that has the language. The `.wasm` files are the command line's: read from their
 * packages in development and in the tests, and carried in the built worker as base64
 * (electron.vite.config.ts), so that the packaged app has no file to find. Should one not be
 * there, the language is not read.
 */
function readerOf(language: TreeSitterLanguage): Promise<Readers[TreeSitterLanguage]> {
  const prepared =
    readers.get(language) ??
    (async () => {
      try {
        return await TREE_SITTER[language].prepare({
          runtime: runtime(),
          grammar: TREE_SITTER[language].grammar()
        })
      } catch (error) {
        console.error(error)
        return undefined
      }
    })()
  readers.set(language, prepared)
  return prepared
}

/**
 * Read a repository, parse what changed since the cache was written, resolve everything.
 * Never writes into the repository.
 */
export async function analyse(
  root: string,
  cache: ExtractionCache | undefined
): Promise<{ analysis: Analysis; cache: ExtractionCache; changed: boolean }> {
  const started = performance.now()
  const fs = nodeFileSystem(root)
  const files = await repositoryFiles(root)
  const structure = await openStructure(fs, files)

  const has = (language: Language): boolean =>
    structure.sourceFiles.some((file) => file.language === language)
  const read = extractorOf({
    java: has('java') ? await readerOf('java') : undefined,
    python: has('python') ? await readerOf('python') : undefined,
    go: has('go') ? await readerOf('go') : undefined
  })

  const previous = cache?.version === EXTRACTION_VERSION ? cache.files : {}
  const next: Record<string, { hash: string; extraction: Extraction }> = {}
  let parsed = 0
  const extract = (path: string, text: string): Extraction | undefined => {
    const hash = createHash('sha256').update(text).digest('base64url')
    const known = previous[path]
    if (known?.hash === hash) {
      next[path] = known
      return known.extraction
    }
    const extraction = read(path, text)
    if (extraction === undefined) return undefined
    parsed++
    next[path] = { hash, extraction }
    return extraction
  }
  const dependencies = await analyseDependencies(fs, files, structure.sourceFiles, extract)
  // What is installed is read within limits, and never through a link out of the repository.
  const inventory = await libraryInventory(fs, files, structure, dependencies)

  const changed =
    parsed > 0 ||
    cache?.version !== EXTRACTION_VERSION ||
    Object.keys(previous).length !== Object.keys(next).length
  return {
    analysis: {
      structure,
      dependencies,
      inventory,
      milliseconds: Math.round(performance.now() - started)
    },
    cache: { version: EXTRACTION_VERSION, files: next },
    changed
  }
}

/** The cache as it was written; `undefined` when there is none, or one that cannot be read. */
export async function readCache(file: string): Promise<ExtractionCache | undefined> {
  try {
    const read: unknown = JSON.parse(await readFile(file, 'utf8'))
    const { version, files } = (read ?? {}) as Partial<ExtractionCache>
    return typeof version === 'number' && typeof files === 'object' && files !== null
      ? { version, files }
      : undefined
  } catch {
    // Nothing cached yet, or nothing usable: everything is parsed once more.
    return undefined
  }
}

/** Written whole and then moved into place, so that a crash leaves the old cache or the new one. */
export async function writeCache(file: string, cache: ExtractionCache): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.tmp`
  await writeFile(temporary, JSON.stringify(cache), 'utf8')
  await rename(temporary, file)
}
