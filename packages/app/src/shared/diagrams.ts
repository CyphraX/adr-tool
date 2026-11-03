import type { UnreadableConfig } from '@adr-tool/kernel'
import type {
  DiagramEdit,
  DiagramProblem,
  Drift,
  NewDiagram,
  SuggestedConnection
} from '@adr-tool/diagrams'
import type { DeclaredComponent } from '@adr-tool/structure/model'
import type { PlanResult } from './ipc'

/**
 * What the Diagrams module of the window is told by the main process (docs/diagrams-format.md):
 * the Diagrams of a repository as their files say them, with their Problems and — once the code
 * is analysed — their Drift. The window reads each Diagram from its text itself, with the same
 * `readDiagram`, and holds what is changed on the canvas as edits until they are saved.
 */
export interface DiagramsOverview {
  readonly repositoryId: string
  /** Where the Diagrams are; `undefined` while none is looked for. */
  readonly directory: string | undefined
  /** The one Problem of `.arch/config.yml`, which the kernel says once for every module. */
  readonly config?: UnreadableConfig
  /** What is wrong with the key `diagrams` of `.arch/config.yml`. */
  readonly problems: readonly DiagramProblem[]
  /** The declaration of Components the Diagrams are read against. */
  readonly declared: DiagramsDeclaration
  readonly diagrams: readonly DiagramEntry[]
  /** The code is analysed: the Drift of each Diagram is there. */
  readonly analysed: boolean
}

/** The Components as the Diagrams see them: declared, the Draft, or a declaration that cannot be read. */
export interface DiagramsDeclaration {
  readonly origin: 'declared' | 'draft'
  /** `.arch/components.yml` is there and cannot be read: no picture is drawn as the export would. */
  readonly unreadable: boolean
  /** The declared Components, each with its children; none on a Draft. */
  readonly components: readonly DeclaredComponent[]
}

/** One Diagram of the repository, as its file is on disk. */
export interface DiagramEntry {
  readonly id: string
  readonly path: string
  /** Where its picture is, or goes: beside it. */
  readonly picture: string
  /** Its text, as it was read: what the window's edits apply to. */
  readonly text: string
  readonly readable: boolean
  readonly title?: string
  /** Of its file, against the declaration, and of its picture. */
  readonly problems: readonly DiagramProblem[]
  /** Its Drift; `undefined` until the code is analysed. */
  readonly drift?: readonly Drift[]
}

/** What the code says of a Diagram as the window holds it, saved or not. */
export interface DiagramLook {
  /** Of its file and against the declaration. */
  readonly problems: readonly DiagramProblem[]
  readonly drift: readonly Drift[]
  /** The connections the code has between the Components it shows, drawn or not. */
  readonly suggestions: readonly SuggestedConnection[]
  /** Whether the code was analysed for it; without, there is no Drift and no suggestion. */
  readonly analysed: boolean
}

export type DiagramsResult =
  | { readonly ok: true; readonly overview: DiagramsOverview }
  | { readonly ok: false; readonly reason: string }

export type DiagramLookResult =
  | { readonly ok: true; readonly look: DiagramLook }
  | { readonly ok: false; readonly reason: string }

/** The edits of the canvas, to plan against the Diagram on disk. */
export interface DiagramEditRequest {
  readonly repositoryId: string
  /** The path of one of the Diagrams the overview listed. */
  readonly path: string
  readonly edits: readonly DiagramEdit[]
}

/** A new Diagram, as the window starts it. */
export interface NewDiagramRequest {
  readonly repositoryId: string
  readonly diagram: NewDiagram
}

/**
 * The Diagrams module's part of the bridge (shared/ipc.ts, `Api`). The window names a Diagram
 * by the path the overview gave it, and the main process plans only for a path that is one; what
 * it plans is held, and applied by its id, like every other change.
 */
export interface DiagramsApi {
  /**
   * The Diagrams of a repository with their Problems. With `analysed`, after the code is
   * analysed, with their Drift — and from then on the analysis is kept current, as for an open
   * Structure: `onStructureChanged` says when it changed.
   */
  diagrams(repositoryId: string, analysed: boolean): Promise<DiagramsResult>
  /**
   * What the code says of a Diagram as the window holds it: its Drift and suggested
   * connections. Without a path, of a Diagram that is being started and has no file yet.
   */
  diagramLook(
    repositoryId: string,
    path: string | undefined,
    text: string
  ): Promise<DiagramLookResult>
  /** Plan the edits of the canvas, line by line. Nothing is written until the change is applied. */
  planDiagramEdit(request: DiagramEditRequest): Promise<PlanResult>
  /** Plan a new Diagram as its own file. Nothing is written until the change is applied. */
  planNewDiagram(request: NewDiagramRequest): Promise<PlanResult>
  /** Plan the picture of a Diagram as SVG beside it. Nothing is written until the change is applied. */
  planDiagramExport(repositoryId: string, path: string): Promise<PlanResult>
  /** Plan the Repair of a Problem of a Diagram. Nothing is written until the change is applied. */
  planDiagramRepair(repositoryId: string, problem: DiagramProblem): Promise<PlanResult>
}

export const DIAGRAMS_CHANNEL = {
  diagrams: 'diagrams:list',
  diagramLook: 'diagrams:look',
  planDiagramEdit: 'diagrams:plan-edit',
  planNewDiagram: 'diagrams:plan-new',
  planDiagramExport: 'diagrams:plan-export',
  planDiagramRepair: 'diagrams:plan-repair'
} as const
