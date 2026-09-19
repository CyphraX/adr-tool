import type { Adr, DecisionLog, Problem, Status } from '@adr-tool/core'
import type { Decision, OpenRepository, PlannedChange } from '../../../shared/ipc'
import { prefixOf } from './wording'

/** One Status, or the ADRs whose Status could not be read, or no filter at all. */
export type StatusFilter = Status | 'unknown' | 'all'

interface Tab {
  repository: OpenRepository
  logPath: string | undefined
  statusFilter: StatusFilter
  selectedId: string | undefined
}

/** What the dialog shows after an action was asked for: the change to review, or why there is none. */
export type Review =
  | { kind: 'change'; title: string; action: string; change: PlannedChange; applying: boolean }
  | { kind: 'refused'; title: string; reason: string }

/** What a decision is called on its button, and again on the button that confirms it. */
export const DECISION_LABEL: Record<Decision, string> = {
  accept: 'Accept',
  reject: 'Reject',
  deprecate: 'Deprecate'
}

/** Everything the window shows: the open repositories as tabs, and per tab what is selected. */
class AppState {
  tabs = $state<Tab[]>([])
  activeId = $state<string | undefined>(undefined)
  ready = $state(false)
  review = $state<Review | undefined>(undefined)

  readonly active = $derived(this.tabs.find((tab) => tab.repository.id === this.activeId))

  /** The Decision Log in view: the selected one, or the first. */
  readonly log = $derived.by((): DecisionLog | undefined => {
    const logs = this.active?.repository.repository.logs ?? []
    return logs.find((log) => log.path === this.active?.logPath) ?? logs[0]
  })

  /** The ADRs of the log in view that pass the Status filter, newest first. */
  readonly adrs = $derived.by((): Adr[] => {
    const filter = this.active?.statusFilter ?? 'all'
    const matching = (this.log?.adrs ?? []).filter(
      (adr) => filter === 'all' || statusKey(adr) === filter
    )
    return matching.toReversed()
  })

  readonly selected = $derived(this.log?.adrs.find((adr) => adr.id === this.active?.selectedId))

  async start(): Promise<void> {
    window.api.onRepositoryChanged((repository) => this.replace(repository))
    const session = await window.api.restoreSession()
    this.tabs = session.repositories.map(newTab)
    this.activeId = session.activeId
    this.ready = true
  }

  async open(): Promise<void> {
    const repository = await window.api.openRepository()
    if (!repository) return
    if (!this.tabs.some((tab) => tab.repository.id === repository.id)) {
      this.tabs.push(newTab(repository))
    }
    this.activeId = repository.id
  }

  async close(id: string): Promise<void> {
    const position = this.tabs.findIndex((tab) => tab.repository.id === id)
    if (position === -1) return
    this.tabs.splice(position, 1)
    if (this.activeId === id) {
      this.activate((this.tabs[position] ?? this.tabs[position - 1])?.repository.id)
    }
    await window.api.closeRepository(id)
  }

  activate(id: string | undefined): void {
    this.activeId = id
    void window.api.setActiveRepository(id)
  }

  showLog(path: string): void {
    if (!this.active) return
    this.active.logPath = path
    this.active.selectedId = undefined
  }

  filterBy(filter: StatusFilter): void {
    if (this.active) this.active.statusFilter = filter
  }

  select(id: string): void {
    if (this.active) this.active.selectedId = id
  }

  /** Select an ADR of the log in view by its file name, as a link inside an ADR names it. */
  selectByFileName(fileName: string): boolean {
    const id = fileName.replace(/\.md$/i, '')
    const found = this.log?.adrs.some((adr) => adr.id === id) ?? false
    if (found) this.select(id)
    return found
  }

  /** Ask for a decision on the selected ADR. The main process plans it; nothing is written yet. */
  async decide(decision: Decision): Promise<void> {
    const [tab, log, adr] = [this.active, this.log, this.selected]
    if (!tab || !log || !adr) return
    const action = DECISION_LABEL[decision]
    const title = `${action} ADR ${prefixOf(adr)}`
    const plan = await window.api.planDecision(tab.repository.id, log.path, adr.id, decision)
    this.review = plan.ok
      ? { kind: 'change', title, action, change: plan.change, applying: false }
      : {
          kind: 'refused',
          title: `Cannot ${action.toLowerCase()} ADR ${prefixOf(adr)}`,
          reason: plan.reason
        }
  }

  async applyReview(): Promise<void> {
    const review = this.review
    if (review?.kind !== 'change' || review.applying) return
    review.applying = true
    const result = await window.api.applyChange(review.change.changeId)
    if (result.applied) {
      this.replace(result.repository)
      this.review = undefined
    } else {
      this.review = { kind: 'refused', title: 'The change was not written', reason: result.reason }
    }
  }

  dismissReview(): void {
    if (this.review?.kind === 'change') void window.api.discardChange(this.review.change.changeId)
    this.review = undefined
  }

  /** The files changed on disk: take the new reading, keep what the user was looking at. */
  private replace(repository: OpenRepository): void {
    const tab = this.tabs.find((candidate) => candidate.repository.id === repository.id)
    if (tab) tab.repository = repository
  }
}

function newTab(repository: OpenRepository): Tab {
  return { repository, logPath: undefined, statusFilter: 'all', selectedId: undefined }
}

export function statusKey(adr: Adr): Status | 'unknown' {
  return adr.metadata.status ?? 'unknown'
}

/** The Problems that name this ADR, whichever role it plays in them. */
export function problemsOf(log: DecisionLog, id: string): Problem[] {
  return log.problems.filter(
    (problem) =>
      ('adr' in problem && problem.adr === id) || ('adrs' in problem && problem.adrs.includes(id))
  )
}

export const app = new AppState()
