import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { watch, type FSWatcher } from 'chokidar'
import {
  everyComponent,
  isDirectoryNode,
  levelOf,
  matrixOf,
  metricsOf,
  sizeOf,
  withDirectories,
  type DeclaredComponent,
  type Level,
  type LevelNode,
  type Metrics,
  type Structure
} from '@adr-tool/structure/model'
import {
  LOWER_BOUND,
  type LowerBound,
  type SourceFileResult,
  type StructureOutline,
  type StructureComponent,
  type StructureNeighbour,
  type StructureNode,
  type StructureView
} from '../shared/ipc'
import type { Analysis } from './analysis'
import { t } from './strings'

/** Editors, formatters and git touch many files at once; one analysis covers them all. */
const REANALYSE_DELAY_MS = 300
/** What the code viewer shows at most: a Source File larger than this is generated, not read. */
export const SOURCE_FILE_LIMIT = 4 * 1024 * 1024
/**
 * How many uses that are not resolved, and how many files of a Component, go to the window;
 * the count is always the whole.
 */
const LISTED_AT_MOST = 500
/**
 * Not watched: what git never lists, and the build output and caches that tools rewrite all
 * the time. A file git lists in one of them changes nothing until the next analysis.
 */
const UNWATCHED =
  /(?:^|[/\\])(?:node_modules|\.git|dist|build|out|target|coverage|\.svelte-kit|\.next|\.turbo|\.cache|__pycache__|\.venv|\.tox|\.mypy_cache|\.pytest_cache|\.ruff_cache)(?:[/\\]|$)/

export type Analyser = (root: string) => Promise<Analysis>

/** What watches a repository's files, and is told to stop. */
export type WatchFiles = (root: string, changed: () => void) => { close(): Promise<void> }

/** Chokidar, without what git never lists and what tools rewrite all the time. */
const chokidar: WatchFiles = (root, changed) =>
  watch(root, {
    ignoreInitial: true,
    ignored: (path) => UNWATCHED.test(path.slice(root.length))
  }).on('all', changed) as FSWatcher

/** An analysis that was waiting and is not wanted any more: its tab is no longer in front. */
export class AnalysisDropped extends Error {
  constructor() {
    super('The analysis was not wanted any more.')
  }
}

interface Entry {
  readonly root: string
  analysis?: Analysis
  /** When the analysis was asked for, in milliseconds. */
  analysedAt?: number
  running?: Promise<Analysis>
  /** Files changed while an analysis was running: it runs again when it is done. */
  again: boolean
  /** Structure was opened: the files are watched and the analysis is kept current. */
  watcher?: { close(): Promise<void> }
  timer?: NodeJS.Timeout
}

/**
 * Why an analysis runs: for Structure, which is open and kept current, or for what the other
 * modules show of it — the count of the Problems, the search —, which is not wanted any more
 * when another tab comes to the front.
 */
type Wanted = 'structure' | 'outline'

interface Job {
  readonly repositoryId: string
  readonly entry: Entry
  wanted: Wanted
  readonly resolve: (analysis: Analysis) => void
  readonly reject: (error: unknown) => void
}

/**
 * The Structure module's side of the open repositories. A repository whose tab comes to the
 * front is analysed once, for the count of its Problems and the search; its files are watched,
 * and it is analysed again when they change, only from the time its Structure is opened. One
 * analysis runs at a time, and the one of the tab in front goes first. The levels are computed
 * here, from the analysis, which is cheap.
 */
export class Structures {
  private readonly entries = new Map<string, Entry>()
  private readonly waiting: Job[] = []
  private busy = false
  private front: string | undefined

  constructor(
    private readonly analyser: Analyser,
    private readonly onChanged: (repositoryId: string) => void,
    private readonly watchFiles: WatchFiles | false = chokidar
  ) {}

  /** One level of a repository's Components, after the analysis it comes from. */
  async view(
    repositoryId: string,
    root: string,
    parent: string | undefined,
    tests: boolean,
    expanded: readonly string[] = []
  ): Promise<StructureView> {
    const analysis = await this.opened(repositoryId, root)
    return viewOf(repositoryId, analysis, parent, tests, expanded)
  }

  /**
   * Every Component and Source File, and the Problems of the declaration, after the analysis.
   * The last one does, unless `fresh` asks for one of now where the files are not watched.
   */
  async outline(repositoryId: string, root: string, fresh = false): Promise<StructureOutline> {
    const entry = this.entryOf(repositoryId, root)
    const known = entry.analysis && (entry.watcher || !fresh) ? entry.analysis : undefined
    const analysis = known ?? (await this.run(repositoryId, entry, 'outline'))
    return outlineOf(repositoryId, analysis, {
      current: entry.watcher !== undefined,
      analysedAt: entry.analysedAt ?? Date.now()
    })
  }

  /** A Source File's text for the code viewer, if the analysis lists it as one. */
  async sourceFile(repositoryId: string, root: string, path: string): Promise<SourceFileResult> {
    const analysis = await this.opened(repositoryId, root)
    return readSourceFile(root, path, analysis)
  }

  /** The Structure as it is now, to plan against. */
  async structureOf(repositoryId: string, root: string): Promise<Structure> {
    const entry = this.entryOf(repositoryId, root)
    const current = entry.watcher ? entry.analysis : undefined
    return (current ?? (await this.run(repositoryId, entry, 'structure'))).structure
  }

  /**
   * The tab of this repository came to the front: its analysis goes ahead of those waiting,
   * and those of other tabs that were only wanted for what the other modules show are dropped.
   */
  bringToFront(repositoryId: string | undefined): void {
    this.front = repositoryId
    for (const job of [...this.waiting]) {
      if (job.repositoryId === repositoryId) {
        this.waiting.splice(this.waiting.indexOf(job), 1)
        this.waiting.unshift(job)
      } else if (job.wanted === 'outline') {
        this.waiting.splice(this.waiting.indexOf(job), 1)
        job.reject(new AnalysisDropped())
      }
    }
  }

  /**
   * Structure is opened: from now on the files are watched, and the analysis is kept current.
   * The analysis made before, for the other modules, may be older than the files.
   */
  private opened(repositoryId: string, root: string): Promise<Analysis> {
    const entry = this.entryOf(repositoryId, root)
    if (entry.watcher) {
      return entry.analysis ? Promise.resolve(entry.analysis) : this.run(repositoryId, entry)
    }
    entry.watcher = this.watchFiles
      ? this.watchFiles(root, () => this.refresh(repositoryId))
      : { close: async () => undefined }
    // One that is running already began before the watcher, and runs again once it is done.
    const begun = entry.running && !this.waiting.some((job) => job.entry === entry)
    if (begun) entry.again = true
    return this.run(repositoryId, entry)
  }

  /** Analyse again soon, if the repository was analysed at all. */
  refresh(repositoryId: string): void {
    const entry = this.entries.get(repositoryId)
    if (!entry) return
    clearTimeout(entry.timer)
    entry.timer = setTimeout(() => {
      if (entry.running) entry.again = true
      else
        void this.run(repositoryId, entry, entry.watcher ? 'structure' : 'outline').then(
          () => this.onChanged(repositoryId),
          () => undefined
        )
    }, REANALYSE_DELAY_MS)
  }

  async close(repositoryId: string): Promise<void> {
    const entry = this.entries.get(repositoryId)
    if (!entry) return
    this.entries.delete(repositoryId)
    clearTimeout(entry.timer)
    for (const job of this.waiting.filter((waiting) => waiting.entry === entry)) {
      this.waiting.splice(this.waiting.indexOf(job), 1)
      job.reject(new AnalysisDropped())
    }
    await entry.watcher?.close()
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.entries.keys()].map((id) => this.close(id)))
  }

  private entryOf(repositoryId: string, root: string): Entry {
    let entry = this.entries.get(repositoryId)
    if (!entry || entry.root !== root) {
      if (entry) {
        clearTimeout(entry.timer)
        void entry.watcher?.close()
      }
      entry = { root, again: false }
      this.entries.set(repositoryId, entry)
    }
    return entry
  }

  private run(repositoryId: string, entry: Entry, wanted: Wanted = 'structure'): Promise<Analysis> {
    if (entry.running) {
      // Wanted for Structure now: it is no longer dropped when another tab comes to the front.
      const job = this.waiting.find((waiting) => waiting.entry === entry)
      if (job && wanted === 'structure') job.wanted = 'structure'
      return entry.running
    }
    const asked = Date.now()
    const running = new Promise<Analysis>((resolve, reject) => {
      const job: Job = { repositoryId, entry, wanted, resolve, reject }
      if (repositoryId === this.front) this.waiting.unshift(job)
      else this.waiting.push(job)
    }).then(
      (analysis) => {
        entry.running = undefined
        if (this.entries.get(repositoryId) === entry) {
          entry.analysis = analysis
          entry.analysedAt = asked
        }
        if (entry.again) {
          entry.again = false
          this.refresh(repositoryId)
        }
        return analysis
      },
      (error: unknown) => {
        entry.running = undefined
        throw error
      }
    )
    entry.running = running
    this.next()
    return running
  }

  /** The next analysis that waits, once the one before it is done. */
  private next(): void {
    if (this.busy) return
    const job = this.waiting.shift()
    if (!job) return
    this.busy = true
    this.analyser(job.entry.root)
      .then(job.resolve, job.reject)
      .finally(() => {
        this.busy = false
        this.next()
      })
  }
}

/**
 * A level as the window shows it: the nodes with their names, sizes and metrics, the edges
 * with the Source File Dependencies behind them, the matrix with the Components in
 * `expanded` expanded, the pages of the Components that are shown, and what the analysis
 * found. Below a Component that is no longer there, the top level.
 */
export function viewOf(
  repositoryId: string,
  analysis: Analysis,
  parent: string | undefined,
  tests: boolean,
  expanded: readonly string[] = []
): StructureView {
  const { structure, dependencies } = analysis
  const { lineCounts } = dependencies
  const levels = new Map<string | undefined, Level | undefined>()
  const levelAt = (below: string | undefined): Level | undefined => {
    if (!levels.has(below)) {
      levels.set(below, levelOf(structure, dependencies.dependencies, below, { tests }))
    }
    return levels.get(below)
  }
  const level = levelAt(parent) ?? levelAt(undefined)!

  const byId = new Map<string, DeclaredComponent>()
  const parentOf = new Map<string, string | undefined>()
  const collect = (list: readonly DeclaredComponent[], above: string | undefined): void => {
    for (const component of list) {
      byId.set(component.id, component)
      parentOf.set(component.id, above)
      collect(component.children, component.id)
    }
  }
  // The directories below a Component without children are nodes, pages and steps of the
  // way back up as well; `structure` finds them once and hands out the same ones every time.
  const explored = withDirectories(structure)
  collect(explored.components, undefined)
  const metrics = metricsOf(structure, dependencies.dependencies, lineCounts, { tests })
  const hasPage = (kind: LevelNode['kind']): boolean => kind === 'component' || kind === 'directory'

  const nameOf = (node: Pick<LevelNode, 'kind' | 'id'>): string =>
    node.kind === 'source-file'
      ? node.id.slice(node.id.lastIndexOf('/') + 1)
      : (byId.get(node.id)?.name ?? node.id)
  const nodeOf = (node: LevelNode): StructureNode => ({
    kind: node.kind,
    id: node.id,
    name: nameOf(node),
    ...sizeOf(node.files, lineCounts),
    ...(hasPage(node.kind) && metrics.has(node.id) ? { metrics: metrics.get(node.id)! } : {})
  })

  const matrix = matrixOf(structure, dependencies.dependencies, level.parent, expanded, {
    tests
  })!
  // Up from the level through its ancestors: a directory that was passed over is no step.
  const path: { id: string; name: string }[] = []
  for (let id = level.parent; id !== undefined; id = parentOf.get(id)) {
    path.unshift({ id, name: byId.get(id)?.name ?? id })
  }

  // Every Component and directory the level or the matrix shows, expanded ones included, gets
  // its page.
  const shown = new Set([
    ...level.nodes.filter((node) => hasPage(node.kind)).map((node) => node.id),
    ...matrix.rows.filter((row) => hasPage(row.node.kind)).map((row) => row.node.id),
    ...matrix.groups.map((group) => group.id)
  ])
  const testsInside = new Map<string, number>()
  const lowerBoundInside = new Map<string, Set<string>>()
  const filesInside = new Map<string, string[]>()
  for (const file of explored.sourceFiles) {
    const counted = tests || !file.test
    for (let id = file.component; id !== undefined; id = parentOf.get(id)) {
      if (file.test) testsInside.set(id, (testsInside.get(id) ?? 0) + 1)
      if (counted && isLowerBound(file.language)) {
        lowerBoundInside.set(id, (lowerBoundInside.get(id) ?? new Set()).add(file.language))
      }
      if (!counted || !shown.has(id)) continue
      const list = filesInside.get(id) ?? []
      if (list.length < LISTED_AT_MOST) list.push(file.path)
      filesInside.set(id, list)
    }
  }
  const components = [...shown].map((id) =>
    pageOf(byId.get(id)!, parentOf.get(id), levelAt(parentOf.get(id))!, {
      metrics: metrics.get(id),
      files: filesInside.get(id) ?? [],
      testFiles: testsInside.get(id) ?? 0,
      lowerBound: LOWER_BOUND.filter((language) => lowerBoundInside.get(id)?.has(language)),
      nameOf
    })
  )

  return {
    repositoryId,
    origin: structure.origin,
    canAdopt: structure.canAdopt,
    problems: structure.problems,
    hints: structure.hints,
    sourceFiles: structure.sourceFiles.length,
    testFiles: structure.sourceFiles.filter((file) => file.test).length,
    lowerBound: LOWER_BOUND.filter((language) =>
      structure.sourceFiles.some((file) => file.language === language)
    ),
    dependencies: dependencies.dependencies.length,
    libraries: analysis.inventory.libraries.length,
    inventory: analysis.inventory,
    notResolvedCount: dependencies.notResolved.length,
    notResolved: dependencies.notResolved.slice(0, LISTED_AT_MOST),
    notAnalysed: dependencies.notAnalysed,
    milliseconds: analysis.milliseconds,
    path,
    parent: level.parent,
    tests,
    nodes: level.nodes.map(nodeOf),
    edges: level.edges,
    cycles: level.cycles,
    matrix: {
      rows: matrix.rows.map((row) => ({
        ...nodeOf(row.node),
        depth: row.depth,
        expandable: row.expandable
      })),
      groups: matrix.groups.map((group) => ({ ...group, name: byId.get(group.id)!.name })),
      cycles: matrix.cycles,
      cells: matrix.cells,
      expanded: matrix.groups.map((group) => group.id)
    },
    components
  }
}

/** What the analysis knows of the whole repository, for the views across the modules. */
export function outlineOf(
  repositoryId: string,
  analysis: Analysis,
  when: Pick<StructureOutline, 'current' | 'analysedAt'> = { current: true, analysedAt: 0 }
): StructureOutline {
  const { structure } = analysis
  return {
    repositoryId,
    ...when,
    origin: structure.origin,
    components: everyComponent(structure.components).map(({ id, name }) => ({ id, name })),
    sourceFiles: structure.sourceFiles.map((file) => ({
      path: file.path,
      ...(file.component !== undefined && { component: file.component }),
      test: file.test
    })),
    problems: structure.problems,
    hints: structure.hints,
    libraries: analysis.inventory.libraries.map(({ ecosystem, name, imports }) => ({
      ecosystem,
      name,
      imports
    }))
  }
}

/** A language whose Dependencies are a lower bound. */
const isLowerBound = (language: string): language is LowerBound =>
  (LOWER_BOUND as readonly string[]).includes(language)

/** The page of one Component: its declaration, its metrics, and its Dependencies at its level. */
function pageOf(
  component: DeclaredComponent,
  parent: string | undefined,
  level: Level,
  found: {
    readonly metrics: Metrics | undefined
    readonly files: readonly string[]
    readonly testFiles: number
    readonly lowerBound: readonly LowerBound[]
    readonly nameOf: (node: Pick<LevelNode, 'kind' | 'id'>) => string
  }
): StructureComponent {
  const kindOf = new Map(level.nodes.map((node) => [node.id, node.kind]))
  const ref = (id: string): Pick<StructureNode, 'kind' | 'id' | 'name'> => {
    const kind = kindOf.get(id)!
    return { kind, id, name: found.nameOf({ kind, id }) }
  }
  const neighbour = (
    id: string,
    edge: { readonly weight: number; readonly typeOnly: boolean }
  ): StructureNeighbour => ({ ...ref(id), weight: edge.weight, typeOnly: edge.typeOnly })
  return {
    id: component.id,
    name: component.name,
    ...(isDirectoryNode(component) ? { directory: component.directory } : {}),
    ...(component.description === undefined ? {} : { description: component.description }),
    paths: component.paths,
    tests: component.tests,
    level: parent,
    files: found.files,
    testFiles: found.testFiles,
    lowerBound: found.lowerBound,
    ...(found.metrics ? { metrics: found.metrics } : {}),
    dependsOn: level.edges
      .filter((edge) => edge.from === component.id)
      .map((edge) => neighbour(edge.to, edge)),
    usedBy: level.edges
      .filter((edge) => edge.to === component.id)
      .map((edge) => neighbour(edge.from, edge)),
    cycles: level.cycles
      .filter((cycle) => cycle.members.includes(component.id))
      .map((cycle) => ({ roundTrip: cycle.roundTrip.map(ref), typeOnly: cycle.typeOnly }))
  }
}

/**
 * The text of a Source File, read only when the analysis lists `path` as one: the window names
 * a file by the path the analysis gave it, and cannot make the main process read anything
 * else. Read as the disk has it now, which may be newer than the analysis.
 */
export async function readSourceFile(
  root: string,
  path: string,
  analysis: Analysis,
  limit = SOURCE_FILE_LIMIT
): Promise<SourceFileResult> {
  const file = analysis.structure.sourceFiles.find((candidate) => candidate.path === path)
  const full = resolve(root, path)
  // The analysis never lists a path outside the root; this holds should that ever change.
  const inside = full.startsWith(resolve(root) + sep)
  if (file === undefined || !inside) return { ok: false, reason: t.notASourceFile(path) }
  try {
    if ((await stat(full)).size > limit) {
      return { ok: false, reason: t.sourceFileTooLarge(path, Math.round(limit / 1024 / 1024)) }
    }
    const text = await readFile(join(root, path), 'utf8')
    return { ok: true, file: { path, language: file.language, text } }
  } catch {
    return { ok: false, reason: t.sourceFileUnreadable(path) }
  }
}

/** The name of a repository's cache of extractions below the user-data folder: one per root. */
export function cacheName(root: string): string {
  return `${createHash('sha256').update(root).digest('hex').slice(0, 32)}.json`
}
