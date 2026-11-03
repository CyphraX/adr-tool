import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { watch, type FSWatcher } from 'chokidar'
import {
  isDirectoryNode,
  levelOf,
  matrixOf,
  metricsOf,
  propagationCostOf,
  sizeOf,
  withDirectories,
  type DeclaredComponent,
  type FileMeasures,
  type Level,
  type LevelNode,
  type Metrics,
  type Structure
} from '@adr-tool/structure/model'
import type {
  SourceFileResult,
  StructureClass,
  StructureComponent,
  StructureFunction,
  StructureNeighbour,
  StructureNode,
  StructureView
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
/** How many of its most complex functions, and of its least cohesive classes, a page lists. */
const FUNCTIONS_LISTED = 10
const CLASSES_LISTED = 5
/**
 * Not watched: what git never lists, and the build output and caches that tools rewrite all
 * the time. A file git lists in one of them changes nothing until the next analysis.
 */
const UNWATCHED =
  /(?:^|[/\\])(?:node_modules|\.git|dist|build|out|target|coverage|\.svelte-kit|\.next|\.turbo|\.cache)(?:[/\\]|$)/

export type Analyser = (root: string) => Promise<Analysis>

interface Entry {
  readonly root: string
  analysis?: Analysis
  running?: Promise<Analysis>
  /** Files changed while an analysis was running: it runs again when it is done. */
  again: boolean
  watcher?: FSWatcher
  timer?: NodeJS.Timeout
}

/**
 * The Structure module's side of the open repositories. A repository is analysed the first
 * time its Structure is asked for, and from then on watched and analysed again when its files
 * change. The levels are computed here, from the analysis, which is cheap.
 */
export class Structures {
  private readonly entries = new Map<string, Entry>()

  constructor(
    private readonly analyser: Analyser,
    private readonly onChanged: (repositoryId: string) => void,
    private readonly watchFiles = true
  ) {}

  /** One level of a repository's Components, after the analysis it comes from. */
  async view(
    repositoryId: string,
    root: string,
    parent: string | undefined,
    tests: boolean,
    expanded: readonly string[] = []
  ): Promise<StructureView> {
    const entry = this.entryOf(repositoryId, root)
    const analysis = entry.analysis ?? (await this.run(repositoryId, entry))
    return viewOf(repositoryId, analysis, parent, tests, expanded)
  }

  /** A Source File's text for the code viewer, if the analysis lists it as one. */
  async sourceFile(repositoryId: string, root: string, path: string): Promise<SourceFileResult> {
    const entry = this.entryOf(repositoryId, root)
    const analysis = entry.analysis ?? (await this.run(repositoryId, entry))
    return readSourceFile(entry.root, path, analysis)
  }

  /** The Structure the last analysis found, to plan against. */
  async structureOf(repositoryId: string, root: string): Promise<Structure> {
    const entry = this.entryOf(repositoryId, root)
    return (entry.analysis ?? (await this.run(repositoryId, entry))).structure
  }

  /** Analyse again soon, if the repository was analysed at all. */
  refresh(repositoryId: string): void {
    const entry = this.entries.get(repositoryId)
    if (!entry) return
    clearTimeout(entry.timer)
    entry.timer = setTimeout(() => {
      if (entry.running) entry.again = true
      else
        void this.run(repositoryId, entry).then(
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
      if (this.watchFiles) {
        entry.watcher = watch(root, {
          ignoreInitial: true,
          ignored: (path) => UNWATCHED.test(path.slice(root.length))
        }).on('all', () => this.refresh(repositoryId))
      }
    }
    return entry
  }

  private run(repositoryId: string, entry: Entry): Promise<Analysis> {
    if (entry.running) return entry.running
    const running = this.analyser(entry.root).then(
      (analysis) => {
        entry.running = undefined
        if (this.entries.get(repositoryId) === entry) entry.analysis = analysis
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
    return running
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
  const { measures } = dependencies
  const metrics = metricsOf(structure, dependencies.dependencies, lineCounts, { tests }, measures)
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
  const javaInside = new Set<string>()
  const filesInside = new Map<string, string[]>()
  const measuredInside = new Map<string, FileMeasures[]>()
  const measuredFiles = new Map<FileMeasures, string>()
  for (const file of explored.sourceFiles) {
    const counted = tests || !file.test
    const measured = counted ? measures.get(file.path) : undefined
    if (measured) measuredFiles.set(measured, file.path)
    for (let id = file.component; id !== undefined; id = parentOf.get(id)) {
      if (file.test) testsInside.set(id, (testsInside.get(id) ?? 0) + 1)
      if (counted && file.language === 'java') javaInside.add(id)
      if (!counted || !shown.has(id)) continue
      const list = filesInside.get(id) ?? []
      if (list.length < LISTED_AT_MOST) list.push(file.path)
      filesInside.set(id, list)
      if (measured === undefined) continue
      const measuredList = measuredInside.get(id) ?? []
      measuredList.push(measured)
      measuredInside.set(id, measuredList)
    }
  }
  const inside = (id: string): ReturnType<typeof insideOf> =>
    insideOf(measuredInside.get(id) ?? [], measuredFiles)
  const components = [...shown].map((id) =>
    pageOf(byId.get(id)!, parentOf.get(id), levelAt(parentOf.get(id))!, {
      metrics: metrics.get(id),
      files: filesInside.get(id) ?? [],
      testFiles: testsInside.get(id) ?? 0,
      java: javaInside.has(id),
      ...inside(id),
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
    javaFiles: structure.sourceFiles.filter((file) => file.language === 'java').length,
    dependencies: dependencies.dependencies.length,
    libraries: new Set(dependencies.libraries.map((use) => use.library)).size,
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
    propagationCost: propagationCostOf(level),
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

/** The page of one Component: its declaration, its metrics, and its Dependencies at its level. */
function pageOf(
  component: DeclaredComponent,
  parent: string | undefined,
  level: Level,
  found: {
    readonly metrics: Metrics | undefined
    readonly files: readonly string[]
    readonly testFiles: number
    readonly java: boolean
    readonly functions: readonly StructureFunction[]
    readonly functionCount: number
    readonly classes: readonly StructureClass[]
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
    java: found.java,
    ...(found.metrics ? { metrics: found.metrics } : {}),
    functions: found.functions,
    functionCount: found.functionCount,
    classes: found.classes,
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
 * The most complex functions and the least cohesive classes in what a page contains: the
 * first few of each, the most first, then by file and line (structure-format.md, section 5).
 */
function insideOf(
  files: readonly FileMeasures[],
  pathOf: ReadonlyMap<FileMeasures, string>
): { functions: StructureFunction[]; functionCount: number; classes: StructureClass[] } {
  const place = (a: { file: string; line: number }, b: { file: string; line: number }): number =>
    (a.file < b.file ? -1 : a.file > b.file ? 1 : 0) || a.line - b.line
  const functions: StructureFunction[] = []
  const classes: StructureClass[] = []
  for (const measured of files) {
    const file = pathOf.get(measured)!
    for (const { name, line, complexity } of measured.functions) {
      functions.push({ file, name, line, complexity })
    }
    for (const { name, line, methods, lcom4 } of measured.classes) {
      if (lcom4 !== undefined && lcom4 > 1) classes.push({ file, name, line, methods, lcom4 })
    }
  }
  return {
    functions: functions
      .sort((a, b) => b.complexity - a.complexity || place(a, b))
      .slice(0, FUNCTIONS_LISTED),
    functionCount: functions.length,
    classes: classes.sort((a, b) => b.lcom4 - a.lcom4 || place(a, b)).slice(0, CLASSES_LISTED)
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
