import { readFile, readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { memoryFileSystem, type FileSystem } from '@adr-tool/kernel'
import {
  analyseDependencies,
  everyComponent,
  extractorOf,
  metricsOf,
  openStructure,
  prepareJava,
  type JavaReader,
  type Structure
} from '@adr-tool/structure'
import { snapshotValuesOf, type Known, type ViolationFingerprint } from '../src'

/** Every file below `root`, as the paths of a repository: what a fixture consists of. */
export async function filesBelow(root: string, directory = ''): Promise<string[]> {
  const entries = await readdir(join(root, directory), { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const path = directory === '' ? entry.name : `${directory}/${entry.name}`
    if (entry.isDirectory()) files.push(...(await filesBelow(root, path)))
    else files.push(path)
  }
  return files
}

/** A fixture in memory, as it is on the disk: what a test may change without touching the disk. */
export async function inMemory(root: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {}
  for (const path of await filesBelow(root)) files[path] = await readFile(join(root, path), 'utf8')
  return files
}

/**
 * The Violations of a Rule `must-not-depend` from one Component to another, as Conformance
 * finds them: one, when a Source File of the first that is no test depends on one of the
 * second. `assessment` does not know Conformance (ADR-0006); its caller hands these in, and the
 * command line's test checks that `adr check` finds the same one in the fixture.
 */
function mustNotDepend(
  rule: string,
  from: string,
  to: string,
  structure: Structure,
  dependencies: readonly { from: string; to: string }[]
): ViolationFingerprint[] {
  const owner = new Map(
    structure.sourceFiles.filter((file) => !file.test).map((file) => [file.path, file.component])
  )
  const broken = dependencies.some(
    (dependency) => owner.get(dependency.from) === from && owner.get(dependency.to) === to
  )
  return broken ? [{ kind: 'dependency', rule, from, to }] : []
}

const require = createRequire(import.meta.url)
let java: Promise<JavaReader> | undefined

/** Java as the app reads it: with the WebAssembly of tree-sitter, prepared once. */
const javaReader = (): Promise<JavaReader> =>
  (java ??= (async () =>
    prepareJava({
      runtime: await readFile(require.resolve('web-tree-sitter/web-tree-sitter.wasm')),
      grammar: await readFile(require.resolve('tree-sitter-java/tree-sitter-java.wasm'))
    }))())

/**
 * The shop as the app sees it — its Components, Dependencies and metrics — and what the other
 * modules know of it, as the app hands it in.
 */
export async function shopIn(files: Record<string, string>) {
  const fs: FileSystem = memoryFileSystem(files)
  const paths = Object.keys(files).sort()
  const structure = await openStructure(fs, paths)
  const analysis = await analyseDependencies(
    fs,
    paths,
    structure.sourceFiles,
    extractorOf({ java: await javaReader() })
  )
  const metrics = metricsOf(
    structure,
    analysis.dependencies,
    analysis.lineCounts,
    {},
    analysis.measures
  )
  const values = snapshotValuesOf(structure, metrics, analysis.measures, analysis.dependencies)
  const annotations = paths
    .filter((path) => path.startsWith('docs/architecture/annotations/') && path.endsWith('.md'))
    .map((path) => path.slice(path.lastIndexOf('/') + 1, -'.md'.length))
  const known: Known = {
    components: everyComponent(structure.components).map((component) => component.id),
    violations: mustNotDepend(
      'web-through-cart',
      'web',
      'catalog',
      structure,
      analysis.dependencies
    ),
    ...(values && { metrics: values }),
    annotations,
    adrs: [{ log: 'docs/adr', id: '0001-the-web-shows-the-catalog-through-the-cart' }]
  }
  return { fs, structure, analysis, metrics, values, known }
}
