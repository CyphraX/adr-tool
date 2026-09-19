import { randomUUID } from 'node:crypto'
import { basename, join } from 'node:path'
import { watch, type FSWatcher } from 'chokidar'
import {
  DEFAULT_LOG_PATHS,
  applyChangeSet,
  openRepository,
  listTemplates,
  planAccept,
  planCreate,
  planDeprecate,
  planEditBody,
  planEditMetadata,
  planReject,
  planRepair,
  type ChangeSet,
  type DecisionLog,
  type FileChange,
  type Plan,
  type Templates
} from '@adr-tool/core'
import type {
  ApplyResult,
  BodyEditRequest,
  CreateRequest,
  Decision,
  HistoryEntry,
  MetadataEditRequest,
  OpenRepository,
  PlanResult,
  RepairRequest
} from '../shared/ipc'
import { gitIn } from './git'
import { historyChangeOf, historyOf } from './history'
import { nodeFileSystem } from './node-file-system'
import { watchPaths } from './watch-paths'

const RELOAD_DELAY_MS = 150

/** Where the first ADR of a repository goes: a well-known directory, found again without configuration. */
const FIRST_LOG: DecisionLog = {
  path: DEFAULT_LOG_PATHS[0]!,
  naming: 'sequential',
  adrs: [],
  relations: [],
  problems: []
}

interface Entry {
  readonly id: string
  readonly root: string
  /** Where git keeps HEAD and the index. Asked once per repository; `null`: git would not say. */
  gitDirectory?: string | null
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
    for (const [changeId, planned] of this.planned) {
      if (planned.repositoryId === id) this.planned.delete(changeId)
    }
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
    return this.plan(repositoryId, logPath, (fs, log) =>
      decision === 'accept'
        ? planAccept(fs, log, adrId, { today: localDate() })
        : decision === 'reject'
          ? planReject(fs, log, adrId, { today: localDate() })
          : planDeprecate(fs, log, adrId)
    )
  }

  /** Plan saving an edited body. The author of a Correction is who git says the user is. */
  async planBodyEdit(request: BodyEditRequest): Promise<PlanResult> {
    const root = this.rootOf(request.repositoryId)
    const author = root === undefined ? undefined : await gitIn(root).userName()
    return this.plan(request.repositoryId, request.logPath, (fs, log) =>
      planEditBody(fs, log, request.adrId, {
        base: request.base,
        body: request.body,
        today: localDate(),
        note: request.note.trim(),
        ...(author !== undefined && { author })
      })
    )
  }

  /** Plan an edit of the Metadata lists a person maintains: what was added, what was removed. */
  async planMetadataEdit(request: MetadataEditRequest): Promise<PlanResult> {
    return this.plan(request.repositoryId, request.logPath, (fs, log) =>
      planEditMetadata(fs, log, request.adrId, {
        decisionMakers: request.decisionMakers,
        tags: request.tags,
        relations: request.relations
      })
    )
  }

  /** Plan the repair of a Problem, against the Problems the log has on disk right now. */
  async planRepair(request: RepairRequest): Promise<PlanResult> {
    return this.plan(request.repositoryId, request.logPath, (fs, log) =>
      planRepair(fs, log, request.repair)
    )
  }

  async listTemplates(repositoryId: string): Promise<Templates> {
    const root = this.rootOf(repositoryId)
    if (root === undefined) return { templates: [], defaultName: '' }
    return listTemplates(nodeFileSystem(root))
  }

  /** Plan a new ADR. In a repository without a Decision Log it starts the first one. */
  async planCreate(request: CreateRequest): Promise<PlanResult> {
    return this.plan(request.repositoryId, request.logPath, (fs, log) =>
      planCreate(fs, log, {
        title: request.title,
        template: request.template,
        today: localDate(),
        ...(request.relation && { relation: request.relation })
      })
    )
  }

  /**
   * Read the log afresh, let `core` plan against it, and hold the result for the renderer.
   * Without a `logPath` the repository has no Decision Log yet, and the plan starts one.
   */
  private async plan(
    repositoryId: string,
    logPath: string | undefined,
    build: (fs: ReturnType<typeof nodeFileSystem>, log: DecisionLog) => Promise<Plan>
  ): Promise<PlanResult> {
    const entry = this.entries.get(repositoryId)
    if (!entry) return { ok: false, reason: 'This repository is no longer open.' }

    const fs = nodeFileSystem(entry.root)
    const logs = (await openRepository(fs)).logs
    const log =
      logPath === undefined && logs.length === 0
        ? FIRST_LOG
        : logs.find((candidate) => candidate.path === (logPath ?? logs[0]?.path))
    if (!log) return { ok: false, reason: `There is no Decision Log at ${logPath} any more.` }

    const plan = await build(fs, log)
    if (!plan.ok) return plan

    const changeId = randomUUID()
    this.planned.set(changeId, { repositoryId, changeSet: plan.changeSet })
    const warnings = plan.warnings ?? []
    const createdId = plan.created?.id
    const renamedId = plan.renamed?.to
    return {
      ok: true,
      change: {
        changeId,
        changeSet: plan.changeSet,
        warnings,
        ...(createdId !== undefined && { createdId }),
        ...(renamedId !== undefined && { renamedId })
      }
    }
  }

  /** The history of an ADR's file. The path is never the renderer's: it is looked up in the log. */
  async history(repositoryId: string, logPath: string, adrId: string): Promise<HistoryEntry[]> {
    const found = await this.adrOnDisk(repositoryId, logPath, adrId)
    return found ? historyOf(gitIn(found.root), found.path, found.text) : []
  }

  async historyChange(
    repositoryId: string,
    logPath: string,
    adrId: string,
    entryId: string
  ): Promise<FileChange | undefined> {
    const found = await this.adrOnDisk(repositoryId, logPath, adrId)
    return found && historyChangeOf(gitIn(found.root), found.path, found.text, entryId)
  }

  private async adrOnDisk(
    repositoryId: string,
    logPath: string,
    adrId: string
  ): Promise<{ root: string; path: string; text: string | undefined } | undefined> {
    const entry = this.entries.get(repositoryId)
    if (!entry) return undefined
    const fs = nodeFileSystem(entry.root)
    const adr = (await openRepository(fs)).logs
      .find((log) => log.path === logPath)
      ?.adrs.find((candidate) => candidate.id === adrId)
    return adr && { root: entry.root, path: adr.path, text: await fs.readText(adr.path) }
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
    const git = gitIn(entry.root)
    const [repository, tree] = await Promise.all([
      openRepository(nodeFileSystem(entry.root)),
      git.workingTree()
    ])
    entry.gitDirectory ??= tree ? ((await git.directory()) ?? null) : undefined
    // A commit, a checkout, a reset or `git add` changes no ADR, and still changes what is uncommitted.
    const gitPaths = entry.gitDirectory
      ? ['HEAD', 'index', 'logs/HEAD'].map((file) => join(entry.gitDirectory!, file))
      : []
    this.watch(entry, [...watchPaths(entry.root, repository), ...gitPaths])

    const adrPaths = new Set(repository.logs.flatMap((log) => log.adrs.map((adr) => adr.path)))
    return {
      id: entry.id,
      root: entry.root,
      name: basename(entry.root),
      repository,
      ...(tree && {
        git: { branch: tree.branch, changed: tree.changed.filter((path) => adrPaths.has(path)) }
      })
    }
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
