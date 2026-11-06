/**
 * What a person does with Annotations in the window (docs/plan-vision.md, part 9): look at them,
 * filter and select them, read the code they are about, and write — a new Annotation on lines
 * selected in the code viewer, a Reply, Resolve and Reopen, Update the Anchor, Attach again,
 * Cite and Uncite —, each planned by the main process and shown in the change dialog first
 * (docs/adr/0004-operations-return-change-sets.md). The state is the tab's (`ReviewTab`) and the
 * forms' (`reviewForms`); the change dialog is the app's.
 */
import { untrack } from 'svelte'
import type { AnnotationState } from '@adr-tool/review'
import type { PlanResult, ReviewRequest } from '../../../shared/ipc'
import {
  attachPathOf,
  keptSelection,
  placeOf,
  type Facet,
  type Place,
  type ReviewFilter
} from './review'
import { reviewForms } from './review-tab.svelte'
import { wordOf } from './said'
import { app } from './state.svelte'
import { t } from './strings'

type Tab = NonNullable<typeof app.active>

const tabOf = (repositoryId: string): Tab | undefined =>
  app.tabs.find((tab) => tab.repository.id === repositoryId)

class Reviewing {
  /** Who git says the person is, by repository: what a new Annotation and a Reply propose. */
  private readonly authors = new Map<string, Promise<string | undefined>>()

  /**
   * Follow the main process: it says when the Annotations of a repository are looked at again,
   * and when the files Structure analyses change — the file in a code viewer may be one. The
   * Annotations of the tab in front are asked for as it comes to the front: their Problems
   * count in every sidebar.
   */
  start(): void {
    window.api.onReviewChanged((repositoryId) => {
      const tab = tabOf(repositoryId)
      if (tab && (tab.review.known || tab.review.reading)) void this.load(tab)
    })
    window.api.onStructureChanged((repositoryId) => {
      const tab = tabOf(repositoryId)
      if (tab?.review.code) void this.readCode(tab)
    })
    $effect.root(() => {
      $effect(() => {
        const tab = app.active
        if (tab) untrack(() => this.need(tab))
      })
    })
  }

  /** Ask for the Annotations of a tab: the last result comes back while they are looked for again. */
  async load(tab: Tab): Promise<void> {
    const review = tab.review
    const asked = ++review.asked
    review.reading = true
    const result = await window.api
      .reviewOverview(tab.repository.id)
      .catch((error: unknown) => ({ ok: false as const, reason: String(error) }))
    if (asked !== review.asked) return
    review.reading = false
    if (!result.ok) {
      review.failed = result.reason
      return
    }
    review.known = result.overview
    review.failed = undefined
    // What was selected may be gone: deleted, or renamed by hand.
    review.selectedId = keptSelection(review.selectedId, result.overview)
    review.attaching = keptSelection(review.attaching, result.overview)
  }

  private need(tab: Tab): void {
    if (!tab.review.known && !tab.review.reading) void this.load(tab)
  }

  /** Filter by one value of a facet, or by none: a click on the row that is chosen clears it. */
  filterBy<F extends Facet>(facet: F, value: ReviewFilter[F]): void {
    const review = app.active?.review
    if (!review) return
    const filter: Record<string, unknown> = { ...review.filter }
    if (value === undefined || filter[facet] === value) delete filter[facet]
    else filter[facet] = value
    review.filter = filter as ReviewFilter
    this.toList(review)
  }

  clearFilter(): void {
    const review = app.active?.review
    if (!review) return
    review.filter = {}
    this.toList(review)
  }

  /** The middle shows the list again: no Source File, no Problems, nothing to pick. */
  private toList(review: Tab['review']): void {
    review.problems = false
    review.picking = false
    review.code = undefined
    review.attaching = undefined
  }

  /** Back from the Problems of the repository, or from the Source Files to pick, to the list. */
  backToList(): void {
    const review = app.active?.review
    if (review) this.toList(review)
  }

  select(id: string | undefined): void {
    const review = app.active?.review
    if (review) review.selectedId = id
  }

  /**
   * Show an Annotation in Review, from wherever the window is: the search, the Problems of the
   * repository, an ADR, a Component page, the code viewer of Structure. With `code`, the middle
   * shows its lines in the code viewer.
   */
  open(id: string, code = false, fromProblems = false): void {
    const tab = app.active
    if (!tab) return
    app.searching = undefined
    // Text in the editor of an ADR is asked about first; kept, the window stays where it is.
    if (tab.module !== 'review') app.showModule('review')
    if (tab.module !== 'review') return
    tab.review.selectedId = id
    if (fromProblems) {
      // The Problems stay in the middle, as they do in Structure.
      tab.review.problems = true
      tab.review.code = undefined
      tab.review.picking = false
    } else {
      tab.review.problems = false
      tab.review.picking = false
      if (code) this.showCode(id)
      // A Source File the Annotation is not on gives way to the list.
      else if (tab.review.code && tab.review.code.path !== this.placeOfId(tab, id)?.path)
        tab.review.code = undefined
    }
  }

  private placeOfId(tab: Tab, id: string): Place | undefined {
    const annotation = tab.review.known?.annotations.find((one) => one.id === id)
    return annotation && placeOf(annotation)
  }

  /** The middle offers the Source Files Structure knows, to open one and annotate it. */
  startPicking(): void {
    const tab = app.active
    if (!tab) return
    tab.review.picking = true
    tab.review.problems = false
    tab.review.code = undefined
    app.freshOutline(tab)
  }

  /** The middle shows the lines of an Annotation in the code viewer, where they are now. */
  showCode(id: string): void {
    const tab = app.active
    const annotation = tab?.review.known?.annotations.find((one) => one.id === id)
    const place = annotation && placeOf(annotation)
    if (!tab || !place) return
    tab.review.selectedId = id
    this.openFile(place.path, place)
  }

  /** Open a Source File in the code viewer of Review, with `lines` marked and in view. */
  openFile(path: string, lines?: Pick<Place, 'start' | 'end'>): void {
    const tab = app.active
    if (!tab) return
    const marks = lines
      ? Array.from({ length: lines.end - lines.start + 1 }, (_, at) => lines.start + at)
      : []
    const open = tab.review.code?.path === path ? tab.review.code.file : undefined
    tab.review.code = { path, marks, line: lines?.start, file: open, error: undefined }
    tab.review.problems = false
    tab.review.picking = false
    if (!open) void this.readCode(tab)
  }

  /** Back from the code viewer to the list. Attaching again ends with it. */
  closeCode(): void {
    const review = app.active?.review
    if (review) this.toList(review)
  }

  private async readCode(tab: Tab): Promise<void> {
    const path = tab.review.code?.path
    if (path === undefined) return
    const result = await window.api.readSourceFile(tab.repository.id, path)
    const code = tab.review.code
    if (code?.path !== path) return
    if (result.ok) {
      code.file = result.file
      code.error = undefined
    } else {
      code.error = result.reason
    }
  }

  /** Who git says the person is, asked once per repository. */
  private author(repositoryId: string): Promise<string | undefined> {
    let known = this.authors.get(repositoryId)
    if (!known) {
      known = window.api.gitUserName(repositoryId).catch(() => undefined)
      this.authors.set(repositoryId, known)
    }
    return known
  }

  /** Open the dialog for a new Annotation on lines selected in a code viewer. */
  compose(path: string, start: number, end: number, quote: readonly string[]): void {
    const tab = app.active
    if (!tab) return
    const repositoryId = tab.repository.id
    reviewForms.composing = {
      repositoryId,
      path,
      start,
      end,
      quote,
      type: 'note',
      text: '',
      author: '',
      cites: []
    }
    void this.author(repositoryId).then((name) => {
      const composing = reviewForms.composing
      if (composing?.repositoryId === repositoryId && composing.author === '' && name)
        composing.author = name
    })
  }

  cancelComposing(): void {
    reviewForms.composing = undefined
  }

  /** Plan the new Annotation. The dialog stays beneath the preview; written, it closes. */
  async submitComposing(): Promise<void> {
    const composing = reviewForms.composing
    if (!composing || composing.text.trim() === '') return
    const texts = t.annotations.change.create
    const { repositoryId, path, start, end, type, text, author, cites } = composing
    await this.plan(
      repositoryId,
      { kind: 'create', type, text, author, cites: [...cites], path, start, end },
      { title: texts.title(path, start, end), action: texts.action, refused: texts.refused },
      (created) => {
        if (reviewForms.composing === composing) reviewForms.composing = undefined
        // The new Annotation is selected, where the window was: in the code viewer it shows.
        const id = created?.replace(/^.*\//, '').replace(/\.md$/, '')
        const tab = tabOf(repositoryId)
        if (tab && id) tab.review.selectedId = id
      }
    )
  }

  /** Start a Reply under the selected Annotation. */
  startReply(id: string): void {
    const tab = app.active
    if (!tab) return
    const repositoryId = tab.repository.id
    if (reviewForms.replying?.id === id && reviewForms.replying.repositoryId === repositoryId)
      return
    reviewForms.replying = { repositoryId, id, text: '', author: '' }
    void this.author(repositoryId).then((name) => {
      const replying = reviewForms.replying
      if (replying?.id === id && replying.author === '' && name) replying.author = name
    })
  }

  cancelReply(): void {
    reviewForms.replying = undefined
  }

  async submitReply(): Promise<void> {
    const replying = reviewForms.replying
    if (!replying || replying.text.trim() === '') return
    const texts = t.annotations.change.reply
    const { repositoryId, id, text, author } = replying
    await this.plan(
      repositoryId,
      { kind: 'reply', id, text, author },
      { title: texts.title(id), action: texts.action, refused: texts.refused(id) },
      () => {
        if (reviewForms.replying === replying) reviewForms.replying = undefined
      }
    )
  }

  /** Resolve an Annotation, or Reopen it. */
  async setState(id: string, state: AnnotationState): Promise<void> {
    const tab = app.active
    if (!tab) return
    const texts = state === 'resolved' ? t.annotations.change.resolve : t.annotations.change.reopen
    await this.plan(
      tab.repository.id,
      { kind: 'state', id, state },
      { title: texts.title(id), action: texts.action, refused: texts.refused(id) }
    )
  }

  /** Write the place a moved Annotation is found at into its Anchor. */
  async updateAnchor(id: string): Promise<void> {
    const tab = app.active
    if (!tab) return
    const texts = t.annotations.change.updateAnchor
    await this.plan(
      tab.repository.id,
      { kind: 'update-anchor', id },
      { title: texts.title(id), action: texts.action, refused: texts.refused(id) }
    )
  }

  /**
   * Begin to attach an Annotation again: the code viewer of Review opens on its Source File,
   * where it is still there, and the person selects the lines it is about now.
   */
  startAttaching(id: string): void {
    const tab = app.active
    const annotation = tab?.review.known?.annotations.find((one) => one.id === id)
    if (!tab || !annotation) return
    app.searching = undefined
    if (tab.module !== 'review') app.showModule('review')
    if (tab.module !== 'review') return
    tab.review.selectedId = id
    tab.review.problems = false
    tab.review.attaching = id
    const path = attachPathOf(annotation)
    if (path !== undefined) {
      const place = placeOf(annotation)
      this.openFile(path, place?.path === path ? place : undefined)
    } else {
      // The file is gone: the middle offers the Source Files to pick the new one from.
      tab.review.code = undefined
      tab.review.picking = true
      app.freshOutline(tab)
    }
  }

  cancelAttaching(): void {
    const review = app.active?.review
    if (!review) return
    review.attaching = undefined
    review.picking = false
  }

  async attach(id: string, lines: Place): Promise<void> {
    const tab = app.active
    if (!tab) return
    const texts = t.annotations.change.attach
    const repositoryId = tab.repository.id
    await this.plan(
      repositoryId,
      { kind: 'attach', id, ...lines },
      {
        title: texts.title(id, lines.path, lines.start, lines.end),
        action: texts.action,
        refused: texts.refused(id)
      },
      () => {
        const review = tabOf(repositoryId)?.review
        if (review?.attaching === id) review.attaching = undefined
      }
    )
  }

  async cite(id: string, adr: string): Promise<void> {
    const tab = app.active
    if (!tab) return
    const texts = t.annotations.change.cite
    await this.plan(
      tab.repository.id,
      { kind: 'cite', id, adr },
      { title: texts.title(id, adr), action: texts.action, refused: texts.refused(id, adr) }
    )
  }

  async uncite(id: string, adr: string): Promise<void> {
    const tab = app.active
    if (!tab) return
    const texts = t.annotations.change.uncite
    await this.plan(
      tab.repository.id,
      { kind: 'uncite', id, adr },
      { title: texts.title(id, adr), action: texts.action, refused: texts.refused(id, adr) }
    )
  }

  /** The Repair of a Trace to an ADR that is not there: the item is taken out of `cites`. */
  async repair(id: string, adr: string): Promise<void> {
    const tab = app.active
    if (!tab) return
    const texts = t.annotations.change.repair
    await this.plan(
      tab.repository.id,
      { kind: 'uncite', id, adr },
      { title: texts.title(id, adr), action: texts.action, refused: texts.refused(id, adr) }
    )
  }

  /**
   * Have the main process plan a write, and show it in the change dialog; `applied` runs once
   * it is written, with the path of the file it creates, if it creates one.
   */
  private async plan(
    repositoryId: string,
    request: ReviewRequest,
    texts: { title: string; action: string; refused: string },
    applied?: (created: string | undefined) => void
  ): Promise<void> {
    const plan: PlanResult = await window.api
      .planReview(repositoryId, request)
      .catch((error: unknown) => ({ ok: false as const, reason: String(error) }))
    if (!plan.ok) {
      app.present({ kind: 'refused', title: texts.refused, reason: wordOf(plan.said, plan.reason) })
      return
    }
    const created = plan.change.changeSet.files.find((file) => file.creates)?.path
    app.present({
      kind: 'change',
      title: texts.title,
      action: texts.action,
      change: plan.change,
      applying: false,
      ...(applied && { applied: () => applied(created) })
    })
  }
}

export const reviewing = new Reviewing()
