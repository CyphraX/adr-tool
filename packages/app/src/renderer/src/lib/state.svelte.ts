import type { Adr, DecisionLog, Problem, Status, TemplateInfo } from '@adr-tool/core'
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

/** What the dialog shows after an action was asked for. */
export type Review =
  /** A planned change to look at and confirm. */
  | { kind: 'change'; title: string; action: string; change: PlannedChange; applying: boolean }
  /** Why something cannot be done, or was not written. */
  | { kind: 'refused'; title: string; reason: string }
  /** A question before something is lost. */
  | { kind: 'confirm'; title: string; reason: string; action: string; proceed: () => void }

/** What a decision is called on its button, and again on the button that confirms it. */
export const DECISION_LABEL: Record<Decision, string> = {
  accept: 'Accept',
  reject: 'Reject',
  deprecate: 'Deprecate'
}

export type EditorMode = 'source' | 'split'

/**
 * The body of one ADR being edited. The editor has its own text; what is on disk reaches
 * it only when the author has nothing to lose, or says so.
 */
interface Editing {
  repositoryId: string
  logPath: string
  adrId: string
  /** The body the edit started from, exactly as it was read. Saving is planned against it. */
  base: string
  /** The editor's text. Line breaks are LF here; `core` gives each line the file's own again. */
  text: string
  mode: EditorMode
  /** What was corrected, for an ADR that is no longer proposed. */
  note: string
  /** The body on disk, when it changed while the author has unsaved text. */
  changedOnDisk: string | undefined
  /** The ADR's file is gone. */
  missing: boolean
}

/** A new ADR being described in the dialog. */
interface Creating {
  repositoryId: string
  title: string
  template: string
  templates: readonly TemplateInfo[]
  /** Set when the new ADR is written to supersede or amend the selected one. */
  relation: { type: 'supersedes' | 'amends'; target: string } | undefined
}

const withLf = (text: string): string => text.replaceAll('\r\n', '\n')

/** Everything the window shows: the open repositories as tabs, and per tab what is selected. */
class AppState {
  tabs = $state<Tab[]>([])
  activeId = $state<string | undefined>(undefined)
  ready = $state(false)
  review = $state<Review | undefined>(undefined)
  editing = $state<Editing | undefined>(undefined)
  creating = $state<Creating | undefined>(undefined)

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

  /** Whether the editor holds text that is not on disk. */
  readonly dirty = $derived(
    this.editing !== undefined && this.editing.text !== withLf(this.editing.base)
  )

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
    this.leaveEditor(() => {
      if (!this.tabs.some((tab) => tab.repository.id === repository.id)) {
        this.tabs.push(newTab(repository))
      }
      this.activeId = repository.id
    })
  }

  close(id: string): void {
    const closes = (): void => {
      const position = this.tabs.findIndex((tab) => tab.repository.id === id)
      if (position === -1) return
      this.tabs.splice(position, 1)
      if (this.activeId === id) {
        this.activate((this.tabs[position] ?? this.tabs[position - 1])?.repository.id)
      }
      void window.api.closeRepository(id)
    }
    if (this.editing?.repositoryId === id) this.leaveEditor(closes)
    else closes()
  }

  activate(id: string | undefined): void {
    if (id === this.activeId) return
    this.leaveEditor(() => {
      this.activeId = id
      void window.api.setActiveRepository(id)
    })
  }

  showLog(path: string): void {
    if (path === this.log?.path) return
    this.leaveEditor(() => {
      if (!this.active) return
      this.active.logPath = path
      this.active.selectedId = undefined
    })
  }

  filterBy(filter: StatusFilter): void {
    if (this.active) this.active.statusFilter = filter
  }

  select(id: string): void {
    if (id === this.active?.selectedId) return
    this.leaveEditor(() => {
      if (this.active) this.active.selectedId = id
    })
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

  /** Open the dialog for a new ADR; with a Relation, one that supersedes or amends the selected ADR. */
  startCreating(type?: 'supersedes' | 'amends'): void {
    const tab = this.active
    if (!tab) return
    const target = this.selected?.id
    this.leaveEditor(async () => {
      const { templates, defaultName } = await window.api.listTemplates(tab.repository.id)
      this.creating = {
        repositoryId: tab.repository.id,
        title: '',
        template: defaultName,
        templates,
        relation: type && target ? { type, target } : undefined
      }
    })
  }

  cancelCreating(): void {
    this.creating = undefined
  }

  /** Plan the new ADR. The preview shows the whole file before it is written. */
  async create(): Promise<void> {
    const creating = this.creating
    if (!creating || creating.title.trim() === '') return
    const plan = await window.api.planCreate({
      repositoryId: creating.repositoryId,
      logPath: this.log?.path,
      title: creating.title,
      template: creating.template,
      // A reactive proxy cannot cross the process boundary; send a plain copy.
      ...(creating.relation && { relation: $state.snapshot(creating.relation) })
    })
    this.creating = undefined
    this.review = plan.ok
      ? {
          kind: 'change',
          title: 'Create the ADR',
          action: 'Create',
          change: plan.change,
          applying: false
        }
      : { kind: 'refused', title: 'The ADR cannot be created', reason: plan.reason }
  }

  /** Start editing the body of the selected ADR. */
  edit(): void {
    const [tab, log, adr] = [this.active, this.log, this.selected]
    if (!tab || !log || !adr) return
    this.editing = {
      repositoryId: tab.repository.id,
      logPath: log.path,
      adrId: adr.id,
      base: adr.body,
      text: withLf(adr.body),
      mode: this.editing?.mode ?? 'source',
      note: '',
      changedOnDisk: undefined,
      missing: false
    }
  }

  /** Plan saving the editor's text. The main process hands back the change to review. */
  async save(): Promise<void> {
    const editing = this.editing
    const adr = this.selected
    if (!editing || !adr || !this.dirty || editing.changedOnDisk !== undefined) return
    const plan = await window.api.planBodyEdit({
      repositoryId: editing.repositoryId,
      logPath: editing.logPath,
      adrId: editing.adrId,
      base: editing.base,
      body: editing.text,
      note: editing.note
    })
    this.review = plan.ok
      ? {
          kind: 'change',
          title: `Save ADR ${prefixOf(adr)}`,
          action: 'Save',
          change: plan.change,
          applying: false
        }
      : { kind: 'refused', title: `Cannot save ADR ${prefixOf(adr)}`, reason: plan.reason }
  }

  /** Leave the editor without saving; asks first when there is text to lose. */
  discardEdit(): void {
    this.leaveEditor(() => {})
  }

  /** The file changed on disk while the author has unsaved text: they keep theirs … */
  keepMine(): void {
    const editing = this.editing
    if (editing?.changedOnDisk === undefined) return
    editing.base = editing.changedOnDisk
    editing.changedOnDisk = undefined
  }

  /** … or take what is on disk. */
  loadFromDisk(): void {
    const editing = this.editing
    if (editing?.changedOnDisk === undefined) return
    editing.base = editing.changedOnDisk
    editing.text = withLf(editing.changedOnDisk)
    editing.changedOnDisk = undefined
  }

  async applyReview(): Promise<void> {
    const review = this.review
    if (review?.kind !== 'change' || review.applying) return
    review.applying = true
    const result = await window.api.applyChange(review.change.changeId)
    if (result.applied) {
      // What was saved is on disk now; the editor has nothing left to lose.
      if (review.action === 'Save') this.editing = undefined
      this.replace(result.repository)
      this.review = undefined
      // A new ADR is an empty Template until somebody writes it: go straight to its body.
      const createdId = review.change.createdId
      if (createdId !== undefined && this.active) {
        this.active.statusFilter = 'all'
        this.active.selectedId = createdId
        this.edit()
      }
    } else {
      this.review = { kind: 'refused', title: 'The change was not written', reason: result.reason }
    }
  }

  confirmReview(): void {
    const review = this.review
    if (review?.kind !== 'confirm') return
    this.review = undefined
    review.proceed()
  }

  dismissReview(): void {
    if (this.review?.kind === 'change') void window.api.discardChange(this.review.change.changeId)
    this.review = undefined
  }

  /** Do something that takes the editor away. With unsaved text the author is asked first. */
  private leaveEditor(then: () => void): void {
    const proceed = (): void => {
      this.editing = undefined
      then()
    }
    if (!this.dirty) return proceed()
    this.review = {
      kind: 'confirm',
      title: 'Discard your changes?',
      reason: 'The text in the editor has not been saved. Leaving the editor now loses it.',
      action: 'Discard changes',
      proceed
    }
  }

  /** The files changed on disk: take the new reading, keep what the user was looking at. */
  private replace(repository: OpenRepository): void {
    const tab = this.tabs.find((candidate) => candidate.repository.id === repository.id)
    if (!tab) return
    tab.repository = repository

    const editing = this.editing
    if (editing?.repositoryId !== repository.id) return
    const onDisk = repository.repository.logs
      .find((log) => log.path === editing.logPath)
      ?.adrs.find((adr) => adr.id === editing.adrId)?.body
    editing.missing = onDisk === undefined
    if (onDisk === undefined || onDisk === editing.base) return
    if (this.dirty) {
      // Never overwrite what the author typed. They decide: keep theirs, or load the file.
      editing.changedOnDisk = onDisk
    } else {
      editing.base = onDisk
      editing.text = withLf(onDisk)
    }
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
