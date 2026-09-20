import type {
  ChangeSet,
  Correction,
  FileChange,
  RelationType,
  Repair,
  Repository,
  Templates
} from '@adr-tool/core'

/**
 * The contract between the main process and the sandboxed renderer.
 *
 * The renderer never names a file or a directory. A repository the user opened gets an
 * `id` from the main process, and everything after that refers to the id.
 */
export interface OpenRepository {
  readonly id: string
  /** The directory the user opened, for display only. */
  readonly root: string
  /** The last part of `root`: the label of the repository's tab. */
  readonly name: string
  readonly repository: Repository
  /** What git says about the directory. Absent without git, or outside a git repository. */
  readonly git?: GitState
}

export interface GitState {
  /** The branch that is checked out; `undefined` on a detached HEAD. */
  readonly branch: string | undefined
  /** The ADR files with uncommitted changes, new ones included, as `Adr.path` names them. Sorted. */
  readonly changed: readonly string[]
}

/** What is on disk and not committed yet, as an entry of a file's history. */
export const WORKING_TREE = 'working-tree'

/** One step in the history of one ADR: a commit, or what is not committed yet. */
export interface HistoryEntry {
  /** The commit's hash, or `WORKING_TREE`. */
  readonly id: string
  readonly subject: string
  readonly author?: string
  /** The author date, ISO 8601. */
  readonly date?: string
  /** The file's name before this commit, when the commit renamed it: a Renumber. */
  readonly renamedFrom?: string
  /** The Corrections the file records at this point. The oldest entry that has one recorded it. */
  readonly corrections: readonly Correction[]
}

export interface Session {
  readonly repositories: readonly OpenRepository[]
  readonly activeId?: string
}

/** The operations that decide an ADR or end its life. Each of them only changes Metadata. */
export type Decision = 'accept' | 'reject' | 'deprecate'

/**
 * A change the main process has planned and is holding. The renderer shows it and then
 * applies or discards it by its id — it never sends text or paths back, so it cannot
 * make the main process write anything `core` did not plan.
 */
export interface PlannedChange {
  readonly changeId: string
  readonly changeSet: ChangeSet
  /** What the person should look at before confirming. */
  readonly warnings: readonly string[]
  /** The ID of the ADR the change creates. */
  readonly createdId?: string
  /** The new ID of the ADR the change renumbers. */
  readonly renamedId?: string
}

/** A new ADR as the dialog describes it. Its ID and path are `core`'s business. */
export interface CreateRequest {
  readonly repositoryId: string
  /** The Decision Log to create it in; `undefined` in a repository that has none yet. */
  readonly logPath: string | undefined
  readonly title: string
  readonly template: string
  readonly relation?: { readonly type: 'supersedes' | 'amends'; readonly target: string }
}

/**
 * An edit of an ADR's body as the editor hands it over. This text is input to planning:
 * `core` turns it into a change set, and only that is ever written.
 */
export interface BodyEditRequest {
  readonly repositoryId: string
  readonly logPath: string
  readonly adrId: string
  /** The body the edit started from, exactly as it was received. */
  readonly base: string
  readonly body: string
  /** What was corrected. Only used when the ADR is no longer proposed. */
  readonly note: string
}

/**
 * The lists of an ADR's Metadata as the dialog leaves them. `core` works out which items
 * were added and which removed, and only those reach the file.
 */
export interface MetadataEditRequest {
  readonly repositoryId: string
  readonly logPath: string
  readonly adrId: string
  readonly decisionMakers: readonly string[]
  readonly tags: readonly string[]
  readonly relations: Readonly<Record<RelationType, readonly string[]>>
}

/** One of the repairs `core` offers for a Problem of the log. `core` checks that it still does. */
export interface RepairRequest {
  readonly repositoryId: string
  readonly logPath: string
  readonly repair: Repair
}

/** Migration of one ADR in a foreign format, or of every such ADR of the log when `adrId` is left out. */
export interface MigrationRequest {
  readonly repositoryId: string
  readonly logPath: string
  readonly adrId?: string
}

export type PlanResult =
  | { readonly ok: true; readonly change: PlannedChange }
  | { readonly ok: false; readonly reason: string }

export type ApplyResult =
  | { readonly applied: true; readonly repository: OpenRepository }
  | { readonly applied: false; readonly reason: string }

export interface Api {
  /** `win32`, `darwin` or `linux`. */
  readonly platform: string
  /** Reopen what was open when the app was last closed. */
  restoreSession(): Promise<Session>
  /** Let the user pick a directory and open it. `undefined` when they cancel. */
  openRepository(): Promise<OpenRepository | undefined>
  closeRepository(id: string): Promise<void>
  /** Remember which tab is in front, for the next start. */
  setActiveRepository(id: string | undefined): Promise<void>
  /** Plan a decision on an ADR. Nothing is written until the change is applied. */
  planDecision(
    repositoryId: string,
    logPath: string,
    adrId: string,
    decision: Decision
  ): Promise<PlanResult>
  /** The Templates a new ADR of this repository can start from. */
  listTemplates(repositoryId: string): Promise<Templates>
  /** Plan a new ADR. Nothing is written until the change is applied. */
  planCreate(request: CreateRequest): Promise<PlanResult>
  /** Plan saving an edited body. Nothing is written until the change is applied. */
  planBodyEdit(request: BodyEditRequest): Promise<PlanResult>
  /** Plan the repair of a Problem; a Renumber is one. Nothing is written until the change is applied. */
  planRepair(request: RepairRequest): Promise<PlanResult>
  planMigration(request: MigrationRequest): Promise<PlanResult>
  /** Plan an edit of the Metadata lists. Nothing is written until the change is applied. */
  planMetadataEdit(request: MetadataEditRequest): Promise<PlanResult>
  /** The history of an ADR's file, newest first, through renames. Empty without git. */
  history(repositoryId: string, logPath: string, adrId: string): Promise<readonly HistoryEntry[]>
  /** What one entry of that history did to the file. */
  historyChange(
    repositoryId: string,
    logPath: string,
    adrId: string,
    entryId: string
  ): Promise<FileChange | undefined>
  /** Write a planned change, unless a file it touches changed on disk in the meantime. */
  applyChange(changeId: string): Promise<ApplyResult>
  discardChange(changeId: string): Promise<void>
  /** Open a web link in the system browser. Anything but http and https is ignored. */
  openExternal(url: string): Promise<void>
  /** Called whenever files of an open repository changed on disk. Returns a function that stops listening. */
  onRepositoryChanged(listener: (repository: OpenRepository) => void): () => void
  /** Say whether the window holds text that is not on disk. While it does, closing it asks first. */
  setUnsaved(unsaved: boolean): Promise<void>
  /** Called when the window is to close while it holds unsaved text. Nothing closes until `closeWindow`. */
  onCloseRequested(listener: () => void): () => void
  /** Close the window, whatever it holds: the person was asked, or there was nothing to ask about. */
  closeWindow(): Promise<void>
}

export const CHANNEL = {
  restoreSession: 'session:restore',
  openRepository: 'repository:open',
  closeRepository: 'repository:close',
  setActiveRepository: 'repository:set-active',
  repositoryChanged: 'repository:changed',
  planDecision: 'change:plan-decision',
  planBodyEdit: 'change:plan-body-edit',
  planMetadataEdit: 'change:plan-metadata-edit',
  planRepair: 'change:plan-repair',
  planMigration: 'change:plan-migration',
  planCreate: 'change:plan-create',
  listTemplates: 'templates:list',
  history: 'git:history',
  historyChange: 'git:history-change',
  applyChange: 'change:apply',
  discardChange: 'change:discard',
  openExternal: 'shell:open-external',
  setUnsaved: 'window:set-unsaved',
  closeRequested: 'window:close-requested',
  closeWindow: 'window:close'
} as const
