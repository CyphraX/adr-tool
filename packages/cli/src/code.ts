import type { FileSystem } from '@adr-tool/core'
import {
  analyseDependencies,
  extractorOf,
  type Dependencies,
  type NotAnalysed
} from '@adr-tool/structure'
import type { Structure } from '@adr-tool/structure/model'
import { goReader, javaReader, pythonReader } from './readers'

/**
 * The Dependencies of the Source Files of `structure`, as the command reads them: TypeScript and
 * JavaScript with the TypeScript compiler, Java, Python and Go with the tree-sitter grammars it
 * carries, each prepared only for a repository that has the language. The MCP server reads the
 * code the same way. Nothing of the repository is run (ADR-0007).
 */
export async function readCode(
  fs: FileSystem,
  files: readonly string[],
  structure: Pick<Structure, 'sourceFiles'>
): Promise<Dependencies> {
  const has = (language: string): boolean =>
    structure.sourceFiles.some((file) => file.language === language)
  const extract = extractorOf({
    java: has('java') ? await javaReader() : undefined,
    python: has('python') ? await pythonReader() : undefined,
    go: has('go') ? await goReader() : undefined
  })
  return analyseDependencies(fs, files, structure.sourceFiles, extract)
}

/** The note about Source Files that cannot be parsed: they have no Dependencies of their own. */
export function notAnalysed(files: readonly NotAnalysed[]): string {
  const shown = files
    .slice(0, 3)
    .map((file) => (file.line === undefined ? file.file : `${file.file}:${file.line}`))
  const more = files.length > shown.length ? `, and ${files.length - shown.length} more` : ''
  const count = files.length === 1 ? '1 Source File' : `${files.length} Source Files`
  return `${count} cannot be parsed and ${files.length === 1 ? 'has' : 'have'} no Dependencies of ${files.length === 1 ? 'its' : 'their'} own: ${shown.join(', ')}${more}.`
}
