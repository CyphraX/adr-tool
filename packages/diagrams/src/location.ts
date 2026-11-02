/**
 * Where the Diagrams of a repository are, and the Diagrams found there (docs/diagrams-format.md,
 * section 1).
 */
import { isMap, isScalar, LineCounter, parseDocument } from 'yaml'
import { joinPath, normalizePath, type FileSystem } from '@adr-tool/kernel'
import { readDiagram, type Diagram, type UnreadableDiagram } from './diagram'
import type { DiagramProblem } from './problems'

/** The settings of `.arch/`, beside the declaration of Components. Other modules keep theirs here too. */
export const CONFIG_PATH = '.arch/config.yml'

/** Where Diagrams are when `.arch/config.yml` does not say. */
export const DEFAULT_DIAGRAMS_DIRECTORY = 'docs/architecture/diagrams'

export interface DiagramsLocation {
  /** The directory of the Diagrams; `undefined` while `.arch/config.yml` cannot be used. */
  readonly directory: string | undefined
  /** What is wrong with `.arch/config.yml`: while there is something, no Diagram is looked for. */
  readonly problems: readonly DiagramProblem[]
}

/** Where `.arch/config.yml`, as `text`, says the Diagrams are. */
export function readLocation(text: string | undefined): DiagramsLocation {
  const found = { directory: DEFAULT_DIAGRAMS_DIRECTORY, problems: [] }
  if (text === undefined) return found
  const lines = new LineCounter()
  const doc = parseDocument(text, { lineCounter: lines })
  const lost = (problem: DiagramProblem): DiagramsLocation => ({
    directory: undefined,
    problems: [problem]
  })
  if (doc.errors.length > 0) {
    const error = doc.errors[0]!
    const message = error.message.split('\n')[0]!.replace(/[:.]$/, '')
    return lost({
      kind: 'unreadable-config',
      path: CONFIG_PATH,
      line: error.linePos?.[0].line ?? 1,
      detail: { code: 'config-not-yaml', values: { message } }
    })
  }
  if (doc.contents === null || (isScalar(doc.contents) && doc.contents.value === null)) {
    return found
  }
  if (!isMap(doc.contents)) {
    return lost({
      kind: 'unreadable-config',
      path: CONFIG_PATH,
      line: 1,
      detail: { code: 'config-not-map', values: {} }
    })
  }
  const pair = doc.contents.items.find(
    (item) => isScalar(item.key) && item.key.value === 'diagrams'
  )
  if (pair === undefined) return found
  const value = pair.value
  if (value === null || (isScalar(value) && value.value === null)) return found
  const written = isScalar(value) && typeof value.value === 'string' ? value.value : undefined
  const directory = written === undefined ? undefined : normalizePath(written)
  if (directory === undefined || directory === '') {
    const range = (pair.key as { range?: readonly number[] } | null)?.range
    return lost({
      kind: 'invalid-diagrams-directory',
      path: CONFIG_PATH,
      line: range ? lines.linePos(range[0]!).line : 1
    })
  }
  return { directory, problems: [] }
}

/** Where the Diagrams of the repository are. Never writes. */
export async function locateDiagrams(fs: FileSystem): Promise<DiagramsLocation> {
  return readLocation(await fs.readText(CONFIG_PATH))
}

export interface RepositoryDiagrams extends DiagramsLocation {
  /** Every Diagram in the directory, by ID; empty while the directory is not looked into. */
  readonly diagrams: readonly (Diagram | UnreadableDiagram)[]
}

/** Whether a file of the directory is a Diagram: a `.yml` file whose name does not begin with a dot. */
export const isDiagramFile = (name: string): boolean =>
  name.endsWith('.yml') && name.length > '.yml'.length && !name.startsWith('.')

/** The Diagrams of a repository, each read from its file. Never writes. */
export async function openDiagrams(fs: FileSystem): Promise<RepositoryDiagrams> {
  const location = await locateDiagrams(fs)
  if (location.directory === undefined) return { ...location, diagrams: [] }
  const entries = (await fs.list(location.directory)) ?? []
  const names = entries
    .filter((entry) => entry.kind === 'file' && isDiagramFile(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  const diagrams: (Diagram | UnreadableDiagram)[] = []
  for (const name of names) {
    const path = joinPath(location.directory, name)
    const text = await fs.readText(path)
    if (text !== undefined) diagrams.push(readDiagram(path, text))
  }
  return { ...location, diagrams }
}

/** Where the picture of a Diagram is: beside it, with `.svg` for `.yml`. */
export function svgPathOf(diagram: Pick<Diagram, 'path'>): string {
  return diagram.path.endsWith('.yml')
    ? `${diagram.path.slice(0, -'.yml'.length)}.svg`
    : `${diagram.path}.svg`
}
