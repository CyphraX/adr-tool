import { createHash } from 'node:crypto'
import { watch, type FSWatcher } from 'chokidar'
import {
  levelOf,
  type DeclaredComponent,
  type Level,
  type Structure
} from '@adr-tool/structure/model'
import type { StructureNode, StructureView } from '../shared/ipc'
import type { Analysis } from './analysis'

/** Editors, formatters and git touch many files at once; one analysis covers them all. */
const REANALYSE_DELAY_MS = 300
/** How many uses that are not resolved go to the window; the count is always the whole. */
const LISTED_AT_MOST = 500
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
    tests: boolean
  ): Promise<StructureView> {
    const entry = this.entryOf(repositoryId, root)
    const analysis = entry.analysis ?? (await this.run(repositoryId, entry))
    return viewOf(repositoryId, analysis, parent, tests)
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
 * A level as the window shows it: the nodes with their names and sizes, the edges with the
 * Source File Dependencies behind them, and what the analysis found. Below a Component that
 * is no longer there, the top level.
 */
export function viewOf(
  repositoryId: string,
  analysis: Analysis,
  parent: string | undefined,
  tests: boolean
): StructureView {
  const { structure, dependencies } = analysis
  const level: Level =
    levelOf(structure, dependencies.dependencies, parent, { tests }) ??
    levelOf(structure, dependencies.dependencies, undefined, { tests })!

  const byId = new Map<string, DeclaredComponent>()
  const collect = (list: readonly DeclaredComponent[]): void => {
    for (const component of list) {
      byId.set(component.id, component)
      collect(component.children)
    }
  }
  collect(structure.components)

  const nodes = level.nodes.map((node): StructureNode => ({
    kind: node.kind,
    id: node.id,
    name:
      node.kind === 'source-file'
        ? node.id.slice(node.id.lastIndexOf('/') + 1)
        : (byId.get(node.id)?.name ?? node.id),
    files: node.files.length
  }))
  const segments = level.parent?.split('/') ?? []
  const path = segments.map((_, index) => {
    const id = segments.slice(0, index + 1).join('/')
    return { id, name: byId.get(id)?.name ?? id }
  })

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
    nodes,
    edges: level.edges,
    cycles: level.cycles
  }
}

/** The name of a repository's cache of extractions below the user-data folder: one per root. */
export function cacheName(root: string): string {
  return `${createHash('sha256').update(root).digest('hex').slice(0, 32)}.json`
}
