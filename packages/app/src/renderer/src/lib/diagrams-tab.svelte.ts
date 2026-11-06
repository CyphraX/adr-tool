/**
 * The Diagrams module of the window (docs/plan-vision.md, part 7): what a tab holds of its
 * Diagrams, and what the window does with them. A Diagram is read from its text here, with the
 * same `readDiagram` as everywhere; what is changed on the canvas is held as edits
 * (`DiagramEdit`) applied to that text, line by line, until **Save** plans them against the
 * file as it is on disk then and the person sees the preview. Nothing here writes.
 */
import {
  editDiagramText,
  newDiagramText,
  readDiagram,
  type Diagram,
  type DiagramEdit,
  type DiagramProblem,
  type SuggestedConnection,
  type UnreadableDiagram,
  type ViewLevel
} from '@adr-tool/diagrams'
import { joinPath } from '@adr-tool/kernel'
import type { DiagramEntry, DiagramLook, DiagramsOverview } from '../../../shared/diagrams'
import type { OpenRepository, PlannedChange, PlanResult } from '../../../shared/ipc'
import { componentsOfLevel, idFromName, isElementId, newDiagramOf } from './diagram-canvas'
import { wordRefusal } from './diagram-words'
import type { Module } from './modules'
import { wordOf } from './said'
import type { Review } from './state.svelte'
import { t } from './strings'

/** What is selected on the canvas: a box, or the line of a connection. */
export type DiagramSelection =
  | { readonly kind: 'element'; readonly id: string }
  | { readonly kind: 'connection'; readonly from: string; readonly to: string }

/** The edits of the Diagram on the canvas that are not saved, and the text they make. */
interface Held {
  readonly path: string
  /** The text of the file the edits apply to, as it was read. */
  base: string
  edits: DiagramEdit[]
  /** `base` with the edits applied: what the canvas shows. */
  text: string
  /** The file changed on disk, and the edits do not apply to it any more: why. */
  conflict: string | undefined
}

/** What a change of the Diagrams module did once it is applied, for the window to follow. */
export type DiagramApplied =
  /** The edits of the canvas are in the file now. */
  | { readonly kind: 'saved'; readonly repositoryId: string; readonly path: string }
  /** A new Diagram is there: the canvas opens it. */
  | { readonly kind: 'created'; readonly repositoryId: string; readonly path: string }
  /** A picture or a Repair is written. */
  | { readonly kind: 'written'; readonly repositoryId: string }

/** How long the canvas waits after an edit before it asks the code about the Diagram again. */
const LOOK_DELAY_MS = 150

/** What one tab holds of its Diagrams; the window switches modules and finds it as it was. */
export class DiagramsTab {
  /** The last answer of the main process, kept while the next one is asked for. */
  overview = $state.raw<DiagramsOverview | undefined>(undefined)
  reading = $state(false)
  failed = $state<string | undefined>(undefined)
  /** Counts the requests, so that an answer that is overtaken is dropped. */
  asked = 0
  /** The module was opened: the Diagrams come with their Drift, and it is kept current. */
  opened = $state(false)
  /** The Diagram on the canvas, by its path. */
  path = $state<string | undefined>(undefined)
  /** The centre shows the Problems of the repository instead of the canvas. */
  problems = $state(false)
  selection = $state<DiagramSelection | undefined>(undefined)
  /** The size the canvas draws at, and of which Diagram: a Diagram opens fitted to the pane. */
  zoom = $state<{ readonly path: string; readonly scale: number } | undefined>(undefined)
  /**
   * Whether "What the Diagram says" stands beside the canvas; `undefined` until it is chosen,
   * when it stands there only in a window wide enough for both.
   */
  saysShown = $state<boolean | undefined>(undefined)
  held = $state<Held | undefined>(undefined)
  /** What the code says of the Diagram as the canvas holds it, and of which text. */
  look = $state.raw<{ readonly text: string; readonly look: DiagramLook } | undefined>(undefined)
  lookAsked = 0
  lookTimer: ReturnType<typeof setTimeout> | undefined = undefined

  readonly entry = $derived<DiagramEntry | undefined>(
    this.overview?.diagrams.find((diagram) => diagram.path === this.path)
  )

  /** The text on the canvas: the file's, with the edits that are not saved. */
  readonly text = $derived.by((): string | undefined => {
    const entry = this.entry
    if (!entry) return undefined
    return this.held?.path === entry.path ? this.held.text : entry.text
  })

  readonly diagram = $derived.by((): Diagram | UnreadableDiagram | undefined =>
    this.entry && this.text !== undefined ? readDiagram(this.entry.path, this.text) : undefined
  )

  /** What the code says of the text on the canvas; the file's Drift until it has answered. */
  readonly current = $derived.by(
    (): Pick<DiagramLook, 'drift' | 'suggestions' | 'problems'> | undefined => {
      if (this.look && this.look.text === this.text) return this.look.look
      if (!this.entry?.drift || this.held?.path === this.entry.path) return undefined
      return { drift: this.entry.drift, suggestions: [], problems: this.entry.problems }
    }
  )

  /** How many edits are not saved. */
  readonly unsaved = $derived(this.held?.edits.length ?? 0)
}

/** A new Diagram as its dialog describes it. */
export interface CreatingDiagram {
  readonly repositoryId: string
  level: ViewLevel
  scope: string | undefined
  title: string
  id: string
  /** The person wrote the ID: it no longer follows the title. */
  idWritten: boolean
  /** The connections the code has between the Components of the level; `undefined` while asked. */
  suggestions: readonly SuggestedConnection[] | undefined
  failed: string | undefined
  asked: number
}

/** What the module needs of the window: its tabs, and the dialog that previews and asks. */
export interface DiagramsHost {
  readonly tabs: readonly DiagramsHostTab[]
  readonly active: DiagramsHostTab | undefined
  review: Review | undefined
  present(review: Review): void
}

export interface DiagramsHostTab {
  readonly repository: OpenRepository
  module: Module
  readonly diagrams: DiagramsTab
}

/** A plain copy of what is reactive, which can cross to the main process. */
const plain = <T>(value: T): T => $state.snapshot(value) as T

export class DiagramsModule {
  /** The dialog of a new Diagram, while it is open. */
  creating = $state<CreatingDiagram | undefined>(undefined)

  constructor(private readonly host: DiagramsHost) {}

  /** Whether a tab holds edits of a Diagram that are not saved. */
  get unsaved(): boolean {
    return this.host.tabs.some((tab) => tab.diagrams.unsaved > 0)
  }

  /** Ask for the Diagrams of a tab, unless they are known or asked for already: for the count of the Problems. */
  need(tab: DiagramsHostTab | undefined): void {
    if (tab && !tab.diagrams.overview && !tab.diagrams.reading) void this.load(tab)
  }

  /** The module comes to the front of a tab: the Diagrams with their Drift. */
  open(tab: DiagramsHostTab): void {
    tab.diagrams.opened = true
    void this.load(tab)
  }

  /** Ask for the Diagrams of a tab — with their Drift once the module was opened. */
  async load(tab: DiagramsHostTab): Promise<void> {
    const diagrams = tab.diagrams
    const asked = ++diagrams.asked
    diagrams.reading = true
    const result = await window.api
      .diagrams(tab.repository.id, diagrams.opened)
      .catch((error: unknown) => ({ ok: false as const, reason: String(error) }))
    if (asked !== diagrams.asked) return
    diagrams.reading = false
    if (!result.ok) {
      diagrams.failed = result.reason
      return
    }
    diagrams.failed = undefined
    diagrams.overview = result.overview
    const listed = result.overview.diagrams
    if (!listed.some((entry) => entry.path === diagrams.path)) {
      // Gone, or not chosen yet: the first one; edits that are held stay with their file.
      diagrams.path = diagrams.held?.path ?? listed[0]?.path
    }
    this.rebase(tab)
    this.keepSelection(tab)
    if (diagrams.opened) this.requestLook(tab)
  }

  /** The files changed on disk: what the window holds of the Diagrams is read again. */
  repositoryChanged(tab: DiagramsHostTab): void {
    if (tab.diagrams.overview || tab.diagrams.reading) void this.load(tab)
  }

  /** The code was analysed again: the Drift follows it. */
  structureChanged(tab: DiagramsHostTab): void {
    if (tab.diagrams.opened) void this.load(tab)
  }

  /** Show another Diagram on the canvas. Edits of the one there that are not saved are asked about first. */
  show(path: string): void {
    const tab = this.host.active
    if (!tab) return
    const diagrams = tab.diagrams
    if (diagrams.path === path && !diagrams.problems) return
    const go = (): void => {
      diagrams.path = path
      diagrams.problems = false
      diagrams.selection = undefined
      this.requestLook(tab)
    }
    if (diagrams.held && diagrams.held.path !== path) this.leave(tab, go)
    else go()
  }

  /** The Problems of the repository, in the centre of the module. */
  showProblems(): void {
    const tab = this.host.active
    if (tab) tab.diagrams.problems = true
  }

  /** Back from the Problems of the repository to the canvas. */
  closeProblems(): void {
    const tab = this.host.active
    if (tab) tab.diagrams.problems = false
  }

  /** Open a Diagram from elsewhere — the page of a Component, the search, the Problems —, with `selection` selected. */
  reveal(path: string, selection?: DiagramSelection, problems = false): void {
    const tab = this.host.active
    if (!tab) return
    const arrive = (): void => {
      tab.module = 'diagrams'
      const diagrams = tab.diagrams
      diagrams.path = path
      diagrams.problems = problems
      diagrams.selection = selection
      if (!diagrams.opened) this.open(tab)
      else this.requestLook(tab)
    }
    const held = tab.diagrams.held
    if (held && held.path !== path) this.leave(tab, arrive)
    else arrive()
  }

  select(selection: DiagramSelection | undefined): void {
    const tab = this.host.active
    if (tab) tab.diagrams.selection = selection
  }

  /** Draw the Diagram on the canvas at another size. */
  zoomTo(scale: number): void {
    const diagrams = this.host.active?.diagrams
    if (diagrams?.path !== undefined) diagrams.zoom = { path: diagrams.path, scale }
  }

  /** Show "What the Diagram says" beside the canvas, or fold it away. */
  showSays(shown: boolean): void {
    const diagrams = this.host.active?.diagrams
    if (diagrams) diagrams.saysShown = shown
  }

  /**
   * Change the Diagram on the canvas: the edit applies to its text at once, line by line, or is
   * refused with the sentence of why. Nothing is written until **Save**.
   */
  edit(edit: DiagramEdit): boolean {
    const tab = this.host.active
    const diagrams = tab?.diagrams
    const entry = diagrams?.entry
    if (!tab || !diagrams || !entry || diagrams.text === undefined) return false
    const text = diagrams.text
    try {
      const next = editDiagramText(entry.path, text, [edit])
      if (next === text) return true
      const held = diagrams.held?.path === entry.path ? diagrams.held : undefined
      diagrams.held = held
        ? { ...held, edits: [...held.edits, edit], text: next }
        : { path: entry.path, base: entry.text, edits: [edit], text: next, conflict: undefined }
      this.keepSelection(tab)
      this.requestLook(tab)
      return true
    } catch (error) {
      this.host.present({
        kind: 'refused',
        title: t.diagrams.review.edit(entry.id),
        reason: wordRefusal(error)
      })
      return false
    }
  }

  /** Take back the last edit that is not saved. */
  undo(): void {
    const tab = this.host.active
    const held = tab?.diagrams.held
    if (!tab || !held) return
    const edits = held.edits.slice(0, -1)
    if (edits.length === 0) tab.diagrams.held = undefined
    else {
      try {
        tab.diagrams.held = {
          ...held,
          edits,
          text: editDiagramText(held.path, held.base, plain(edits))
        }
      } catch {
        // The edits applied one by one before; they do so again.
        return
      }
    }
    this.keepSelection(tab)
    this.requestLook(tab)
  }

  /** Forget the edits that are not saved. */
  discard(): void {
    const tab = this.host.active
    if (!tab) return
    tab.diagrams.held = undefined
    this.keepSelection(tab)
    this.requestLook(tab)
  }

  /** Plan writing the edits into the file, line by line; the preview shows them. */
  async save(): Promise<void> {
    const tab = this.host.active
    const held = tab?.diagrams.held
    const entry = tab?.diagrams.entry
    if (!tab || !held || !entry || held.path !== entry.path) return
    const texts = t.diagrams.review.save
    const plan = await window.api.planDiagramEdit({
      repositoryId: tab.repository.id,
      path: held.path,
      edits: plain(held.edits)
    })
    this.present(plan, texts.title(entry.id), texts.refused(entry.id), texts.action, {
      kind: 'saved',
      repositoryId: tab.repository.id,
      path: held.path
    })
  }

  /** Plan the picture of the Diagram on the canvas, as the file has it, beside it. */
  async exportSvg(): Promise<void> {
    const tab = this.host.active
    const entry = tab?.diagrams.entry
    if (!tab || !entry || tab.diagrams.unsaved > 0) return
    const texts = t.diagrams.review.export
    const plan = await window.api.planDiagramExport(tab.repository.id, entry.path)
    if (plan.ok && plan.change.changeSet.files.length === 0) {
      void window.api.discardChange(plan.change.changeId)
      this.host.present({
        kind: 'refused',
        title: texts.title(entry.picture),
        reason: texts.current(entry.picture)
      })
      return
    }
    this.present(plan, texts.title(entry.picture), texts.refused(entry.id), texts.action, {
      kind: 'written',
      repositoryId: tab.repository.id
    })
  }

  /** Plan the Repair of a Problem of a Diagram. */
  async repair(problem: DiagramProblem): Promise<void> {
    const tab = this.host.active
    if (!tab) return
    const id = problem.path.slice(problem.path.lastIndexOf('/') + 1).replace(/\.yml$/, '')
    const texts = t.diagrams.review.repair
    const plan = await window.api.planDiagramRepair(tab.repository.id, plain(problem))
    this.present(plan, texts.title(id), texts.refused(id), texts.action, {
      kind: 'written',
      repositoryId: tab.repository.id
    })
  }

  /** Open the dialog of a new Diagram, at the container level. */
  startNew(): void {
    const tab = this.host.active
    if (!tab) return
    this.creating = {
      repositoryId: tab.repository.id,
      level: 'container',
      scope: undefined,
      title: '',
      id: '',
      idWritten: false,
      suggestions: undefined,
      failed: undefined,
      asked: 0
    }
    void this.lookForNew()
  }

  /** The level or the scope of the new Diagram changed: what it would show is asked for again. */
  describeNew(change: Partial<Pick<CreatingDiagram, 'level' | 'scope' | 'title' | 'id'>>): void {
    const creating = this.creating
    if (!creating) return
    const looks = change.level !== undefined || 'scope' in change
    Object.assign(creating, change)
    if (change.id !== undefined) creating.idWritten = change.id !== ''
    if (change.title !== undefined && !creating.idWritten) {
      creating.id = change.title.trim() === '' ? '' : idFromName(change.title)
    }
    if (looks) void this.lookForNew()
  }

  cancelNew(): void {
    this.creating = undefined
  }

  /** The Components the new Diagram would show, and the connections the code has between them. */
  private async lookForNew(): Promise<void> {
    const creating = this.creating
    const tab = this.host.tabs.find((one) => one.repository.id === creating?.repositoryId)
    if (!creating || !tab) return
    const asked = ++creating.asked
    creating.suggestions = undefined
    creating.failed = undefined
    const declared = tab.diagrams.overview?.declared.components ?? []
    const shown = componentsOfLevel(declared, creating.level, creating.scope)
    if (creating.level === 'system-context' || shown.length < 2) {
      creating.suggestions = []
      return
    }
    // The text of a Diagram that shows them, for the code to say what connects them.
    const text = newDiagramText({
      id: 'new',
      level: creating.level,
      ...(creating.scope !== undefined && { scope: creating.scope }),
      elements: shown.map((component) => ({
        kind: 'component',
        id: component.id,
        at: { x: 0, y: 0 }
      })),
      connections: []
    })
    const result = await window.api
      .diagramLook(creating.repositoryId, undefined, text)
      .catch((error: unknown) => ({ ok: false as const, reason: String(error) }))
    if (this.creating !== creating || creating.asked !== asked) return
    if (result.ok) creating.suggestions = result.look.suggestions
    else creating.failed = result.reason
  }

  /** Whether the new Diagram can be planned as it is described. */
  get canCreate(): boolean {
    const creating = this.creating
    if (!creating || !isElementId(creating.id) || creating.suggestions === undefined) return false
    return creating.level !== 'component' || creating.scope !== undefined
  }

  /** Plan the new Diagram: its file, whole, in the preview. */
  async create(): Promise<void> {
    const creating = this.creating
    const tab = this.host.tabs.find((one) => one.repository.id === creating?.repositoryId)
    const overview = tab?.diagrams.overview
    if (!creating || !tab || !overview || !this.canCreate) return
    const repository = tab.repository
    const spec = newDiagramOf({
      id: creating.id,
      title: creating.title,
      level: creating.level,
      scope: creating.scope,
      repository: { id: idFromName(repository.name), name: repository.name },
      declared: overview.declared.components,
      suggestions: creating.suggestions ?? []
    })
    const plan = await window.api.planNewDiagram({
      repositoryId: repository.id,
      diagram: plain(spec)
    })
    if (this.host.review?.kind === 'confirm') {
      if (plan.ok) void window.api.discardChange(plan.change.changeId)
      return
    }
    this.creating = undefined
    const texts = t.diagrams.review.create
    const path =
      overview.directory === undefined ? '' : joinPath(overview.directory, `${spec.id}.yml`)
    this.present(plan, texts.title(spec.id), texts.refused, texts.action, {
      kind: 'created',
      repositoryId: repository.id,
      path
    })
  }

  /** A change of the module was applied: the window follows it. */
  applied(applied: DiagramApplied, change: PlannedChange): void {
    const tab = this.host.tabs.find((one) => one.repository.id === applied.repositoryId)
    if (!tab) return
    const diagrams = tab.diagrams
    if (applied.kind === 'saved' && diagrams.held?.path === applied.path) {
      // What the canvas holds is on disk now: the file's text is the edits' text.
      const after = change.changeSet.files.find((file) => file.path === applied.path)?.after
      const overview = diagrams.overview
      if (overview && after !== undefined) {
        diagrams.overview = {
          ...overview,
          diagrams: overview.diagrams.map((entry) =>
            entry.path === applied.path ? { ...entry, text: after } : entry
          )
        }
      }
      diagrams.held = undefined
    }
    if (applied.kind === 'created') {
      diagrams.path = applied.path
      diagrams.problems = false
      diagrams.selection = undefined
    }
    void this.load(tab)
  }

  /**
   * Do something that loses the edits of a Diagram that are not saved — of `tab`, or of every
   * tab —, asking first where there are any.
   */
  leave(tab: DiagramsHostTab | undefined, then: () => void, declined?: () => void): void {
    const holding = (tab ? [tab] : this.host.tabs).filter((one) => one.diagrams.held)
    if (holding.every((one) => one.diagrams.unsaved === 0)) {
      for (const one of holding) one.diagrams.held = undefined
      return then()
    }
    const texts = t.diagrams.review.discard
    const id = holding[0]!.diagrams.held!.path.replace(/^.*\//, '').replace(/\.yml$/, '')
    this.host.review = {
      kind: 'confirm',
      title: texts.title,
      reason: texts.reason(id),
      action: texts.action,
      proceed: () => {
        for (const one of holding) {
          one.diagrams.held = undefined
          this.keepSelection(one)
        }
        then()
      },
      ...(declined && { declined })
    }
  }

  /** Ask the code about the Diagram on the canvas, soon: edits come in bursts. */
  requestLook(tab: DiagramsHostTab): void {
    const diagrams = tab.diagrams
    clearTimeout(diagrams.lookTimer)
    if (!diagrams.opened) return
    diagrams.lookTimer = setTimeout(() => void this.lookAt(tab), LOOK_DELAY_MS)
  }

  private async lookAt(tab: DiagramsHostTab): Promise<void> {
    const diagrams = tab.diagrams
    const [path, text] = [diagrams.entry?.path, diagrams.text]
    if (path === undefined || text === undefined) return
    const asked = ++diagrams.lookAsked
    const result = await window.api
      .diagramLook(tab.repository.id, path, text)
      .catch(() => undefined)
    if (asked !== diagrams.lookAsked || !result?.ok) return
    diagrams.look = { text, look: result.look }
  }

  /** The file changed on disk under edits that are held: they are applied to it as it is now. */
  private rebase(tab: DiagramsHostTab): void {
    const diagrams = tab.diagrams
    const held = diagrams.held
    if (!held) return
    const entry = diagrams.overview?.diagrams.find((one) => one.path === held.path)
    if (!entry) {
      held.conflict = t.diagrams.gone(held.path)
      return
    }
    if (entry.text === held.base) return
    try {
      held.text = editDiagramText(held.path, entry.text, plain(held.edits))
      held.base = entry.text
      held.conflict = undefined
    } catch (error) {
      held.conflict = wordRefusal(error)
    }
  }

  /** What is selected stays selected only while the Diagram still has it. */
  private keepSelection(tab: DiagramsHostTab): void {
    const diagrams = tab.diagrams
    const selection = diagrams.selection
    const diagram = diagrams.diagram
    if (!selection || !diagram?.readable) {
      if (selection && !diagram) diagrams.selection = undefined
      return
    }
    const there =
      selection.kind === 'element'
        ? diagram.elements.some((element) => element.id === selection.id)
        : diagram.connections.some(
            (connection) => connection.from === selection.from && connection.to === selection.to
          )
    if (!there) diagrams.selection = undefined
  }

  /** Show what a plan came back with: the preview, or why it cannot be done. */
  private present(
    plan: PlanResult,
    title: string,
    refused: string,
    action: string,
    applied: DiagramApplied
  ): void {
    this.host.present(
      plan.ok
        ? { kind: 'change', title, action, change: plan.change, applying: false, diagram: applied }
        : { kind: 'refused', title: refused, reason: wordOf(plan.said, plan.reason) }
    )
  }
}
