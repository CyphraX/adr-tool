/**
 * What is extracted from one Source File before anything is resolved: what the app caches
 * per file and content (docs/structure-format.md, section 7). It depends on nothing but the
 * file's path and text, so the same text yields the same extraction.
 */
import type { GoOutline, GoReader } from './go/outline'
import type { JavaOutline, JavaReader } from './java/outline'
import type { FileMeasures } from './measures'
import type { PythonOutline, PythonReader } from './python/outline'
import type { StructureSaid } from './sentences'
import { languageOf } from './source-files'
import { extractUses, type Use } from './typescript/extract'

/**
 * Changes whenever the same text would be extracted differently. What was cached under
 * another version is extracted again.
 */
export const EXTRACTION_VERSION = 5

export type Extraction =
  /** TypeScript, JavaScript, Svelte: the module specifiers the code uses, as written. */
  | {
      readonly analysed: true
      readonly uses: readonly Use[]
      /** Its functions, classes and declarations (section 5, "Inside a Source File"). */
      readonly measures?: FileMeasures
    }
  /** Java: what the file declares and uses, for the symbol table of its packages. */
  | { readonly analysed: true; readonly java: JavaOutline; readonly measures?: FileMeasures }
  /** Python: its imports, as written, for the source roots of the repository. */
  | { readonly analysed: true; readonly python: PythonOutline; readonly measures?: FileMeasures }
  /** Go: its package, its imports, what it declares and uses, for the packages of its modules. */
  | { readonly analysed: true; readonly go: GoOutline; readonly measures?: FileMeasures }
  /**
   * The file cannot be parsed. It keeps its Component and has no Dependencies of its own
   * (section 2, "Files that cannot be read"). `line` and `message` are the parser's first
   * complaint; `said` is the message as a code, where it is the suite's own and not the
   * TypeScript compiler's.
   */
  | {
      readonly analysed: false
      readonly line: number
      readonly message: string
      readonly said?: StructureSaid
    }

/**
 * What is extracted from one file; `undefined` for a language that is not read. The app hands
 * in the same function behind its cache, keyed by the hash of the file's content.
 */
export type Extract = (path: string, text: string) => Extraction | undefined

/** The readers of the languages read with tree-sitter, which only the caller can prepare. */
export interface Readers {
  readonly java?: JavaReader
  readonly python?: PythonReader
  readonly go?: GoReader
}

/**
 * Extraction for every language there is a reader for. Java, Python and Go need tree-sitter,
 * whose WebAssembly the caller loads (`prepareJava`, `preparePython`, `prepareGo`); without a
 * reader, the files of its language are not read.
 */
export function extractorOf(readers: Readers = {}): Extract {
  return (path, text) => {
    const language = languageOf(path)
    switch (language) {
      case 'java':
      case 'python':
      case 'go':
        return readers[language]?.(text)
      case undefined:
        return undefined
      default:
        return extractUses(path, text)
    }
  }
}
