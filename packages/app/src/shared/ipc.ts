import type { Repository } from '@adr-tool/core'

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
  openExternal: 'shell:open-external'
} as const
