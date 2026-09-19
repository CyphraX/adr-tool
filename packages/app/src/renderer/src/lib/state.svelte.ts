import {
  RELATION_TYPES,
  groupProblems,
  type Adr,
  type DecisionLog,
  type RelationType,
  type Repair,
  type Status,
  type TemplateInfo
} from '@adr-tool/core'
import type { Decision, OpenRepository, PlannedChange } from '../../../shared/ipc'
import { prefixOf } from './wording'

/** One Status, or the ADRs whose Status could not be read, or no filter at all. */
export type StatusFilter = Status | 'unknown' | 'all'

/** What the middle pane lists: the ADRs of the log in view, or its Problems. */
export type ListView = 'adrs' | 'problems'

interface Tab {
  repository: OpenRepository
  logPath: string | undefined
  view: ListView
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
      /** How the warnings of the change are introduced, and what to do about them. */
      caution?: Caution
    }
  /** Why something cannot be done, or was not written. */
  | { kind: 'refused'; title: string; reason: string }
  /** A question before something is lost. */
  | { kind: 'confirm'; title: string; reason: string; action: string; proceed: () => void }

export interface Caution {
  lead: string
  advice: string
}

const MORE_THAN_A_CORRECTION: Caution = {
  lead: 'This looks like more than a Correction:',
  advice:
    'If it changes what was decided, cancel and write a new ADR that amends or supersedes this one. If it does not, save.'
}

const TEXT_STAYS: Caution = {
  lead: 'The tool does not change the text of an ADR:',
  advice:
    'A link in the text that points to the old file name has to be changed by hand, after the Renumber.'
}

const RELATION_IS_AUTHORITATIVE: Caution = {
  lead: 'Before you repair:',
  advice:
    'A Repair takes what the ADRs say in supersedes and amends as true. If that is what is wrong, cancel and fix the file by hand.'
}

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

  show(view: ListView): void {
    if (this.active) this.active.view = view
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

  /** Ask for one of the repairs of a Problem. The main process plans it; nothing is written yet. */
  async repair(repair: Repair): Promise<void> {
    const [tab, log] = [this.active, this.log]
    const adr = log?.adrs.find((candidate) => candidate.id === repair.adr)
    if (!tab || !log || !adr) return
    // A Renumber is known by its own name, and warns about something else.
    const [verb, caution] =
      repair.kind === 'renumber'
        ? (['Renumber', TEXT_STAYS] as const)
        : (['Repair', RELATION_IS_AUTHORITATIVE] as const)
    const plan = await window.api.planRepair({
      repositoryId: tab.repository.id,
      logPath: log.path,
      repair
    })
    this.review = plan.ok
      ? {
          kind: 'change',
          title: `${verb} ADR ${prefixOf(adr)}`,
          action: verb,
          change: plan.change,
          applying: false,
          caution
        }
      : {
          kind: 'refused',
          title: `Cannot ${verb.toLowerCase()} ADR ${prefixOf(adr)}`,
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

  /** Open the dialog for the Metadata lists of the selected ADR. */
  editMetadata(): void {
    const [tab, log, adr] = [this.active, this.log, this.selected]
    if (!tab || !log || !adr) return
    if (!adr.metadataWritable) {
      this.review = {
        kind: 'refused',
        title: `Cannot edit the Metadata of ADR ${prefixOf(adr)}`,
        reason: `The frontmatter of ${adr.id} cannot be read. Fix it before the tool writes to it.`
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
          title: `Change the Metadata of ADR ${prefixOf(adr)}`,
          action: 'Save',
          change: plan.change,
          applying: false
        }
      : {
          kind: 'refused',
          title: `Cannot change the Metadata of ADR ${prefixOf(adr)}`,
          reason: plan.reason
        }
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
          applying: false,
          caution: MORE_THAN_A_CORRECTION
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
      // What was saved is on disk now; the editor and the Metadata dialog have nothing left to lose.
      if (review.action === 'Save') {
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
