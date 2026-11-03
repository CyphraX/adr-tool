/**
 * Structure's analysis of a repository on disk, as the command line and the MCP server run it
 * (docs/structure-format.md, sections 2 and 3): the files as the app lists them — git with its
 * guards, or a walk that honours `.gitignore` —, the Components, and the Dependencies between
 * the Source Files, Java, Python and Go included. Nothing of the repository is run (ADR-0007).
 * The app runs its own, in a worker with a cache of what each file says
 * (packages/app/src/main/analysis.ts).
 */
import type { FileSystem } from '@adr-tool/core'
import {
  analyseDependencies,
  extractorOf,
  openStructure,
  type Dependencies,
  type Extract,
  type Structure
} from '@adr-tool/structure'
import { listRepository } from './listing'
import { goReader, javaReader, pythonReader } from './readers'

/** How a repository's Source Files are read: with the reader of each language it has. */
export async function extractorFor(structure: Pick<Structure, 'sourceFiles'>): Promise<Extract> {
  const has = (language: string): boolean =>
    structure.sourceFiles.some((file) => file.language === language)
  return extractorOf({
    java: has('java') ? await javaReader() : undefined,
    python: has('python') ? await pythonReader() : undefined,
    go: has('go') ? await goReader() : undefined
  })
}

/** What the analysis of a repository found. */
export interface Analysed {
  /** The files the repository consists of, relative to its root. */
  readonly files: readonly string[]
  readonly structure: Structure
  readonly dependencies: Dependencies
}

/**
 * Analyse the repository at `root`, read through `fs`. `extra` are files that are not written
 * yet and are taken as Source Files all the same — an import planned from a new file.
 * `extract` reads one file; it can remember what it read.
 */
export async function analyseRepository(
  root: string,
  fs: FileSystem,
  options: {
    readonly extra?: readonly string[]
    readonly extract?: (structure: Structure) => Promise<Extract>
  } = {}
): Promise<Analysed> {
  const listed = await listRepository(root)
  const files = [...new Set([...listed, ...(options.extra ?? [])])].sort()
  const structure = await openStructure(fs, files)
  const extract = await (options.extract ?? extractorFor)(structure)
  const dependencies = await analyseDependencies(fs, files, structure.sourceFiles, extract)
  return { files, structure, dependencies }
}

export { listRepository }
