import {
  RELATION_TYPES,
  groupProblems,
  mermaidSources,
  type Adr,
  type DecisionLog,
  type FileChange,
  type RelationType,
  type Repair,
  type Status,
  type TemplateInfo
} from '@adr-tool/core'
import type { StructureProblem } from '@adr-tool/structure/model'
import type {
  BranchOverview,
  CommitPlan,
  Decision,
  ExportKind,
  HistoryEntry,
  OpenRepository,
  PlannedChange,
  SourceFileText,
  StructureOutline,
  StructureView
} from '../../../shared/ipc'
import type { Language } from '../../../shared/language'
import { drawnForExport } from './diagrams'
import { followHistory, recordedIn } from './history'
import { chooseLanguage } from './language'
import type { Module } from './modules'
import { repositoryProblems } from './repository-problems'
import { wordOf } from './said'
import { t } from './strings'
import { logName, prefixOf } from './wording'
import { outsideRelations } from './together'
import { moveOf, type StatusKey } from './views'

/** One Status, or the ADRs whose Status could not be read, or no filter at all. */
export type StatusFilter = Status | 'unknown' | 'all'

/**
 * What the middle pane shows of the log in view: its ADRs, their Relations as a graph, its
 * Problems — or what other branches do to the ADRs of every log.
 */
export type MiddleView =
  | 'adrs'
  | 'graph'
  | 'timeline'
  | 'board'
  | 'dashboard'
  | 'problems'
  | 'branches'
  /** Every ADR of every open repository, and every Problem (docs/plan-roadmap.md, part 13). */
  | 'all-adrs'
  | 'all-problems'
  /** Every Problem of the repository in front, of every module (docs/plan-vision.md, part 2). */
  | 'repository-problems'

export type { Module }

/**
 * What the middle of the Structure view shows of a level: the drawing, the matrix, the metrics,
 * or its Components on the main sequence.
 */
export type StructureShow = 'graph' | 'matrix' | 'metrics' | 'sequence'

/** What is selected in the Structure view: a node, a line, a Cycle, or one of the lists. */
export type StructureSelection =
  | { kind: 'node'; id: string }
  | { kind: 'edge'; from: string; to: string }
  | { kind: 'cycle'; index: number }
  | { kind: 'not-resolved' }
  | { kind: 'not-analysed' }

/** A Source File open in the code viewer, with the lines to mark and the one to bring into view. */
export interface CodeView {
  path: string
  marks: number[]
  line: number | undefined
  /** Its text, once it is read. */
  file: SourceFileText | undefined
  /** Why it cannot be shown. */
  error: string | undefined
}

/** The Structure view of one repository: which level, with or without tests, and what is selected. */
interface StructureTab {
  parent: string | undefined
  tests: boolean
  show: StructureShow
  /** The Components whose rows the matrix shows expanded. */
  expanded: string[]
  /** The level as it was last analysed; kept while it is analysed again. */
  view: StructureView | undefined
  loading: boolean
  /** Why the level could not be shown. */
  error: string | undefined
  selection: StructureSelection | undefined
  /** The Source File the middle shows instead of the level, if one is open. */
  code: CodeView | undefined
  /** The middle shows the Problems of the repository instead of the level. */
  problems: boolean
}

/**
 * What Structure knows of the whole repository (`StructureOutline`), for the Problems of the
 * repository and the search: the last answer, kept while the next one is asked for.
 */
class OutlineTab {
  /**
   * Not made deeply reactive: it is replaced as a whole, and the search runs over tens of
   * thousands of its Source Files at every key.
   */
  known = $state.raw<StructureOutline | undefined>(undefined)
  /** An analysis is asked for and has not answered yet. */
  reading = $state(false)
  /** Why the last one failed. */
  failed = $state<string | undefined>(undefined)
  /** Counts the requests, so that an answer that is overtaken is dropped. */
  asked = 0
}

/** What branches that are not checked out do to the ADRs, as git was last asked. */
interface BranchesTab {
  /** `undefined` until git has answered, and without git. */
  overview: BranchOverview | undefined
  loading: boolean
  /** Counts the requests, so that an answer that is overtaken is dropped. */
  asked: number
  /** The ADR of a branch that is open: its commit, its file, and what was read. */
  selected: { sha: string; path: string; branch: string } | undefined
  /** `undefined` while it is read; `null` when git no longer has it. */
  adr: Adr | null | undefined
}

interface Tab {
  repository: OpenRepository
  module: Module
  logPath: string | undefined
  view: MiddleView
  statusFilter: StatusFilter
  selectedId: string | undefined
  structure: StructureTab
  outline: OutlineTab
  branches: BranchesTab
  /** How the Relations graph is shown: the Relation types it draws, and its scale. */
  graph: { types: RelationType[]; scale: number }
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
      /** The change renames a Component: the Structure view follows it. */
      renames?: { from: string; to: string }
    }
  /** Why something cannot be done, or was not written. */
  | { kind: 'refused'; title: string; reason: string }
  /** A question before something is lost, or what can be done with what was made. */
  | {
      kind: 'confirm'
      title: string
      reason: string
      action: string
      /** The button that does not proceed: "Keep editing" unless it says otherwise. */
      stay?: string
      proceed: () => void
      /** Whoever asked may want to know that the answer was no. */
      declined?: () => void
    }

export interface Caution {
  lead: string
  advice: string
}

export type EditorMode = 'source' | 'split' | 'live'

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
  repositoryId: string
  logPath: string
  adrId: string
  title: string
  /** The Correction, by its position in the ADR's list, that the history was opened from. */
  correction: number | undefined
  /** `undefined` while git is being asked for the first time. */
  entries: readonly HistoryEntry[] | undefined
  selectedId: string | undefined
  /** `undefined` while it is being read; `null` when git could not say. */
  change: FileChange | null | undefined
  /** Set when the history was opened from a Correction that no entry recorded. */
  notFound: boolean
  /** How often git was asked for the entries: only the answer to the latest question counts. */
  asked: number
  /** How often git was asked what an entry did: only the answer to the latest question counts. */
  changeAsked: number
}

/** A commit of one ADR's files, as the dialog shows it (docs/adr/0012-…). */
interface Committing {
  adrId: string
  title: string
  /** `undefined` while git is being asked, or after the plan was used up. */
  plan: CommitPlan | undefined
  /** The paths of the offered files the person keeps chosen. */
  include: string[]
  message: string
  /** The message the plan proposed: what the person did not change is proposed afresh. */
  proposed: string
  busy: boolean
  /** Why it cannot be planned, or why git did not commit. */
  refused: string | undefined
  /** The commit is made, and git said something after it: a hook failed. */
  made: { sha: string; said: string } | undefined
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
  /** The Components the ADR affects, by their IDs. */
  affects: string[]
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
    ) as Record<RelationType, string[]>,
    affects: [...adr.metadata.affects]
  }
}

/** Every list of the two, side by side. */
function pairs(a: MetadataLists, b: MetadataLists): [string[], string[]][] {
  return [
    [a.decisionMakers, b.decisionMakers],
    [a.tags, b.tags],
    ...RELATION_TYPES.map((type): [string[], string[]] => [a.relations[type], b.relations[type]]),
    [a.affects, b.affects]
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
  /** An export is being written: its dialog of the system is open, or git and disk are busy. */
  exporting = $state(false)
  editing = $state<Editing | undefined>(undefined)
  creating = $state<Creating | undefined>(undefined)
  editingMetadata = $state<EditingMetadata | undefined>(undefined)
  history = $state<History | undefined>(undefined)
  committing = $state<Committing | undefined>(undefined)
  /** The search palette, while it is open. */
  searching = $state<{ query: string } | undefined>(undefined)

  readonly active = $derived(this.tabs.find((tab) => tab.repository.id === this.activeId))

  /** The Relations that lead from an ADR of one open repository to an ADR of another. */
  readonly outside = $derived(outsideRelations(this.tabs.map((tab) => tab.repository)))

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

  /** Every Problem of the repository in front, of every module (docs/plan-vision.md, part 2). */
  readonly repositoryProblems = $derived(
    this.active && repositoryProblems(this.active.repository, this.active.outline)
  )

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

  /** Whether a dialog holds what was entered and not yet carried out: picks, a typed title. */
  readonly dialogDirty = $derived(
    this.metadataDirty || (this.creating !== undefined && this.creating.title.trim() !== '')
  )

  /** Whether closing the window now would lose anything that was typed or picked. */
  readonly holdsUnsaved = $derived(this.dirty || this.dialogDirty)

  async start(): Promise<void> {
    window.api.onRepositoryChanged((repository) => this.replace(repository))
    window.api.onStructureChanged((repositoryId) => {
      const tab = this.tabs.find((candidate) => candidate.repository.id === repositoryId)
      if (tab?.structure.view) void this.loadStructure(tab)
      // The file in the viewer may be one that changed.
      if (tab?.structure.code) void this.readSourceFile(tab)
      if (tab?.outline.known || tab?.outline.reading) void this.loadOutline(tab)
    })
    window.api.onCloseRequested(() => this.requestClose())
    const session = await window.api.restoreSession()
    this.tabs = session.repositories.map(newTab)
    this.activeId = session.activeId
    this.ready = true
    for (const tab of this.tabs) void this.loadBranches(tab)
    // The count of the repository's Problems stands in every sidebar: Structure's are asked for.
    this.needOutline(this.active)
  }

  async open(): Promise<void> {
    const repository = await window.api.openRepository()
    if (!repository) return
    this.leaveEditor(() => {
      if (!this.tabs.some((tab) => tab.repository.id === repository.id)) {
        this.tabs.push(newTab(repository))
        void this.loadBranches(this.tabs.at(-1))
      }
      this.activeId = repository.id
      this.needOutline(this.active)
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
      this.needOutline(this.active)
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

  /**
   * Speak another language, or the system's when `language` is left out. The window reloads in
   * it; text that is not saved is asked about first, and `declined` is called if it is kept.
   */
  speak(language: Language | undefined, declined: () => void): void {
    this.leaveDialogs(
      () =>
        this.leaveEditor(() => {
          chooseLanguage(language)
          void window.api.reloadWindow()
        }, declined),
      declined
    )
  }

  /** Switch the repository in front to another module. The editor is a Decisions thing. */
  showModule(module: Module): void {
    const tab = this.active
    if (!tab || tab.module === module) return
    this.leaveEditor(() => {
      tab.module = module
      if (module === 'structure' && !tab.structure.view) void this.loadStructure(tab)
    })
  }

  /** Ask for the level the Structure view of a tab is at. The first time, that analyses the code. */
  async loadStructure(tab: Tab | undefined = this.active): Promise<void> {
    if (!tab) return
    const { parent, tests } = tab.structure
    // A plain copy: what is reactive cannot be sent.
    const expanded = [...tab.structure.expanded]
    tab.structure.loading = true
    const result = await window.api.structureView(tab.repository.id, parent, tests, expanded)
    // Somebody went elsewhere in the meantime: their request is the one that counts.
    if (
      tab.structure.parent !== parent ||
      tab.structure.tests !== tests ||
      tab.structure.expanded.join('\n') !== expanded.join('\n')
    ) {
      return
    }
    tab.structure.loading = false
    if (!result.ok) {
      tab.structure.error = result.reason
      return
    }
    const view = result.view
    tab.structure.error = undefined
    tab.structure.view = view
    tab.structure.parent = view.parent
    tab.structure.expanded = [...view.matrix.expanded]
    if (!stillThere(tab.structure.selection, view)) tab.structure.selection = undefined
  }

  /** Go to the level below a Component, or back up to one above; `undefined` is the top. */
  openComponent(id: string | undefined): void {
    const tab = this.active
    if (!tab) return
    tab.structure.parent = id
    tab.structure.expanded = []
    tab.structure.selection = undefined
    tab.structure.code = undefined
    tab.structure.problems = false
    void this.loadStructure(tab)
  }

  /**
   * Show a Component's page in the Structure view, at the level it is part of: where an ADR
   * names it, say, or the search finds it. From the Problems of the repository, they stay in
   * the middle (`fromProblems`).
   */
  showComponent(id: string, fromProblems = false): void {
    const tab = this.active
    if (!tab) return
    this.searching = undefined
    this.leaveEditor(() => {
      tab.module = 'structure'
      tab.structure.parent = id.includes('/') ? id.slice(0, id.lastIndexOf('/')) : undefined
      tab.structure.expanded = []
      tab.structure.selection = { kind: 'node', id }
      tab.structure.code = undefined
      tab.structure.problems = fromProblems
      void this.loadStructure(tab)
    })
  }

  /** Show a Source File in the code viewer of Structure, from wherever the view is: the search. */
  showSourceFile(path: string): void {
    const tab = this.active
    if (!tab) return
    this.searching = undefined
    this.leaveEditor(() => {
      tab.module = 'structure'
      if (!tab.structure.view) void this.loadStructure(tab)
      this.openSourceFile(path)
    })
  }

  /**
   * Ask what Structure knows of the whole repository: every Component and Source File, and its
   * Problems. `fresh` asks for an analysis of now where Structure is not open, and its files
   * are not watched.
   */
  async loadOutline(tab: Tab | undefined = this.active, fresh = false): Promise<void> {
    if (!tab) return
    const outline = tab.outline
    const asked = ++outline.asked
    outline.reading = true
    const result = await window.api
      .structureOutline(tab.repository.id, fresh)
      .catch((error: unknown) => ({ ok: false as const, reason: String(error) }))
    if (asked !== outline.asked) return
    outline.reading = false
    if (result.ok) {
      outline.known = result.outline
      outline.failed = undefined
    } else if ('reason' in result) {
      outline.failed = result.reason
    }
    // Dropped, as another tab came to the front: asked again when this one does.
  }

  /** Ask for the outline of a tab, unless it is known or asked for already. */
  private needOutline(tab: Tab | undefined): void {
    if (tab && !tab.outline.known && !tab.outline.reading) void this.loadOutline(tab)
  }

  /**
   * The outline as of now, for a view that lists or searches it: analysed again where it may
   * be older than the files, which the cache of the analysis makes cheap.
   */
  private freshOutline(tab: Tab | undefined): void {
    if (!tab) return
    const { known, reading } = tab.outline
    if (known && !known.current && !reading) void this.loadOutline(tab, true)
    else this.needOutline(tab)
  }

  /** Show the Problems of the repository in front, in the middle of the module that is in front. */
  showRepositoryProblems(): void {
    const tab = this.active
    if (!tab) return
    this.freshOutline(tab)
    if (tab.module === 'structure') {
      tab.structure.problems = true
      tab.structure.code = undefined
    } else {
      this.show('repository-problems')
    }
  }

  /** From the Problems of the repository: an ADR in Decisions, with the Problems beside it. */
  showProblemAdr(logPath: string, id: string): void {
    const tab = this.active
    if (!tab) return
    const arrive = (): void => {
      tab.module = 'decisions'
      tab.view = 'repository-problems'
      tab.logPath = logPath
      tab.selectedId = id
    }
    // The ADR that is open already stays open, editor and all.
    const there = logPath === this.log?.path && id === tab.selectedId
    if (there) arrive()
    else this.leaveEditor(arrive)
  }

  /** From the Problems of the repository: the declaration in Structure, with the Problems beside it. */
  showProblemDeclaration(): void {
    const tab = this.active
    if (!tab) return
    this.leaveEditor(() => {
      tab.module = 'structure'
      tab.structure.problems = true
      tab.structure.code = undefined
      tab.structure.selection = undefined
      if (!tab.structure.view) void this.loadStructure(tab)
    })
  }

  /** Plan giving a declared Component a new segment, with every Trace that names it. Nothing is written yet. */
  async renameComponent(id: string, segment: string): Promise<void> {
    const tab = this.active
    if (!tab) return
    const texts = t.review.rename
    const to = (id.includes('/') ? id.slice(0, id.lastIndexOf('/') + 1) : '') + segment
    const plan = await window.api.planRename(tab.repository.id, id, segment)
    this.present(
      plan.ok
        ? {
            kind: 'change',
            title: texts.title(id, to),
            action: texts.action,
            change: plan.change,
            applying: false,
            renames: { from: id, to }
          }
        : { kind: 'refused', title: texts.refused(id), reason: wordOf(plan.said, plan.reason) }
    )
  }

  /** A Component was renamed: what the Structure view shows of it, and below it, goes with it. */
  private followRename(from: string, to: string): void {
    const tab = this.active
    if (!tab) return
    const moved = (id: string): string =>
      id === from || id.startsWith(`${from}/`) ? to + id.slice(from.length) : id
    const { structure } = tab
    if (structure.parent !== undefined) structure.parent = moved(structure.parent)
    structure.expanded = structure.expanded.map(moved)
    if (structure.selection?.kind === 'node') {
      structure.selection = { kind: 'node', id: moved(structure.selection.id) }
    } else if (structure.selection?.kind === 'edge') {
      const { from: source, to: target } = structure.selection
      structure.selection = { kind: 'edge', from: moved(source), to: moved(target) }
    }
  }

  /** Show the level as a drawing, as a matrix, as a table of its metrics, or on the main sequence. */
  showInStructure(show: StructureShow): void {
    if (!this.active) return
    this.active.structure.show = show
    this.active.structure.code = undefined
    this.active.structure.problems = false
  }

  /**
   * Open a Source File in the code viewer, with `marks` marked — the lines of a Dependency —
   * and `line` brought into view, or else the first of them.
   */
  openSourceFile(path: string, marks: readonly number[] = [], line?: number): void {
    const tab = this.active
    if (!tab) return
    const open = tab.structure.code?.path === path ? tab.structure.code.file : undefined
    tab.structure.code = { path, marks: [...marks], line, file: open, error: undefined }
    tab.structure.problems = false
    if (!open) void this.readSourceFile(tab)
  }

  /** Back from the code viewer to the level. */
  closeSourceFile(): void {
    if (this.active) this.active.structure.code = undefined
  }

  private async readSourceFile(tab: Tab): Promise<void> {
    const path = tab.structure.code?.path
    if (path === undefined) return
    const result = await window.api.readSourceFile(tab.repository.id, path)
    const code = tab.structure.code
    // Another file was opened in the meantime, or none.
    if (code?.path !== path) return
    if (result.ok) {
      code.file = result.file
      code.error = undefined
    } else {
      code.error = result.reason
    }
  }

  /** Expand the row of a Component in the matrix into the rows of the level below it, or fold it back. */
  expandInMatrix(id: string, expand: boolean): void {
    const tab = this.active
    if (!tab || tab.structure.expanded.includes(id) === expand) return
    tab.structure.expanded = expand
      ? [...tab.structure.expanded, id]
      : // Folding a Component folds what was expanded inside it.
        tab.structure.expanded.filter((other) => other !== id && !other.startsWith(`${id}/`))
    void this.loadStructure(tab)
  }

  includeTests(tests: boolean): void {
    const tab = this.active
    if (!tab || tab.structure.tests === tests) return
    tab.structure.tests = tests
    void this.loadStructure(tab)
  }

  selectInStructure(selection: StructureSelection | undefined): void {
    if (this.active) this.active.structure.selection = selection
  }

  /** Plan writing the Draft into the declaration. Nothing is written yet. */
  async adopt(): Promise<void> {
    const tab = this.active
    if (!tab) return
    const texts = t.review.adopt
    const plan = await window.api.planAdopt(tab.repository.id)
    this.present(
      plan.ok
        ? {
            kind: 'change',
            title: texts.title,
            action: texts.action,
            change: plan.change,
            applying: false
          }
        : { kind: 'refused', title: texts.refused, reason: wordOf(plan.said, plan.reason) }
    )
  }

  /** Plan the Repair of a Problem of the declaration. Nothing is written yet. */
  async repairStructure(problem: StructureProblem): Promise<void> {
    const tab = this.active
    if (!tab || problem.kind !== 'dead-pattern') return
    const texts = t.review.structureRepair
    const plan = await window.api.planStructureRepair(tab.repository.id, problem)
    this.present(
      plan.ok
        ? {
            kind: 'change',
            title: texts.title(problem.component),
            action: texts.action,
            change: plan.change,
            applying: false
          }
        : {
            kind: 'refused',
            title: texts.refused(problem.component),
            reason: wordOf(plan.said, plan.reason)
          }
    )
  }

  /**
   * Export the Decision Logs, as web pages or as a PDF, to where the person picks in the
   * system's dialog; then offer to open what was written.
   */
  async exportAs(kind: ExportKind): Promise<void> {
    const tab = this.active
    if (!tab || this.exporting) return
    this.exporting = true
    // Where it goes first; then the Mermaid blocks are drawn here, where there is a browser to
    // draw them, and shown in the export as drawn. The export writes them through the same code
    // as `adr export`, which has none and keeps them as code (docs/adr/0016-…).
    const result = await window.api
      .pickExport(tab.repository.id, kind)
      .then(async (destination) => {
        if (destination === undefined || !destination.ok) return destination
        const diagrams = await drawnForExport(
          tab.repository.repository.logs.flatMap((log) =>
            log.adrs.flatMap((adr) => mermaidSources(adr.body))
          )
        )
        return window.api.exportTo(destination.ticket, diagrams)
      })
      .catch((error: unknown) => ({ ok: false as const, reason: String(error) }))
      .finally(() => (this.exporting = false))
    if (result === undefined) return
    if (!result.ok) {
      this.review = { kind: 'refused', title: t.export.refused, reason: result.reason }
      return
    }
    const path = result.path
    this.review = {
      kind: 'confirm',
      title: kind === 'site' ? t.export.siteTitle : t.export.pdfTitle,
      reason: t.export.done(result.adrs, path),
      action: t.export.open,
      stay: t.close,
      proceed: () => void window.api.openExported(path)
    }
  }

  /** Filtering is about ADRs: it leads back to their list. */
  filterBy(filter: StatusFilter): void {
    if (!this.active) return
    this.active.statusFilter = filter
    this.active.view = 'adrs'
  }

  /** Draw the Relations of a type in the graph, or leave them out. */
  showRelationType(type: RelationType, shown: boolean): void {
    const graph = this.active?.graph
    if (!graph) return
    graph.types = RELATION_TYPES.filter((one) => (one === type ? shown : graph.types.includes(one)))
  }

  zoomGraph(scale: number): void {
    if (this.active) this.active.graph.scale = scale
  }

  show(view: MiddleView): void {
    const tab = this.active
    if (!tab) return
    if (view !== 'branches') {
      tab.view = view
      return
    }
    // The ADR of a branch takes the place of the ADR that is open, and of its editor.
    this.leaveEditor(() => {
      tab.view = view
      // Branches move without the working tree knowing: what they hold is asked for again.
      void this.loadBranches(tab)
    })
  }

  /** Ask git what the branches that are not checked out do to the ADRs. */
  async loadBranches(tab: Tab | undefined = this.active): Promise<void> {
    if (!tab?.repository.git) return
    const branches = tab.branches
    const asked = ++branches.asked
    branches.loading = true
    const overview = await window.api.branches(tab.repository.id).catch(() => undefined)
    if (asked !== branches.asked) return
    branches.overview = overview
    branches.loading = false
    // The ADR that is open may be gone from the overview: its branch was merged or deleted.
    // When the branch has a new commit, it is read as that commit has it.
    const open = branches.selected
    if (open && !overview?.branches.some((branch) => branch.sha === open.sha)) {
      const moved = overview?.branches.find(
        (branch) =>
          branch.names.includes(open.branch) && branch.adrs.some((adr) => adr.path === open.path)
      )
      if (moved) void this.showBranchAdr(moved.sha, open.path, open.branch, tab)
      else {
        branches.selected = undefined
        branches.adr = undefined
      }
    }
  }

  /** Open an ADR as a branch has it, read-only. */
  async showBranchAdr(
    sha: string,
    path: string,
    branch: string,
    tab: Tab | undefined = this.active
  ): Promise<void> {
    if (!tab) return
    tab.branches.selected = { sha, path, branch }
    tab.branches.adr = undefined
    const adr = await window.api.branchAdr(tab.repository.id, sha, path).catch(() => undefined)
    const still = tab.branches.selected
    if (still?.sha === sha && still.path === path) tab.branches.adr = adr ?? null
  }

  select(id: string): void {
    if (id === this.active?.selectedId) return
    this.leaveEditor(() => {
      if (this.active) this.active.selectedId = id
    })
  }

  startSearching(): void {
    if (!this.active) return
    this.searching = { query: '' }
    // Components and Source Files are searched as far as Structure knows them.
    this.freshOutline(this.active)
  }

  stopSearching(): void {
    this.searching = undefined
  }

  /**
   * Go to an ADR of any Decision Log of the repository in front, or of another open one, from
   * wherever the view is. Seen from every repository at once, the view stays that.
   */
  jumpTo(logPath: string, id: string, repositoryId: string | undefined = this.activeId): void {
    this.searching = undefined
    const across = this.active?.view === 'all-adrs' || this.active?.view === 'all-problems'
    const from = this.active?.view
    const arrive = (): void => {
      if (repositoryId !== this.activeId) {
        this.activeId = repositoryId
        void window.api.setActiveRepository(repositoryId)
      }
      const tab = this.active
      if (!tab) return
      if (across && from) tab.view = from
      // An ADR is shown where ADRs are, whichever module was in front.
      tab.module = 'decisions'
      tab.logPath = logPath
      tab.selectedId = id
      // What is in the middle has to show where the jump went: the graph does if it draws
      // the ADR, the list does unless a filter hides it.
      const drawn = this.log?.relations.some(({ from, to }) => from === id || to === id)
      // The timeline and the board show every ADR of the log, the Problems of the repository
      // every ADR that has one; the ADR is beside them.
      const shown =
        across ||
        tab.view === 'timeline' ||
        tab.view === 'board' ||
        tab.view === 'repository-problems' ||
        (tab.view === 'graph' && drawn)
      if (!shown) tab.view = 'adrs'
      const adr = this.log?.adrs.find((candidate) => candidate.id === id)
      if (adr && tab.statusFilter !== 'all' && statusKey(adr) !== tab.statusFilter) {
        tab.statusFilter = 'all'
      }
    }
    // The ADR that is open already stays open, editor and all; only the list follows.
    const there =
      repositoryId === this.activeId && logPath === this.log?.path && id === this.active?.selectedId
    if (there) arrive()
    else this.leaveEditor(arrive)
  }

  /** Select an ADR of the log in view by its file name, as a link inside an ADR names it. */
  selectByFileName(fileName: string): boolean {
    const id = fileName.replace(/\.md$/i, '')
    const found = this.log?.adrs.some((adr) => adr.id === id) ?? false
    if (found) this.select(id)
    return found
  }

  /**
   * Move an ADR to another Status, as on the board (docs/plan-roadmap.md, part 11): the
   * operation the move stands for, previewed as from its detail; a move that is none is said so.
   */
  move(id: string, to: StatusKey): void {
    const tab = this.active
    const adr = this.log?.adrs.find((candidate) => candidate.id === id)
    if (!tab || !adr) return
    const move = moveOf(adr, to)
    if (move.kind === 'stay') return
    if (move.kind === 'refused') {
      this.present({
        kind: 'refused',
        title: t.board.refusedTitle(prefixOf(adr)),
        reason: t.board.refused[move.why]
      })
      return
    }
    // The ADR is selected first: its detail shows what the preview is about.
    this.leaveEditor(() => {
      tab.selectedId = id
      if (move.kind === 'supersede') this.startCreating('supersedes')
      else void this.decide(move.decision)
    })
  }

  /** Ask for a decision on the selected ADR. The main process plans it; nothing is written yet. */
  async decide(decision: Decision): Promise<void> {
    const [tab, log, adr] = [this.active, this.log, this.selected]
    if (!tab || !log || !adr) return
    const texts = t.review.decision[decision]
    const title = texts.title(prefixOf(adr))
    const plan = await window.api.planDecision(tab.repository.id, log.path, adr.id, decision)
    this.present(
      plan.ok
        ? { kind: 'change', title, action: texts.action, change: plan.change, applying: false }
        : {
            kind: 'refused',
            title: texts.refused(prefixOf(adr)),
            reason: wordOf(plan.said, plan.reason)
          }
    )
  }

  /**
   * Open the history of the selected ADR; from the marker of a Correction — its position
   * in the ADR's list — at the entry that recorded it.
   */
  async showHistory(correction?: number): Promise<void> {
    const [tab, log, adr] = [this.active, this.log, this.selected]
    if (!tab || !log || !adr) return
    this.history = {
      repositoryId: tab.repository.id,
      logPath: log.path,
      adrId: adr.id,
      title: t.history.title(prefixOf(adr)),
      correction,
      entries: undefined,
      selectedId: undefined,
      change: undefined,
      notFound: false,
      asked: 0,
      changeAsked: 0
    }
    await this.readHistory()
  }

  /**
   * Ask git for the entries of the history in the dialog — when it opens, and again whenever
   * the files or git move while it is open. The first answer selects the entry the dialog
   * was opened at; a later one stays with the entry that is selected (`followHistory`).
   */
  private async readHistory(): Promise<void> {
    const history = this.history
    if (!history) return
    const asked = ++history.asked
    const { repositoryId, logPath, adrId } = history
    const entries = await window.api.history(repositoryId, logPath, adrId).catch(() => undefined)
    // The dialog may have been closed, opened again, or asked again in the meantime.
    const now = this.history
    if (now !== history || now.asked !== asked) return

    if (now.entries !== undefined) {
      if (!entries) return
      const { selectedId, reread } = followHistory(entries, now.selectedId)
      now.entries = entries
      now.selectedId = selectedId
      if (reread) await this.readHistoryChange(selectedId)
      return
    }
    const corrections =
      this.tabs
        .find((tab) => tab.repository.id === repositoryId)
        ?.repository.repository.logs.find((log) => log.path === logPath)
        ?.adrs.find((adr) => adr.id === adrId)?.metadata.corrections ?? []
    const recorded =
      now.correction === undefined
        ? undefined
        : recordedIn(entries ?? [], corrections, now.correction)
    now.entries = entries ?? []
    now.notFound = now.correction !== undefined && !recorded
    await this.showHistoryEntry((recorded ?? now.entries[0])?.id)
  }

  async showHistoryEntry(id: string | undefined): Promise<void> {
    const history = this.history
    if (!history || id === undefined) return
    history.selectedId = id
    history.change = undefined
    await this.readHistoryChange(id)
  }

  /** Read what an entry did to the file; what is shown meanwhile stays. */
  private async readHistoryChange(id: string | undefined): Promise<void> {
    const history = this.history
    if (!history || id === undefined) return
    const asked = ++history.changeAsked
    const change = await window.api
      .historyChange(history.repositoryId, history.logPath, history.adrId, id)
      .catch(() => undefined)
    // The dialog may have been closed, opened again — for an ADR of the same ID in another
    // repository, say —, or asked again since: an older answer is no answer.
    if (this.history === history && history.changeAsked === asked && history.selectedId === id) {
      history.change = change ?? null
    }
  }

  closeHistory(): void {
    this.history = undefined
  }

  /**
   * Plan a commit of the selected ADR. The main process says which files it takes and which
   * it offers; nothing is committed until the person confirms. Asked again, a message the
   * person wrote stays; one they left as it was proposed is proposed afresh.
   */
  async startCommit(): Promise<void> {
    const [tab, log, adr] = [this.active, this.log, this.selected]
    if (!tab || !log || !adr) return
    const previous = this.committing?.adrId === adr.id ? this.committing : undefined
    const message =
      previous && previous.message !== previous.proposed ? previous.message : undefined
    this.committing = {
      adrId: adr.id,
      title: t.commit.title(prefixOf(adr)),
      plan: undefined,
      include: [],
      message: message ?? '',
      proposed: '',
      busy: false,
      refused: undefined,
      made: undefined
    }
    const result = await window.api.planCommit(tab.repository.id, log.path, adr.id)
    const committing = this.committing
    if (committing?.adrId !== adr.id || committing.plan !== undefined) {
      if (result.ok) void window.api.discardCommit(result.plan.planId)
      return
    }
    if (!result.ok) {
      committing.refused = result.reason
      return
    }
    committing.plan = result.plan
    committing.include = result.plan.related.map((one) => one.file.path)
    committing.proposed = result.plan.message
    if (message === undefined || message.trim() === '') committing.message = result.plan.message
  }

  toggleCommitted(path: string): void {
    const committing = this.committing
    if (!committing) return
    committing.include = committing.include.includes(path)
      ? committing.include.filter((one) => one !== path)
      : [...committing.include, path]
  }

  async confirmCommit(): Promise<void> {
    const committing = this.committing
    const plan = committing?.plan
    if (!committing || !plan || committing.busy) return
    committing.busy = true
    committing.refused = undefined
    // A plain array: what crosses to the main process is copied, and a proxy cannot be.
    const result = await window.api
      .commit(plan.planId, [...committing.include], committing.message)
      .catch((error: unknown) => ({ committed: false as const, reason: String(error) }))
    if (this.committing !== committing) return
    if (result.committed) {
      this.replace(result.repository)
      // A hook that failed after the commit has its say; the commit stands.
      if (result.said === undefined) this.committing = undefined
      else {
        committing.plan = undefined
        committing.busy = false
        committing.made = { sha: result.sha, said: result.said }
      }
      return
    }
    // The plan is used up: the main process forgets it either way.
    committing.plan = undefined
    committing.busy = false
    committing.refused = result.reason
  }

  cancelCommit(): void {
    // While git commits, the dialog waits for what it says: closed, that would go unheard.
    if (this.committing?.busy) return
    const plan = this.committing?.plan
    if (plan) void window.api.discardCommit(plan.planId)
    this.committing = undefined
  }

  /**
   * Ask for one of the repairs of a Problem of a Decision Log: of the one in view, or of
   * another one of the repository in front. The main process plans it; nothing is written yet.
   */
  async repair(repair: Repair, logPath: string | undefined = this.log?.path): Promise<void> {
    const tab = this.active
    const log = tab?.repository.repository.logs.find((one) => one.path === logPath)
    const adr = log?.adrs.find((candidate) => candidate.id === repair.adr)
    if (!tab || !log || !adr) return
    // A Renumber is known by its own name, and warns about something else.
    const texts = repair.kind === 'renumber' ? t.review.renumber : t.review.repair
    const plan = await window.api.planRepair({
      repositoryId: tab.repository.id,
      logPath: log.path,
      repair
    })
    this.present(
      plan.ok
        ? {
            kind: 'change',
            title: texts.title(prefixOf(adr)),
            action: texts.action,
            change: plan.change,
            applying: false,
            caution: texts.caution
          }
        : {
            kind: 'refused',
            title: texts.refused(prefixOf(adr)),
            reason: wordOf(plan.said, plan.reason)
          }
    )
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
    this.present(
      plan.ok
        ? {
            kind: 'change',
            title,
            action: texts.action,
            change: plan.change,
            applying: false,
            caution: texts.caution
          }
        : { kind: 'refused', title: refused, reason: wordOf(plan.said, plan.reason) }
    )
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
    if (this.held(plan)) return
    this.creating = undefined
    this.present(
      plan.ok
        ? {
            kind: 'change',
            title: t.review.create.title,
            action: t.review.create.action,
            change: plan.change,
            applying: false
          }
        : {
            kind: 'refused',
            title: t.review.create.refused,
            reason: wordOf(plan.said, plan.reason)
          }
    )
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
    const { repositoryId, logPath, adrId, decisionMakers, tags, relations, affects } =
      $state.snapshot(editing)
    const plan = await window.api.planMetadataEdit({
      repositoryId,
      logPath,
      adrId,
      decisionMakers,
      tags,
      relations,
      affects
    })
    this.present(
      plan.ok
        ? {
            kind: 'change',
            title: t.review.metadata.title(prefixOf(adr)),
            action: t.save,
            change: plan.change,
            applying: false,
            saves: true
          }
        : {
            kind: 'refused',
            title: t.review.metadata.refused(prefixOf(adr)),
            reason: wordOf(plan.said, plan.reason)
          }
    )
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
    this.present(
      plan.ok
        ? {
            kind: 'change',
            title: t.review.body.title(prefixOf(adr)),
            action: t.save,
            change: plan.change,
            applying: false,
            saves: true,
            caution: t.review.body.caution
          }
        : {
            kind: 'refused',
            title: t.review.body.refused(prefixOf(adr)),
            reason: wordOf(plan.said, plan.reason)
          }
    )
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
      // A renamed Component has a new ID: the Structure view stays with it.
      if (review.renames) this.followRename(review.renames.from, review.renames.to)
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
      const title = result.inPart ? t.review.writtenInPart : t.review.notWritten
      this.review = { kind: 'refused', title, reason: result.reason }
    }
  }

  /**
   * Whether a question was asked while a plan was made — the window is to close — so that what
   * the plan came back with gives way: the question stays, and a planned change is dropped.
   */
  private held(plan: { ok: true; change: { changeId: string } } | { ok: false }): boolean {
    if (this.review?.kind !== 'confirm') return false
    if (plan.ok) void window.api.discardChange(plan.change.changeId)
    return true
  }

  /** Show what a plan came back with, unless a question was asked meanwhile. */
  private present(review: Review): void {
    if (this.review?.kind === 'confirm') {
      if (review.kind === 'change') void window.api.discardChange(review.change.changeId)
      return
    }
    this.review = review
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
    // A question that is open already gives way without an answer: if it was this same
    // question, asked before, a "no" to it would tell the main process that no quit waits.
    if (this.review?.kind === 'confirm') this.review = undefined
    else this.dismissReview()
    const answer = (close: boolean) => (): void => void window.api.answerCloseRequest(close)
    this.leaveDialogs(() => this.leaveEditor(answer(true), answer(false)), answer(false))
  }

  /**
   * Close the dialogs for a new ADR and for Metadata. With something entered in one of them,
   * the author is asked first, as for unsaved text in the editor.
   */
  private leaveDialogs(then: () => void, declined: () => void): void {
    const proceed = (): void => {
      this.creating = undefined
      this.editingMetadata = undefined
      then()
    }
    if (!this.dialogDirty) return proceed()
    this.review = {
      kind: 'confirm',
      title: t.review.discardDialog.title,
      reason: t.review.discardDialog.reason,
      action: t.review.discardDialog.action,
      proceed,
      declined
    }
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
    editing.affects = rebase(editing.affects, editing.base.affects, onDisk.affects)
    editing.base = onDisk
  }

  /** The files changed on disk: take the new reading, keep what the user was looking at. */
  private replace(repository: OpenRepository): void {
    const tab = this.tabs.find((candidate) => candidate.repository.id === repository.id)
    if (!tab) return
    tab.repository = repository
    this.rebaseMetadata(repository)
    // A commit or a checkout changes what the other branches have that this one has not.
    void this.loadBranches(tab)
    // The history follows the file and git while it is open; of an ADR that is gone from
    // the log, it keeps what it last read.
    const history = this.history
    const stillThere = repository.repository.logs
      .find((log) => log.path === history?.logPath)
      ?.adrs.some((adr) => adr.id === history?.adrId)
    if (history?.repositoryId === repository.id && stillThere) void this.readHistory()

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
    module: 'decisions',
    logPath: undefined,
    view: 'adrs',
    statusFilter: 'all',
    selectedId: undefined,
    structure: {
      parent: undefined,
      tests: false,
      show: 'graph',
      expanded: [],
      code: undefined,
      problems: false,
      view: undefined,
      loading: false,
      error: undefined,
      selection: undefined
    },
    outline: new OutlineTab(),
    branches: {
      overview: undefined,
      loading: false,
      asked: 0,
      selected: undefined,
      adr: undefined
    },
    graph: { types: [...RELATION_TYPES], scale: 1 }
  }
}

/** Whether what was selected is still on the level as it was analysed again. */
function stillThere(selection: StructureSelection | undefined, view: StructureView): boolean {
  switch (selection?.kind) {
    case undefined:
      return false
    case 'node':
      return (
        view.nodes.some((node) => node.id === selection.id) ||
        view.matrix.rows.some((row) => row.id === selection.id) ||
        view.components.some((component) => component.id === selection.id)
      )
    case 'edge':
      return [...view.edges, ...view.matrix.cells].some(
        (edge) => edge.from === selection.from && edge.to === selection.to
      )
    case 'cycle':
      return selection.index < view.cycles.length
    case 'not-resolved':
    case 'not-analysed':
      return true
  }
}

export function statusKey(adr: Pick<Adr, 'metadata'>): Status | 'unknown' {
  return adr.metadata.status ?? 'unknown'
}

export const app = new AppState()
