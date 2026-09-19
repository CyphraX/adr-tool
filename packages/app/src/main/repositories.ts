import { randomUUID } from 'node:crypto'
import { basename } from 'node:path'
import { watch, type FSWatcher } from 'chokidar'
import {
  applyChangeSet,
  openRepository,
  planAccept,
  planDeprecate,
  planReject,
  type ChangeSet
} from '@adr-tool/core'
import type { ApplyResult, Decision, OpenRepository, PlanResult } from '../shared/ipc'
import { nodeFileSystem } from './node-file-system'
import { watchPaths } from './watch-paths'

const RELOAD_DELAY_MS = 150

interface Entry {
  readonly id: string
  readonly root: string
  watcher?: FSWatcher
  watched: string[]
  reload?: NodeJS.Timeout
}

/**
 * The repositories that are open in the app. Each one is read through `core` and watched,
 * so that what git, an editor or an agent changes on disk reaches the view.
 */
export class Repositories {
  private readonly entries = new Map<string, Entry>()
  /** Changes that were planned and shown, and wait to be applied or discarded. */
  private readonly planned = new Map<string, { repositoryId: string; changeSet: ChangeSet }>()

  constructor(private readonly onChanged: (repository: OpenRepository) => void) {}

  get roots(): string[] {
    return [...this.entries.values()].map((entry) => entry.root)
  }

  rootOf(id: string): string | undefined {
    return this.entries.get(id)?.root
  }

  /** Open a directory, or return the repository that is already open for it. */
  async open(root: string): Promise<OpenRepository> {
    const existing = [...this.entries.values()].find((entry) => entry.root === root)
    const entry = existing ?? { id: randomUUID(), root, watched: [] }
    this.entries.set(entry.id, entry)
    return this.load(entry)
  }

  async close(id: string): Promise<void> {
    const entry = this.entries.get(id)
    if (!entry) return
    this.entries.delete(id)
    clearTimeout(entry.reload)
    await entry.watcher?.close()
  }

  /** Plan a decision against the files as they are on disk right now. Nothing is written. */
  async planDecision(
    repositoryId: string,
    logPath: string,
    adrId: string,
    decision: Decision
  ): Promise<PlanResult> {
    const entry = this.entries.get(repositoryId)
    if (!entry) return { ok: false, reason: 'This repository is no longer open.' }

    const fs = nodeFileSystem(entry.root)
    const log = (await openRepository(fs)).logs.find((candidate) => candidate.path === logPath)
    if (!log) return { ok: false, reason: `There is no Decision Log at ${logPath} any more.` }

    const plan =
      decision === 'accept'
        ? await planAccept(fs, log, adrId, { today: localDate() })
        : decision === 'reject'
          ? await planReject(fs, log, adrId, { today: localDate() })
          : await planDeprecate(fs, log, adrId)
    if (!plan.ok) return plan

    const changeId = randomUUID()
    this.planned.set(changeId, { repositoryId, changeSet: plan.changeSet })
    return { ok: true, change: { changeId, changeSet: plan.changeSet } }
  }

  async applyChange(changeId: string): Promise<ApplyResult> {
    const planned = this.planned.get(changeId)
    const entry = planned && this.entries.get(planned.repositoryId)
    this.planned.delete(changeId)
    if (!planned || !entry) return { applied: false, reason: 'This change is no longer available.' }

    const result = await applyChangeSet(nodeFileSystem(entry.root), planned.changeSet)
    if (!result.applied) {
      const files = result.conflicts.join(', ')
      return {
        applied: false,
        reason: `Nothing was written: ${files} changed on disk after the preview was made. Try again to see the change against the current files.`
      }
    }
    return { applied: true, repository: await this.load(entry) }
  }

  discardChange(changeId: string): void {
    this.planned.delete(changeId)
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.entries.keys()].map((id) => this.close(id)))
  }

  private async load(entry: Entry): Promise<OpenRepository> {
    const repository = await openRepository(nodeFileSystem(entry.root))
    this.watch(entry, watchPaths(entry.root, repository))
    return { id: entry.id, root: entry.root, name: basename(entry.root), repository }
  }

  /** (Re)start the watcher when the set of paths changed, e.g. after a Decision Log was configured. */
  private watch(entry: Entry, paths: string[]): void {
    if (entry.watcher && paths.join('\n') === entry.watched.join('\n')) return
    void entry.watcher?.close()
    entry.watched = paths
    entry.watcher = watch(paths, { depth: 0, ignoreInitial: true }).on('all', () => {
      // Editors and git touch several files at once; one reload covers them all.
      clearTimeout(entry.reload)
      entry.reload = setTimeout(() => {
        if (!this.entries.has(entry.id)) return
        this.load(entry).then(this.onChanged, (error) => console.error(error))
      }, RELOAD_DELAY_MS)
    })
  }
}

/** Today's date as the user sees it on their calendar, not in UTC. */
function localDate(now = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}
