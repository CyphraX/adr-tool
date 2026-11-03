/**
 * What is extracted from one Source File before anything is resolved: what the app caches
 * per file and content (docs/structure-format.md, section 7). It depends on nothing but the
 * file's path and text, so the same text yields the same extraction.
 */
import type { JavaOutline, JavaReader } from './java/outline'
import type { FileMeasures } from './measures'
import type { StructureSaid } from './sentences'
import { languageOf } from './source-files'
import { extractUses, type Use } from './typescript/extract'

/**
 * Changes whenever the same text would be extracted differently. What was cached under
 * another version is extracted again.
 */
export const EXTRACTION_VERSION = 4

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

/**
 * Extraction for every language there is a reader for. Java needs tree-sitter, whose
 * WebAssembly the caller loads (`prepareJava`); without it, Java files are not read.
 */
export function extractorOf(java?: JavaReader): Extract {
  return (path, text) => {
    const language = languageOf(path)
    if (language === 'java') return java?.(text)
    return language === undefined ? undefined : extractUses(path, text)
  }
}
