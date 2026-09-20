import {
  RELATION_TYPES,
  groupProblems,
  type Adr,
  type DecisionLog,
  type FileChange,
  type RelationType,
  type Repair,
  type Status,
  type TemplateInfo
} from '@adr-tool/core'
import type { Decision, HistoryEntry, OpenRepository, PlannedChange } from '../../../shared/ipc'
import { recordedIn } from './history'
import { t } from './strings'
import { logName, prefixOf } from './wording'

/** One Status, or the ADRs whose Status could not be read, or no filter at all. */
export type StatusFilter = Status | 'unknown' | 'all'

/** What the middle pane shows of the log in view: its ADRs, their Relations as a graph, or its Problems. */
export type MiddleView = 'adrs' | 'graph' | 'problems'

interface Tab {
  repository: OpenRepository
  logPath: string | undefined
  view: MiddleView
  statusFilter: StatusFilter
  selectedId: string | undefined
}

/** What the dialog shows after an action was asked for. */
export type Review =
  /** A planned change to look at and confirm. */
  | {
      kind: 'change'
      title: string
      action: string
      change: PlannedChange
      applying: boolean
      /** The change writes what the editor or the Metadata dialog holds; applied, they close. */
      saves?: boolean
      /** How the warnings of the change are introduced, and what to do about them. */
      caution?: Caution
    }
  /** Why something cannot be done, or was not written. */
  | { kind: 'refused'; title: string; reason: string }
  /** A question before something is lost. */
  | {
      kind: 'confirm'
      title: string
      reason: string
      action: string
      proceed: () => void
      /** Whoever asked may want to know that the answer was no. */
      declined?: () => void
    }

export interface Caution {
  lead: string
  advice: string
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

/** The history of one ADR's file, as git has it, and the entry being looked at. */
interface History {
  adrId: string
  title: string
  /** `undefined` while git is being asked. */
  entries: readonly HistoryEntry[] | undefined
  selectedId: string | undefined
  /** `undefined` while it is being read; `null` when git could not say. */
  change: FileChange | null | undefined
  /** Set when the history was opened from a Correction that no entry recorded. */
  notFound: boolean
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

/** The lists of an ADR's Metadata that a person maintains. */
export interface MetadataLists {
  decisionMakers: string[]
  tags: string[]
  relations: Record<RelationType, string[]>
}

/**
 * The Metadata lists of one ADR being edited in the dialog. `base` is what the file said when
 * the dialog last looked; the difference between the two is what the author wants changed.
 */
interface EditingMetadata extends MetadataLists {
  repositoryId: string
  logPath: string
  adrId: string
  base: MetadataLists
}

function listsOf(adr: Adr): MetadataLists {
  return {
    decisionMakers: [...adr.metadata.decisionMakers],
    tags: [...adr.metadata.tags],
    relations: Object.fromEntries(
      RELATION_TYPES.map((type) => [type, [...adr.metadata.relations[type]]])
    ) as Record<RelationType, string[]>
  }
}

/** Every list of the two, side by side. */
function pairs(a: MetadataLists, b: MetadataLists): [string[], string[]][] {
  return [
    [a.decisionMakers, b.decisionMakers],
    [a.tags, b.tags],
    ...RELATION_TYPES.map((type): [string[], string[]] => [a.relations[type], b.relations[type]])
  ]
}

/** Lists are sets here: the order of a list is the file's business. */
const sameItems = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((item) => b.includes(item))

const withLf = (text: string): string => text.replaceAll('\r\n', '\n')

/** Everything the window shows: the open repositories as tabs, and per tab what is selected. */
class AppState {
  tabs = $state<Tab[]>([])
  activeId = $state<string | undefined>(undefined)
  ready = $state(false)
  review = $state<Review | undefined>(undefined)
  editing = $state<Editing | undefined>(undefined)
  creating = $state<Creating | undefined>(undefined)
  editingMetadata = $state<EditingMetadata | undefined>(undefined)
  history = $state<History | undefined>(undefined)
  /** The search palette, while it is open. */
  searching = $state<{ query: string } | undefined>(undefined)

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

  /** The Problems of the log in view: each root cause once, with what follows from it. */
  readonly problemGroups = $derived(this.log ? groupProblems(this.log) : [])

  /** Whether the editor holds text that is not on disk. */
  readonly dirty = $derived(
    this.editing !== undefined && this.editing.text !== withLf(this.editing.base)
  )

  /** Whether the Metadata dialog asks for anything the file does not say already. */
  readonly metadataDirty = $derived(
    this.editingMetadata !== undefined &&
      pairs(this.editingMetadata, this.editingMetadata.base).some(
        ([now, was]) => !sameItems(now, was)
      )
  )

  async start(): Promise<void> {
    window.api.onRepositoryChanged((repository) => this.replace(repository))
    window.api.onCloseRequested(() => this.requestClose())
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

  /** Filtering is about ADRs: it leads back to their list. */
  filterBy(filter: StatusFilter): void {
    if (!this.active) return
    this.active.statusFilter = filter
    this.active.view = 'adrs'
  }

  show(view: MiddleView): void {
    if (this.active) this.active.view = view
  }

  select(id: string): void {
    if (id === this.active?.selectedId) return
    this.leaveEditor(() => {
      if (this.active) this.active.selectedId = id
    })
  }

  startSearching(): void {
    if (this.active) this.searching = { query: '' }
  }

  stopSearching(): void {
    this.searching = undefined
  }

  /** Go to an ADR of any Decision Log of the repository in front, from wherever the view is. */
  jumpTo(logPath: string, id: string): void {
    this.searching = undefined
    const arrive = (): void => {
      const tab = this.active
      if (!tab) return
      tab.logPath = logPath
      tab.selectedId = id
      // What is in the middle has to show where the jump went: the graph does if it draws
      // the ADR, the list does unless a filter hides it.
      const drawn = this.log?.relations.some(({ from, to }) => from === id || to === id)
      if (!(tab.view === 'graph' && drawn)) tab.view = 'adrs'
      const adr = this.log?.adrs.find((candidate) => candidate.id === id)
      if (adr && tab.statusFilter !== 'all' && statusKey(adr) !== tab.statusFilter) {
        tab.statusFilter = 'all'
      }
    }
    // The ADR that is open already stays open, editor and all; only the list follows.
    if (logPath === this.log?.path && id === this.active?.selectedId) arrive()
    else this.leaveEditor(arrive)
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
    const texts = t.review.decision[decision]
    const title = texts.title(prefixOf(adr))
    const plan = await window.api.planDecision(tab.repository.id, log.path, adr.id, decision)
    this.review = plan.ok
      ? { kind: 'change', title, action: texts.action, change: plan.change, applying: false }
      : { kind: 'refused', title: texts.refused(prefixOf(adr)), reason: plan.reason }
  }

  /**
   * Open the history of the selected ADR; from the marker of a Correction — its position
   * in the ADR's list — at the entry that recorded it.
   */
  async showHistory(correction?: number): Promise<void> {
    const [tab, log, adr] = [this.active, this.log, this.selected]
    if (!tab || !log || !adr) return
    const history: History = {
      adrId: adr.id,
      title: t.history.title(prefixOf(adr)),
      entries: undefined,
      selectedId: undefined,
      change: undefined,
      notFound: false
    }
    this.history = history
    const entries = await window.api.history(tab.repository.id, log.path, adr.id)
    // The dialog may have been closed, or opened for another ADR, in the meantime.
    if (this.history?.adrId !== adr.id) return
    const recorded =
      correction === undefined
        ? undefined
        : recordedIn(entries, adr.metadata.corrections, correction)
    this.history.entries = entries
    this.history.notFound = correction !== undefined && !recorded
    await this.showHistoryEntry((recorded ?? entries[0])?.id)
  }

  async showHistoryEntry(id: string | undefined): Promise<void> {
    const [tab, log, history] = [this.active, this.log, this.history]
    if (!tab || !log || !history || id === undefined) return
    history.selectedId = id
    history.change = undefined
    const change = await window.api
      .historyChange(tab.repository.id, log.path, history.adrId, id)
      .catch(() => undefined)
    if (this.history?.adrId === history.adrId && this.history.selectedId === id) {
      this.history.change = change ?? null
    }
  }

  closeHistory(): void {
    this.history = undefined
  }

  /** Ask for one of the repairs of a Problem. The main process plans it; nothing is written yet. */
  async repair(repair: Repair): Promise<void> {
    const [tab, log] = [this.active, this.log]
    const adr = log?.adrs.find((candidate) => candidate.id === repair.adr)
    if (!tab || !log || !adr) return
    // A Renumber is known by its own name, and warns about something else.
    const texts = repair.kind === 'renumber' ? t.review.renumber : t.review.repair
    const plan = await window.api.planRepair({
      repositoryId: tab.repository.id,
      logPath: log.path,
      repair
    })
    this.review = plan.ok
      ? {
          kind: 'change',
          title: texts.title(prefixOf(adr)),
          action: texts.action,
          change: plan.change,
          applying: false,
          caution: texts.caution
        }
      : { kind: 'refused', title: texts.refused(prefixOf(adr)), reason: plan.reason }
  }

  /** Plan the Migration of the selected ADR, or of every foreign ADR of the Decision Log in view. */
  async migrate(scope: 'adr' | 'log'): Promise<void> {
    const [tab, log, adr] = [this.active, this.log, this.selected]
    if (!tab || !log || (scope === 'adr' && !adr)) return
    const texts = t.review.migrate
    const where = logName(log.path)
    const [title, refused] =
      scope === 'adr'
        ? [texts.adr(prefixOf(adr!)), texts.adrRefused(prefixOf(adr!))]
        : [texts.log(where), texts.logRefused(where)]
    const plan = await window.api.planMigration({
      repositoryId: tab.repository.id,
      logPath: log.path,
      ...(scope === 'adr' && { adrId: adr!.id })
    })
    this.review = plan.ok
      ? {
          kind: 'change',
          title,
          action: texts.action,
          change: plan.change,
          applying: false,
          caution: texts.caution
        }
      : { kind: 'refused', title: refused, reason: plan.reason }
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
          title: t.review.create.title,
          action: t.review.create.action,
          change: plan.change,
          applying: false
        }
      : { kind: 'refused', title: t.review.create.refused, reason: plan.reason }
  }

  /** Open the dialog for the Metadata lists of the selected ADR. */
  editMetadata(): void {
    const [tab, log, adr] = [this.active, this.log, this.selected]
    if (!tab || !log || !adr || adr.foreign) return
    if (!adr.metadataWritable) {
      this.review = {
        kind: 'refused',
        title: t.review.metadata.unreadable(prefixOf(adr)),
        reason: t.review.metadata.unreadableReason(adr.id)
      }
      return
    }
    this.editingMetadata = {
      repositoryId: tab.repository.id,
      logPath: log.path,
      adrId: adr.id,
      ...listsOf(adr),
      base: listsOf(adr)
    }
  }

  cancelEditingMetadata(): void {
    this.editingMetadata = undefined
  }

  /** Plan the edit. The dialog stays open underneath: cancelling the preview leads back to it. */
  async saveMetadata(): Promise<void> {
    const editing = this.editingMetadata
    const adr = this.selected
    if (!editing || !adr || !this.metadataDirty) return
    // A reactive proxy cannot cross the process boundary; send a plain copy.
    const { repositoryId, logPath, adrId, decisionMakers, tags, relations } =
      $state.snapshot(editing)
    const plan = await window.api.planMetadataEdit({
      repositoryId,
      logPath,
      adrId,
      decisionMakers,
      tags,
      relations
    })
    this.review = plan.ok
      ? {
          kind: 'change',
          title: t.review.metadata.title(prefixOf(adr)),
          action: t.save,
          change: plan.change,
          applying: false,
          saves: true
        }
      : { kind: 'refused', title: t.review.metadata.refused(prefixOf(adr)), reason: plan.reason }
  }

  /** Start editing the body of the selected ADR. */
  edit(): void {
    const [tab, log, adr] = [this.active, this.log, this.selected]
    if (!tab || !log || !adr || adr.foreign) return
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
          title: t.review.body.title(prefixOf(adr)),
          action: t.save,
          change: plan.change,
          applying: false,
          saves: true,
          caution: t.review.body.caution
        }
      : { kind: 'refused', title: t.review.body.refused(prefixOf(adr)), reason: plan.reason }
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
      // What was saved is on disk now; the editor and the Metadata dialog have nothing left to lose.
      if (review.saves) {
        this.editing = undefined
        this.editingMetadata = undefined
      }
      this.replace(result.repository)
      this.review = undefined
      // A renumbered ADR has a new ID: stay with it.
      const renamedId = review.change.renamedId
      if (renamedId !== undefined && this.active) this.active.selectedId = renamedId
      // A new ADR is an empty Template until somebody writes it: go straight to its body.
      const createdId = review.change.createdId
      if (createdId !== undefined && this.active) {
        this.active.statusFilter = 'all'
        this.active.selectedId = createdId
        this.edit()
      }
    } else {
      this.review = { kind: 'refused', title: t.review.notWritten, reason: result.reason }
    }
  }

  confirmReview(): void {
    const review = this.review
    if (review?.kind !== 'confirm') return
    this.review = undefined
    review.proceed()
  }

  dismissReview(): void {
    const review = this.review
    if (review?.kind === 'change') void window.api.discardChange(review.change.changeId)
    this.review = undefined
    if (review?.kind === 'confirm') review.declined?.()
  }

  /**
   * The window is to close while the editor holds unsaved text. A change that was being
   * looked at is not applied; the question takes its place.
   */
  private requestClose(): void {
    this.dismissReview()
    this.leaveEditor(
      () => void window.api.answerCloseRequest(true),
      () => void window.api.answerCloseRequest(false)
    )
  }

  /** Do something that takes the editor away. With unsaved text the author is asked first. */
  private leaveEditor(then: () => void, declined?: () => void): void {
    const proceed = (): void => {
      this.editing = undefined
      then()
    }
    if (!this.dirty) return proceed()
    this.review = {
      kind: 'confirm',
      title: t.review.discard.title,
      reason: t.review.discard.reason,
      action: t.review.discard.action,
      proceed,
      ...(declined && { declined })
    }
  }

  /**
   * The ADR changed on disk while its Metadata dialog is open: what the author added and
   * removed so far is carried over to the lists as they are now.
   */
  private rebaseMetadata(repository: OpenRepository): void {
    const editing = this.editingMetadata
    if (editing?.repositoryId !== repository.id) return
    const adr = repository.repository.logs
      .find((log) => log.path === editing.logPath)
      ?.adrs.find((candidate) => candidate.id === editing.adrId)
    if (!adr) {
      this.editingMetadata = undefined
      return
    }
    const onDisk = listsOf(adr)
    if (pairs(onDisk, editing.base).every(([now, was]) => sameItems(now, was))) return
    editing.decisionMakers = rebase(
      editing.decisionMakers,
      editing.base.decisionMakers,
      onDisk.decisionMakers
    )
    editing.tags = rebase(editing.tags, editing.base.tags, onDisk.tags)
    for (const type of RELATION_TYPES) {
      editing.relations[type] = rebase(
        editing.relations[type],
        editing.base.relations[type],
        onDisk.relations[type]
      )
    }
    editing.base = onDisk
  }

  /** The files changed on disk: take the new reading, keep what the user was looking at. */
  private replace(repository: OpenRepository): void {
    const tab = this.tabs.find((candidate) => candidate.repository.id === repository.id)
    if (!tab) return
    tab.repository = repository
    this.rebaseMetadata(repository)

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

function rebase(now: string[], was: string[], onDisk: string[]): string[] {
  const added = now.filter((item) => !was.includes(item))
  const kept = onDisk.filter((item) => !was.includes(item) || now.includes(item))
  return [...kept, ...added.filter((item) => !kept.includes(item))]
}

function newTab(repository: OpenRepository): Tab {
  return {
    repository,
    logPath: undefined,
    view: 'adrs',
    statusFilter: 'all',
    selectedId: undefined
  }
}

export function statusKey(adr: Adr): Status | 'unknown' {
  return adr.metadata.status ?? 'unknown'
}

export const app = new AppState()
