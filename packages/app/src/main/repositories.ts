import { randomUUID } from 'node:crypto'
import { basename, join } from 'node:path'
import { watch, type FSWatcher } from 'chokidar'
import {
  DEFAULT_LOG_PATHS,
  applyChangeSet,
  listTemplates,
  type Adr,
  openRepository,
  planAccept,
  planCreate,
  planDeprecate,
  planEditBody,
  planEditMetadata,
  planReject,
  planMigration,
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
  CommitPlanResult,
  BranchOverview,
  CommitResult,
  CreateRequest,
  Decision,
  HistoryEntry,
  MetadataEditRequest,
  OpenRepository,
  PlanResult,
  MigrationRequest,
  RenameRequest,
  RepairRequest
} from '../shared/ipc'
import {
  branchAdr,
  branchCache,
  branchOverview,
  numberWarnings,
  type BranchCache
} from './branches'
import { planCommitOf } from './commit'
import { commitFiles, gitIn } from './git'
import { historyChangeOf, historyOf } from './history'
import { nodeFileSystem } from './node-file-system'
import { t } from './strings'
import { openWithTraces, planComponentRename } from './traces'
import { watchPaths } from './watch-paths'

const RELOAD_DELAY_MS = 150

/** Where the first ADR of a repository goes: a well-known directory, found again without configuration. */
const FIRST_LOG: DecisionLog = {
  path: DEFAULT_LOG_PATHS[0]!,
  naming: 'sequential',
  adrs: [],
  relations: [],
  guests: [],
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
  /** What was read from other branches: commits do not change. */
  readonly branches: BranchCache
  /** The overview that is being made, and the one asked for while it is. */
  overview?: { running: Promise<BranchOverview>; next?: Promise<BranchOverview> }
  /** The commits the last overview listed: those whose ADRs the renderer may ask for. */
  listed?: ReadonlySet<string>
}

/**
 * The repositories that are open in the app. Each one is read through `core` and watched,
 * so that what git, an editor or an agent changes on disk reaches the view.
 */
export class Repositories {
  private readonly entries = new Map<string, Entry>()
  /** Changes that were planned and shown, and wait to be applied or discarded. */
  private readonly planned = new Map<string, { repositoryId: string; changeSet: ChangeSet }>()
  /** Commits that were planned and shown: the files they take, and those they offer. */
  private readonly commits = new Map<
    string,
    { repositoryId: string; files: readonly FileChange[]; related: readonly FileChange[] }
  >()

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
    const entry = existing ?? { id: randomUUID(), root, watched: [], branches: branchCache() }
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
    for (const [planId, planned] of this.commits) {
      if (planned.repositoryId === id) this.commits.delete(planId)
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
    return this.plan(request.repositoryId, request.logPath, (fs, log, components) =>
      planEditMetadata(
        fs,
        log,
        request.adrId,
        {
          decisionMakers: request.decisionMakers,
          tags: request.tags,
          relations: request.relations,
          affects: request.affects
        },
        components
      )
    )
  }

  /** Plan a Rename of a Component: the declaration and every Trace that names it, as they are on disk now. */
  async planRename(request: RenameRequest): Promise<PlanResult> {
    const entry = this.entries.get(request.repositoryId)
    if (!entry) return { ok: false, reason: t.repositoryClosed }
    const fs = nodeFileSystem(entry.root)
    return this.hold(
      request.repositoryId,
      await planComponentRename(fs, request.component, request.segment)
    )
  }

  /** Plan the repair of a Problem, against the Problems the log has on disk right now. */
  async planRepair(request: RepairRequest): Promise<PlanResult> {
    return this.plan(request.repositoryId, request.logPath, (fs, log) =>
      planRepair(fs, log, request.repair)
    )
  }

  /** Plan the Migration of one foreign ADR, or of every foreign ADR of the log. */
  async planMigration(request: MigrationRequest): Promise<PlanResult> {
    return this.plan(request.repositoryId, request.logPath, (fs, log) =>
      planMigration(fs, log, request.adrId)
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
   * Without a `logPath` the repository has no Decision Log yet, and the plan starts one. The
   * log is read with its Traces checked against the declaration, which `build` is handed too.
   */
  private async plan(
    repositoryId: string,
    logPath: string | undefined,
    build: (
      fs: ReturnType<typeof nodeFileSystem>,
      log: DecisionLog,
      components: string[] | undefined
    ) => Promise<Plan>
  ): Promise<PlanResult> {
    const entry = this.entries.get(repositoryId)
    if (!entry) return { ok: false, reason: t.repositoryClosed }

    const fs = nodeFileSystem(entry.root)
    const { repository, components } = await openWithTraces(fs)
    const logs = repository.logs
    const log =
      logPath === undefined && logs.length === 0
        ? FIRST_LOG
        : logs.find((candidate) => candidate.path === (logPath ?? logs[0]?.path))
    if (!log) return { ok: false, reason: t.noLogAt(logPath) }

    const ids = components?.map((component) => component.id)
    const plan = await build(fs, log, ids)
    // A number that another branch gives an ADR of this log is taken twice once both are merged.
    const numbered = plan.ok ? (plan.created?.id ?? plan.renamed?.to) : undefined
    if (!plan.ok || numbered === undefined || log.naming !== 'sequential') {
      return this.hold(repositoryId, plan)
    }
    // Without what the branches have, the plan goes without the warning.
    const overview = await this.overviewOf(entry).catch(() => undefined)
    const taken = overview ? numberWarnings(overview, log.path, numbered, log.naming) : []
    return this.hold(
      repositoryId,
      taken.length > 0 ? { ...plan, warnings: [...(plan.warnings ?? []), ...taken] } : plan
    )
  }

  /** The ADRs that other branches add or decide, against the working tree as it is on disk. */
  async branches(repositoryId: string): Promise<BranchOverview | undefined> {
    const entry = this.entries.get(repositoryId)
    if (!entry) return undefined
    if ((await gitIn(entry.root).directory()) === undefined) return undefined
    const overview = await this.overviewOf(entry)
    entry.listed = new Set(overview.branches.map((branch) => branch.sha))
    return overview
  }

  /**
   * One overview at a time for a repository: what is asked for while one is made gets the
   * next one, made once it is done — and one for every request that came in the meantime.
   */
  private overviewOf(entry: Entry): Promise<BranchOverview> {
    const make = (): Promise<BranchOverview> => {
      const running = (async () => {
        const here = await openRepository(nodeFileSystem(entry.root))
        return branchOverview(gitIn(entry.root), here, entry.branches)
      })()
      entry.overview = { running }
      const done = (): void => {
        if (entry.overview?.running === running && !entry.overview.next) entry.overview = undefined
      }
      running.then(done, done)
      return running
    }
    const current = entry.overview
    if (!current) return make()
    current.next ??= current.running.then(make, make)
    return current.next
  }

  /** An ADR as a branch has it, read-only: only one of a commit the last overview listed. */
  async branchAdr(repositoryId: string, sha: string, path: string): Promise<Adr | undefined> {
    const entry = this.entries.get(repositoryId)
    if (!entry?.listed?.has(sha)) return undefined
    return branchAdr(gitIn(entry.root), sha, path, entry.branches)
  }

  /**
   * Hold a planned change for the renderer to show, and to apply or discard by its id. A plan
   * of another module than Decisions says nothing of what it creates or renames.
   */
  hold(repositoryId: string, plan: Plan): PlanResult {
    if (!plan.ok) return plan
    if (!this.entries.has(repositoryId)) return { ok: false, reason: t.repositoryClosed }
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

  /** Plan a commit of an ADR's files against what git and the disk say right now. */
  async planCommit(
    repositoryId: string,
    logPath: string,
    adrId: string
  ): Promise<CommitPlanResult> {
    const entry = this.entries.get(repositoryId)
    if (!entry) return { ok: false, reason: t.repositoryClosed }
    const fs = nodeFileSystem(entry.root)
    const git = gitIn(entry.root)
    const tree = await git.workingTree()
    if (!tree) return { ok: false, reason: t.commit.noGit }
    const planned = await planCommitOf({
      repository: await openRepository(fs),
      logPath,
      adrId,
      tree,
      head: (path) => git.head(path),
      read: (path) => fs.readText(path)
    })
    if (!planned.ok) return planned
    const planId = randomUUID()
    const { files, related, message, others, branch } = planned
    this.commits.set(planId, {
      repositoryId,
      files,
      related: related.map((one) => one.file)
    })
    return { ok: true, plan: { planId, files, related, message, others, branch } }
  }

  /**
   * Commit what was planned and shown, with the offered files the person chose — never a path
   * that was not offered —, unless one of them changed on disk since the preview.
   */
  async commit(planId: string, include: readonly string[], message: string): Promise<CommitResult> {
    const planned = this.commits.get(planId)
    const entry = planned && this.entries.get(planned.repositoryId)
    this.commits.delete(planId)
    if (!planned || !entry) return { committed: false, reason: t.commit.gone }

    const files = [
      ...planned.files,
      ...planned.related.filter((file) => include.includes(file.path))
    ]
    const fs = nodeFileSystem(entry.root)
    const changed: string[] = []
    for (const file of files) {
      const where = file.renameTo ?? file.path
      if ((await fs.readText(where)) !== file.after) changed.push(where)
      // A Renumber is a rename only while the file it came from stays gone.
      if (file.renameTo !== undefined && (await fs.readText(file.path)) !== undefined) {
        changed.push(file.path)
      }
    }
    if (changed.length > 0) {
      return { committed: false, reason: t.commit.changedSincePreview(changed.join(', ')) }
    }
    const paths = files.flatMap((file) =>
      file.renameTo === undefined ? [file.path] : [file.path, file.renameTo]
    )
    const outcome = await commitFiles(entry.root, paths, message)
    return outcome.committed ? { ...outcome, repository: await this.load(entry) } : outcome
  }

  discardCommit(planId: string): void {
    this.commits.delete(planId)
  }

  async applyChange(changeId: string): Promise<ApplyResult> {
    const planned = this.planned.get(changeId)
    const entry = planned && this.entries.get(planned.repositoryId)
    this.planned.delete(changeId)
    if (!planned || !entry) return { applied: false, reason: t.changeGone }

    const result = await applyChangeSet(nodeFileSystem(entry.root), planned.changeSet)
    if (!result.applied) {
      const files = result.conflicts.join(', ')
      return {
        applied: false,
        reason: t.changedSincePreview(files)
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
    const [{ repository, components }, tree] = await Promise.all([
      openWithTraces(nodeFileSystem(entry.root)),
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
      ...(components && { components }),
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
