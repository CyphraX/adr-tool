/**
 * Where the Diagrams of a repository are, and the Diagrams found there (docs/diagrams-format.md,
 * section 1).
 */
import {
  joinPath,
  normalizePath,
  openConfig,
  CONFIG_PATH,
  type Config,
  type FileSystem
} from '@adr-tool/kernel'
import { readDiagram, type Diagram, type UnreadableDiagram } from './diagram'
import type { DiagramProblem } from './problems'

/** The key of `.arch/config.yml` that is Diagrams' own (docs/configuration.md). */
export const DIAGRAMS_KEY = 'diagrams'

/** Where Diagrams are when `.arch/config.yml` does not say. */
export const DEFAULT_DIAGRAMS_DIRECTORY = 'docs/architecture/diagrams'

export interface DiagramsLocation {
  /**
   * The directory of the Diagrams; `undefined` while `.arch/config.yml` cannot be read, or its
   * key `diagrams` cannot be used.
   */
  readonly directory: string | undefined
  /** What is wrong with the key `diagrams`: while there is something, no Diagram is looked for. */
  readonly problems: readonly DiagramProblem[]
}

/**
 * Where the settings say the Diagrams are. Diagrams reads its own key and no other. While the
 * file cannot be read, no Diagram is looked for, and the Problem is the file's: the kernel's,
 * which the caller reports once for every module (docs/configuration.md).
 */
export function readLocation(config: Config): DiagramsLocation {
  if (!config.readable) return { directory: undefined, problems: [] }
  const setting = config.settings.get(DIAGRAMS_KEY)
  if (setting === undefined || setting.value === null) {
    return { directory: DEFAULT_DIAGRAMS_DIRECTORY, problems: [] }
  }
  const directory = typeof setting.value === 'string' ? normalizePath(setting.value) : undefined
  if (directory === undefined || directory === '') {
    return {
      directory: undefined,
      problems: [{ kind: 'invalid-diagrams-directory', path: CONFIG_PATH, line: setting.line }]
    }
  }
  return { directory, problems: [] }
}

/** Where the Diagrams of the repository are. Never writes. */
export async function locateDiagrams(fs: FileSystem, config?: Config): Promise<DiagramsLocation> {
  return readLocation(config ?? (await openConfig(fs)))
}

export interface RepositoryDiagrams extends DiagramsLocation {
  /** Every Diagram in the directory, by ID; empty while the directory is not looked into. */
  readonly diagrams: readonly (Diagram | UnreadableDiagram)[]
}

/** Whether a file of the directory is a Diagram: a `.yml` file whose name does not begin with a dot. */
export const isDiagramFile = (name: string): boolean =>
  name.endsWith('.yml') && name.length > '.yml'.length && !name.startsWith('.')

/**
 * The Diagrams of a repository, each read from its file. `config` is `.arch/config.yml` as the
 * caller read it for every module; without it, it is read here. Never writes.
 */
export async function openDiagrams(fs: FileSystem, config?: Config): Promise<RepositoryDiagrams> {
  const location = await locateDiagrams(fs, config)
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
