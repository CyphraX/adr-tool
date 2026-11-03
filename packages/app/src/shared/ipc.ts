import type {
  Adr,
  BranchAdr,
  ChangeSet,
  Correction,
  FileChange,
  RelationType,
  Repair,
  Repository,
  Said,
  Templates
} from '@adr-tool/core'
import type { Language as WindowLanguage } from './language'
import type { Annotation, AnnotationType, Found, ReviewProblem } from '@adr-tool/review'
import type {
  Cycle,
  Dependency,
  Language,
  MatrixCycle,
  Metrics,
  NotAnalysed,
  NotResolved,
  StructureProblem
} from '@adr-tool/structure/model'

/**
 * The contract between the main process and the sandboxed renderer.
 *
 * The renderer never names a file or a directory it was not given. A repository the user
 * opened gets an `id` from the main process, and everything after that refers to the id; a
 * Source File is named by the path the analysis gave it, which the main process looks up
 * among the Source Files of its analysis before it reads anything.
 */
export interface OpenRepository {
  readonly id: string
  /** The directory the user opened, for display only. */
  readonly root: string
  /**
   * The label of the repository's tab, and how another repository names it in a Relation: the
   * name it gives itself in `.adr/config.yml`, or the last part of `root`.
   */
  readonly name: string
  readonly repository: Repository
  /**
   * The Components the repository declares, which an ADR can name in `affects`, each parent
   * before its children. Absent while nothing is declared that can be read: then the Traces
   * are not checked either.
   */
  readonly components?: readonly ComponentName[]
  /** What git says about the directory. Absent without git, or outside a git repository. */
  readonly git?: GitState
}

/** A Component as a Trace names it, and as it is shown. */
export interface ComponentName {
  readonly id: string
  readonly name: string
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
  /**
   * The warnings as codes, where the module that warns has one: `warned[i]` is `warnings[i]`.
   * What the main process adds of its own comes after them, without a code.
   */
  readonly warned?: readonly Said[]
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
  /** The Components the ADR affects, by their Component IDs. */
  readonly affects: readonly string[]
}

/** A new segment for a declared Component. What is valid is `structure`'s question. */
export interface RenameRequest {
  readonly repositoryId: string
  readonly component: string
  readonly segment: string
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

/** One node of a level in the Structure view (docs/structure-format.md, section 4). */
export interface StructureNode {
  readonly kind: 'component' | 'own-files' | 'unassigned' | 'source-file' | 'directory'
  /**
   * The Component ID; the parent's for its own files; the path of a Source File; for a
   * directory below a Component without children, the Component's ID and the directory's path
   * below the Component's base — an address in the views, not a Component ID.
   */
  readonly id: string
  /**
   * The Component's name; the parent's for its own files; the file name of a Source File; the
   * path of a directory from the level it is on.
   */
  readonly name: string
  /** How many Source Files it stands for. */
  readonly files: number
  /** The lines of those files. */
  readonly lines: number
  /** The metrics (section 5) of a Component or a directory. The other nodes have a size and nothing else. */
  readonly metrics?: Metrics
}

/** The Dependencies from one node of a level to another, and the Source File Dependencies behind them. */
export interface StructureEdge {
  readonly from: string
  readonly to: string
  readonly weight: number
  readonly typeOnly: boolean
  readonly dependencies: readonly Dependency[]
}

/** A row of the matrix: a node of the level, or of a level below a Component expanded around it. */
export interface StructureRow extends StructureNode {
  /** 0 on the level itself, one more for each Component expanded around it. */
  readonly depth: number
  /** A Component that contains Source Files, or a directory: its row can be expanded. */
  readonly expandable: boolean
}

/**
 * The dependency structure matrix of the level (section 5): rows in its order, row i and
 * column i the same node. A cell is the Dependency of its row on its column.
 */
export interface StructureMatrix {
  readonly rows: readonly StructureRow[]
  /** The Components expanded, each over the rows from `first` to `last`; the outer first. */
  readonly groups: readonly {
    readonly id: string
    readonly name: string
    readonly depth: number
    readonly first: number
    readonly last: number
  }[]
  /** The rows the members of each Cycle take up, at whatever level; the outer first. */
  readonly cycles: readonly MatrixCycle[]
  /** The cells that hold something. */
  readonly cells: readonly StructureEdge[]
  /** The Components that are expanded: those asked for that are still there. */
  readonly expanded: readonly string[]
}

/** A node at the level of a Component, and the Dependency between the two. */
export interface StructureNeighbour {
  readonly kind: StructureNode['kind']
  readonly id: string
  readonly name: string
  readonly weight: number
  readonly typeOnly: boolean
}

/** What the Component page shows of one Component: the declaration, the metrics, the Dependencies. */
/** The page of a Component, or of a directory below a Component without children. */
export interface StructureComponent {
  readonly id: string
  readonly name: string
  /**
   * Set for a directory: the path it stands for. A directory is no Component — it has no
   * patterns, no Rename, and no ADR names it.
   */
  readonly directory?: string
  readonly description?: string
  readonly paths: readonly string[]
  readonly tests: readonly string[]
  /** The Component or directory whose children it is one of; `undefined` at the top. */
  readonly level: string | undefined
  /**
   * The Source Files it contains that are counted, in the order of their paths: the first
   * few hundred. How many there are is in its metrics.
   */
  readonly files: readonly string[]
  /** The test files it contains, counted or not. */
  readonly testFiles: number
  /** It contains Java that is counted: its metrics are a lower bound. */
  readonly java: boolean
  /** `undefined` when it contains no Source File. */
  readonly metrics?: Metrics
  /** At its own level: what it depends on, and what depends on it. */
  readonly dependsOn: readonly StructureNeighbour[]
  readonly usedBy: readonly StructureNeighbour[]
  /** The Cycles at its own level that it is a member of, each by its example round trip. */
  readonly cycles: readonly {
    readonly roundTrip: readonly Pick<StructureNode, 'kind' | 'id' | 'name'>[]
    readonly typeOnly: boolean
  }[]
}

/**
 * One level of a repository's Components as the Structure view shows it, with what the
 * analysis found on the way. Computed in the main process from the analysis that ran off it.
 */
export interface StructureView {
  readonly repositoryId: string
  /** Declared in `.arch/components.yml`, or the Draft. */
  readonly origin: 'declared' | 'draft'
  readonly canAdopt: boolean
  readonly problems: readonly StructureProblem[]
  /** What the checks find on the Draft: hints, not Problems. */
  readonly hints: readonly StructureProblem[]
  readonly sourceFiles: number
  readonly testFiles: number
  /** Java is read without a classpath: where there is Java, its numbers are a lower bound. */
  readonly javaFiles: number
  readonly dependencies: number
  /** How many different Libraries the code uses. */
  readonly libraries: number
  /** The uses that are not resolved: all of them counted, the first few hundred listed. */
  readonly notResolvedCount: number
  readonly notResolved: readonly NotResolved[]
  readonly notAnalysed: readonly NotAnalysed[]
  /** How long the analysis took. */
  readonly milliseconds: number
  /** The Components and directories above the level, from the top down to its parent. Empty at the top. */
  readonly path: readonly { readonly id: string; readonly name: string }[]
  /** The Component or directory whose children or Source Files are shown; `undefined` at the top. */
  readonly parent: string | undefined
  /** Whether test files are included. */
  readonly tests: boolean
  readonly nodes: readonly StructureNode[]
  readonly edges: readonly StructureEdge[]
  readonly cycles: readonly Cycle[]
  readonly matrix: StructureMatrix
  /** The Components the level and the matrix show, for their pages. */
  readonly components: readonly StructureComponent[]
}

/**
 * What the Structure module knows of a whole repository, for the views that look across the
 * modules — the Problems of the repository, and the search: every Component with its name, every
 * Source File, and what is wrong with the declaration. From the same analysis as the levels.
 */
export interface StructureOutline {
  readonly repositoryId: string
  /**
   * Kept current: Structure is open, and its files are watched. Otherwise the outline is as
   * of `analysedAt`, and the files may have changed since.
   */
  readonly current: boolean
  /** When the analysis it comes from was asked for, in milliseconds since the epoch. */
  readonly analysedAt: number
  /** Declared in `.arch/components.yml`, or the Draft. */
  readonly origin: 'declared' | 'draft'
  /** Every Component, each parent before its children; directories are none. */
  readonly components: readonly ComponentName[]
  /** Every Source File, by its path, in the order of the paths; test files included. */
  readonly sourceFiles: readonly OutlinedSourceFile[]
  readonly problems: readonly StructureProblem[]
  /** What the checks find on the Draft: hints, not Problems. */
  readonly hints: readonly StructureProblem[]
}

export interface OutlinedSourceFile {
  readonly path: string
  /** The Component that owns it; absent when it is Unassigned. */
  readonly component?: string
  readonly test: boolean
}

export type OutlineResult =
  | { readonly ok: true; readonly outline: StructureOutline }
  | { readonly ok: false; readonly reason: string }
  /** Another tab came to the front before the analysis began: ask again when this one does. */
  | { readonly ok: false; readonly dropped: true }

/**
 * A Mermaid block of an ADR as the window drew it: its source as the block holds it, and the
 * SVG, sanitized (docs/adr/0016-…). The export shows the SVG where the block stands.
 */
export interface DrawnDiagram {
  readonly source: string
  readonly svg: string
}

export type StructureResult =
  | { readonly ok: true; readonly view: StructureView }
  | { readonly ok: false; readonly reason: string }

/** The text of one Source File, as the code viewer shows it. */
export interface SourceFileText {
  /** As the analysis names it: relative to the repository root. */
  readonly path: string
  readonly language: Language
  readonly text: string
}

export type SourceFileResult =
  | { readonly ok: true; readonly file: SourceFileText }
  | { readonly ok: false; readonly reason: string }

/** The file of another ADR that a commit of one ADR offers to take along. */
export interface RelatedChange {
  readonly file: FileChange
  readonly logPath: string
  readonly adrId: string
  readonly title?: string
  readonly number?: number
}

/**
 * A commit of one ADR, planned by the main process and held there
 * (docs/adr/0012-committing-an-adr-runs-git-commit-for-its-files-only.md): the files it takes,
 * as the last commit has them and as they are now, the files of related ADRs it offers, the
 * message it proposes, and how many other changed files stay out of it.
 */
export interface CommitPlan {
  readonly planId: string
  readonly files: readonly FileChange[]
  readonly related: readonly RelatedChange[]
  readonly message: string
  readonly others: number
  /** The branch the commit goes on; `undefined` on a detached HEAD, where it goes on none. */
  readonly branch: string | undefined
}

export type CommitPlanResult =
  { readonly ok: true; readonly plan: CommitPlan } | { readonly ok: false; readonly reason: string }

/**
 * A branch that is not checked out and does something to the ADRs that the working tree
 * does not have yet (docs/plan-roadmap.md, part 8).
 */
export interface OtherBranch {
  /** Every name of its commit, local branches first. */
  readonly names: readonly string[]
  readonly sha: string
  /** When its last commit was made, ISO 8601. */
  readonly date: string
  readonly adrs: readonly BranchAdr[]
}

export interface BranchOverview {
  readonly branches: readonly OtherBranch[]
  /** The branches git could not read: what they do is not known. */
  readonly unread: readonly string[]
  /** Git could not list the branches. */
  readonly failed?: boolean
}

export type CommitResult =
  | {
      readonly committed: true
      readonly sha: string
      readonly repository: OpenRepository
      /** What git said although it made the commit: a hook after it failed. */
      readonly said?: string
    }
  | { readonly committed: false; readonly reason: string }

export type PlanResult =
  | { readonly ok: true; readonly change: PlannedChange }
  /** `said`: the reason as a code, where `core` or `structure` gave it one. */
  | { readonly ok: false; readonly reason: string; readonly said?: Said }

/** An export that was written: where it is, to open, and how many ADRs it holds. */
export type ExportResult =
  | { readonly ok: true; readonly path: string; readonly adrs: number }
  | { readonly ok: false; readonly reason: string }

/** What an export is written as: web pages into a folder, or one PDF file. */
export type ExportKind = 'site' | 'pdf'

/** Where the person picked for an export, held by the main process and named by a ticket. */
export type ExportDestination =
  { readonly ok: true; readonly ticket: string } | { readonly ok: false; readonly reason: string }

export type ApplyResult =
  | { readonly applied: true; readonly repository: OpenRepository }
  | {
      readonly applied: false
      readonly reason: string
      /** Undoing failed as well: some files are not as they were (ADR-0015). */
      readonly inPart?: true
    }

/**
 * An Annotation as the window shows it (docs/review-format.md), with what became of its Anchor
 * when it was last looked for: unchanged, moved, or orphaned. Absent for one whose Anchor cannot
 * be read: a Problem says why.
 */
export interface AnnotationView extends Annotation {
  readonly found?: Found
}

/**
 * The Annotations of a repository and their Problems, read in the main process with their
 * Anchors found again in the code as it is on disk (docs/plan-vision.md, part 9). Derived: it is
 * read again when HEAD, the Annotations or the files they are about change.
 */
export interface ReviewOverview {
  readonly repositoryId: string
  /** The directory of the Annotations; `undefined` while it cannot be used. */
  readonly directory: string | undefined
  /** `.arch/config.yml` cannot be read: no Annotation is read until it is fixed. */
  readonly configUnreadable: boolean
  /** By their IDs. */
  readonly annotations: readonly AnnotationView[]
  /** Every Problem of Review: of the files, of the Traces to ADRs, and the orphaned. */
  readonly problems: readonly ReviewProblem[]
  /** The commit HEAD pointed at when the Anchors were looked for; `undefined` without one. */
  readonly head: string | undefined
  /** When they were looked for, in milliseconds since the epoch. */
  readonly foundAt: number
  /** They are looked for again: what is shown is the last result. */
  readonly finding: boolean
}

export type ReviewResult =
  | { readonly ok: true; readonly overview: ReviewOverview }
  | { readonly ok: false; readonly reason: string }

/** Lines of a Source File as a person selected them: the first and the last, counted from 1. */
export interface SelectedLines {
  readonly path: string
  readonly start: number
  readonly end: number
}

/**
 * A write to the Annotations, as the window asks for it (docs/review-format.md, section 5).
 * `review` plans it against the disk as it is; what the window says of an Anchor is never taken
 * for it: the lines are read from the disk, and a moved Anchor is looked for again.
 */
export type ReviewRequest =
  | ({
      readonly kind: 'create'
      readonly type: AnnotationType
      readonly text: string
      readonly author: string
      /** ADRs, as `cites` names them. */
      readonly cites: readonly string[]
    } & SelectedLines)
  | { readonly kind: 'reply'; readonly id: string; readonly text: string; readonly author: string }
  | { readonly kind: 'state'; readonly id: string; readonly state: 'open' | 'resolved' }
  | { readonly kind: 'update-anchor'; readonly id: string }
  | ({ readonly kind: 'attach'; readonly id: string } & SelectedLines)
  | { readonly kind: 'cite' | 'uncite'; readonly id: string; readonly adr: string }

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
  /** Plan a commit of an ADR's files. Nothing is committed until the commit is confirmed. */
  planCommit(repositoryId: string, logPath: string, adrId: string): Promise<CommitPlanResult>
  /**
   * Commit a planned commit with the related files chosen out of those it offered, by their
   * paths, and the message as the person left it.
   */
  commit(planId: string, include: readonly string[], message: string): Promise<CommitResult>
  discardCommit(planId: string): Promise<void>
  /**
   * The ADRs that other branches add or decide, read from git without checking anything out.
   * `undefined` without git.
   */
  branches(repositoryId: string): Promise<BranchOverview | undefined>
  /** An ADR as the commit of a branch has it, read from git; `undefined` for any other file. */
  branchAdr(repositoryId: string, sha: string, path: string): Promise<Adr | undefined>
  /**
   * Ask the person where to export the Decision Logs: a folder for web pages, a file for a PDF
   * with one ADR per page (docs/plan-roadmap.md, part 10). The place stays in the main process;
   * the window gets a ticket for it, or `undefined` when the person picks none.
   */
  pickExport(repositoryId: string, kind: ExportKind): Promise<ExportDestination | undefined>
  /** Export to the place a ticket names, once. */
  exportTo(
    ticket: string,
    /** The Mermaid blocks of the ADRs as the window drew them; a block without one stays code. */
    diagrams: readonly DrawnDiagram[]
  ): Promise<ExportResult>
  /** Open what an export wrote, as the system opens such a file; nothing else. */
  openExported(path: string): Promise<void>
  /** Write a planned change, unless a file it touches changed on disk in the meantime. */
  applyChange(changeId: string): Promise<ApplyResult>
  discardChange(changeId: string): Promise<void>
  /** Open a web link in the system browser. Anything but http and https is ignored. */
  openExternal(url: string): Promise<void>
  /** Called whenever files of an open repository changed on disk. Returns a function that stops listening. */
  onRepositoryChanged(listener: (repository: OpenRepository) => void): () => void
  /**
   * One level of the repository's Components, analysed off the main thread the first time it
   * is asked for. Below a Component that is no longer there, the top level comes back.
   */
  structureView(
    repositoryId: string,
    parent: string | undefined,
    tests: boolean,
    /** The Components whose rows the matrix shows expanded. */
    expanded: readonly string[]
  ): Promise<StructureResult>
  /**
   * The text of a Source File, by the path the analysis gave it. Nothing else is read: the
   * main process looks the path up among the Source Files of its analysis first.
   */
  readSourceFile(repositoryId: string, path: string): Promise<SourceFileResult>
  /**
   * Every Component and Source File of the repository, and the Problems of its declaration,
   * from the last analysis — analysed off the main thread the first time it is asked for.
   */
  /**
   * What Structure knows of the whole repository. `fresh` asks for an analysis of now where
   * Structure is not open: for the Problems of the repository, and the search.
   */
  structureOutline(repositoryId: string, fresh?: boolean): Promise<OutlineResult>
  /** Called when the analysis of a repository changed: files changed, or a change was applied. */
  onStructureChanged(listener: (repositoryId: string) => void): () => void
  /** Plan writing the Draft into `.arch/components.yml`. Nothing is written until the change is applied. */
  planAdopt(repositoryId: string): Promise<PlanResult>
  /** Plan the Repair of a Problem of the declaration. Nothing is written until the change is applied. */
  planStructureRepair(repositoryId: string, problem: StructureProblem): Promise<PlanResult>
  /**
   * Plan giving a declared Component a new segment, together with every Trace that names it.
   * Nothing is written until the change is applied.
   */
  planRename(repositoryId: string, component: string, segment: string): Promise<PlanResult>
  /** Say whether the window holds text that is not on disk. While it does, closing it asks first. */
  setUnsaved(unsaved: boolean): Promise<void>
  /** Say the language of the window, so that what the main process says is said in it too. */
  setLanguage(language: WindowLanguage): Promise<void>
  /**
   * Load the window again, as after a change of its language. The window cannot do that itself:
   * the main process lets nothing navigate inside it.
   */
  reloadWindow(): Promise<void>
  /** Called when the window is to close while it holds unsaved text. Nothing closes until it was answered. */
  onCloseRequested(listener: () => void): () => void
  /** What the person said: close the window, whatever it holds — or keep it, and forget that anything was to quit. */
  answerCloseRequest(close: boolean): Promise<void>

  // Review (docs/plan-vision.md, part 9)
  /**
   * The Annotations of the repository with their Anchors as last found again: the last result
   * while they are looked for again, in the background, after HEAD or the files changed.
   */
  reviewOverview(repositoryId: string): Promise<ReviewResult>
  /** Called when the Annotations of a repository are looked for again, and once they are found. */
  onReviewChanged(listener: (repositoryId: string) => void): () => void
  /** Plan a write to the Annotations. Nothing is written until the change is applied. */
  planReview(repositoryId: string, request: ReviewRequest): Promise<PlanResult>
  /** Who git says the person is, `user.name`: the author a new Annotation or Reply proposes. */
  gitUserName(repositoryId: string): Promise<string | undefined>
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
  planAdopt: 'change:plan-adopt',
  planStructureRepair: 'change:plan-structure-repair',
  planRename: 'change:plan-rename',
  structureView: 'structure:view',
  readSourceFile: 'structure:read-source-file',
  structureOutline: 'structure:outline',
  structureChanged: 'structure:changed',
  listTemplates: 'templates:list',
  history: 'git:history',
  historyChange: 'git:history-change',
  planCommit: 'git:plan-commit',
  commit: 'git:commit',
  discardCommit: 'git:discard-commit',
  branches: 'git:branches',
  branchAdr: 'git:branch-adr',
  pickExport: 'export:pick',
  exportTo: 'export:write',
  openExported: 'export:open',
  applyChange: 'change:apply',
  discardChange: 'change:discard',
  openExternal: 'shell:open-external',
  setUnsaved: 'window:set-unsaved',
  setLanguage: 'window:set-language',
  reloadWindow: 'window:reload',
  closeRequested: 'window:close-requested',
  answerCloseRequest: 'window:answer-close-request',
  reviewOverview: 'review:overview',
  reviewChanged: 'review:changed',
  planReview: 'review:plan',
  gitUserName: 'review:user-name'
} as const
