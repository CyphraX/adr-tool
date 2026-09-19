import type { ChangeSet, Repository } from '@adr-tool/core'

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
  /** Plan saving an edited body. Nothing is written until the change is applied. */
  planBodyEdit(request: BodyEditRequest): Promise<PlanResult>
  /** Write a planned change, unless a file it touches changed on disk in the meantime. */
  applyChange(changeId: string): Promise<ApplyResult>
  discardChange(changeId: string): Promise<void>
  /** Open a web link in the system browser. Anything but http and https is ignored. */
  openExternal(url: string): Promise<void>
  /** Called whenever files of an open repository changed on disk. Returns a function that stops listening. */
  onRepositoryChanged(listener: (repository: OpenRepository) => void): () => void
}

export const CHANNEL = {
  restoreSession: 'session:restore',
  openRepository: 'repository:open',
  closeRepository: 'repository:close',
  setActiveRepository: 'repository:set-active',
  repositoryChanged: 'repository:changed',
  planDecision: 'change:plan-decision',
  planBodyEdit: 'change:plan-body-edit',
  applyChange: 'change:apply',
  discardChange: 'change:discard',
  openExternal: 'shell:open-external'
} as const
