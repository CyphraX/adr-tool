/**
 * What the window makes of the Annotations of a repository (docs/plan-vision.md, part 9): where
 * each one is now, which Component it belongs to, what the filters of the sidebar leave, which
 * ADRs it cites and which Annotations cite an ADR, what the search finds, and its Problems for
 * the list of the repository. Nothing here reads or writes: it is put together from what the
 * main process found (`ReviewOverview`) and what the window holds of Structure and Decisions.
 */
import type { Repository } from '@adr-tool/core'
import {
  adrReferencesOf,
  citedAdr,
  hasRepair,
  qualified,
  type AnnotationState,
  type AnnotationType,
  type ReviewProblem
} from '@adr-tool/review'
import type { AnnotationView, ReviewOverview, StructureOutline } from '../../../shared/ipc'
import { fold } from './search'

/** What became of an Anchor, as the window tells it: `unread` for one that cannot be read. */
export type AnchorState = 'unchanged' | 'moved' | 'orphaned' | 'unread'

export const anchorStateOf = (annotation: AnnotationView): AnchorState =>
  !annotation.anchor ? 'unread' : (annotation.found?.kind ?? 'unchanged')

/** Lines of a Source File: the first and the last, counted from 1. */
export interface Place {
  readonly path: string
  readonly start: number
  readonly end: number
}

/**
 * Where an Annotation is now: where its Anchor was found again, or where it says while it was
 * not looked for yet. `undefined` for one that is orphaned, or has no Anchor that can be read.
 */
export function placeOf(annotation: AnnotationView): Place | undefined {
  const { anchor, found } = annotation
  if (!anchor || found?.kind === 'orphaned') return undefined
  const at = found?.kind === 'moved' ? found.anchor : anchor
  return { path: at.path, start: at.start, end: at.end }
}

/** The Source File an Annotation is about: where it is now, or the one its Anchor names. */
export const sourceFileOf = (annotation: AnnotationView): string | undefined =>
  placeOf(annotation)?.path ?? annotation.anchor?.path

/** `12–14`, or `12` for one line: lines as the window writes them. */
export const linesOf = (place: Pick<Place, 'start' | 'end'>): string =>
  place.start === place.end ? String(place.start) : `${place.start}–${place.end}`

/** The Component of every Source File Structure knows, by its path. */
export type Owners = ReadonlyMap<string, string | undefined>

const owners = new WeakMap<StructureOutline, Owners>()

/** Who owns which Source File, as Structure last found it. */
export function ownersOf(outline: StructureOutline | undefined): Owners {
  if (!outline) return new Map()
  let known = owners.get(outline)
  if (!known) {
    known = new Map(outline.sourceFiles.map((file) => [file.path, file.component]))
    owners.set(outline, known)
  }
  return known
}

/**
 * The Component an Annotation belongs to: the one that owns its Source File (docs/review-format.md,
 * section 4). It is not stored; `undefined` for a file no Component owns, or that Structure does
 * not know.
 */
export const componentOf = (annotation: AnnotationView, owners: Owners): string | undefined => {
  const path = sourceFileOf(annotation)
  return path === undefined ? undefined : owners.get(path)
}

/** The first line of a text that says something, without the marks of Markdown in front of it. */
export function firstLine(text: string): string {
  const line = text
    .split(/\r?\n/)
    .map((one) => one.trim())
    .find((one) => one !== '' && !/^(?:```|~~~)/.test(one))
  return (line ?? '').replace(/^(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+)/, '').trim()
}

/**
 * What the sidebar filters by: each facet one value or none. `component: null` is the
 * Annotations that no Component owns.
 */
export interface ReviewFilter {
  readonly component?: string | null
  readonly type?: AnnotationType
  readonly state?: AnnotationState
  readonly anchor?: 'moved' | 'orphaned'
  readonly author?: string
}

export type Facet = keyof ReviewFilter

/** Whether an Annotation passes every facet of a filter but `except`. */
function passes(
  annotation: AnnotationView,
  filter: ReviewFilter,
  owners: Owners,
  except?: Facet
): boolean {
  const facet = (name: Facet): boolean => name !== except && filter[name] !== undefined
  if (facet('component')) {
    const owner = componentOf(annotation, owners) ?? null
    const wanted = filter.component!
    if (wanted === null ? owner !== null : owner !== wanted && !owner?.startsWith(`${wanted}/`))
      return false
  }
  if (facet('type') && annotation.type !== filter.type) return false
  if (facet('state') && annotation.state !== filter.state) return false
  if (facet('anchor') && anchorStateOf(annotation) !== filter.anchor) return false
  if (facet('author') && (annotation.author ?? '') !== filter.author) return false
  return true
}

/** The Annotations a filter leaves: newest first, then by ID. */
export function filtered(
  annotations: readonly AnnotationView[],
  filter: ReviewFilter,
  owners: Owners
): AnnotationView[] {
  return annotations
    .filter((annotation) => passes(annotation, filter, owners))
    .sort(
      (a, b) =>
        (b.date ?? '').localeCompare(a.date ?? '') || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    )
}

/** How many Annotations each row of the sidebar stands for, with the other facets applied. */
export interface FacetCounts {
  readonly all: number
  readonly states: ReadonlyMap<AnnotationState, number>
  readonly anchors: ReadonlyMap<'moved' | 'orphaned', number>
  readonly types: ReadonlyMap<AnnotationType, number>
  /** By the Component that owns their Source File, `null` for none; the top Components only. */
  readonly components: ReadonlyMap<string | null, number>
  /** By their author, `''` for those of nobody in particular. */
  readonly authors: ReadonlyMap<string, number>
}

const increment = <K>(map: Map<K, number>, key: K): void => {
  map.set(key, (map.get(key) ?? 0) + 1)
}

/**
 * The counts of the sidebar: each facet counted over the Annotations the other facets leave, so
 * that a row says how many a click on it would show. A Component is counted at the top of the
 * hierarchy, its children's Annotations with it.
 */
export function facetCounts(
  annotations: readonly AnnotationView[],
  filter: ReviewFilter,
  owners: Owners
): FacetCounts {
  const states = new Map<AnnotationState, number>()
  const anchors = new Map<'moved' | 'orphaned', number>()
  const types = new Map<AnnotationType, number>()
  const components = new Map<string | null, number>()
  const authors = new Map<string, number>()
  let all = 0
  for (const annotation of annotations) {
    if (passes(annotation, filter, owners)) all++
    if (passes(annotation, filter, owners, 'state') && annotation.state)
      increment(states, annotation.state)
    const anchor = anchorStateOf(annotation)
    if (
      passes(annotation, filter, owners, 'anchor') &&
      (anchor === 'moved' || anchor === 'orphaned')
    )
      increment(anchors, anchor)
    if (passes(annotation, filter, owners, 'type') && annotation.type)
      increment(types, annotation.type)
    if (passes(annotation, filter, owners, 'component')) {
      const owner = componentOf(annotation, owners)
      increment(components, owner === undefined ? null : owner.split('/')[0]!)
    }
    if (passes(annotation, filter, owners, 'author')) increment(authors, annotation.author ?? '')
  }
  return { all, states, anchors, types, components, authors }
}

/** An ADR as a Trace of an Annotation names it, and where it is in the window. */
export interface CitedLine {
  /** As the Annotation writes it. */
  readonly item: string
  /** The Decision Log and ID of the ADR it names; absent for one that is not there. */
  readonly found?: { readonly logPath: string; readonly id: string }
}

/** The Traces of an Annotation, each with the ADR it names, if there is one. */
export const citedBy = (annotation: AnnotationView, repository: Repository): CitedLine[] =>
  citedLines(annotation.cites, repository)

/** Items of `cites`, each with the ADR it names, if there is one. */
export function citedLines(cites: readonly string[], repository: Repository): CitedLine[] {
  const adrs = adrReferencesOf(repository.logs)
  return cites.map((item) => {
    const found = citedAdr(item, adrs).found
    return found
      ? { item, found: { logPath: found.log === '.' ? '' : found.log, id: found.id } }
      : { item }
  })
}

/**
 * How an Annotation would cite an ADR: by its bare ID where only one Decision Log has it, and
 * with its log otherwise, as `cites` names it (docs/review-format.md, section 2).
 */
export function citationOf(repository: Repository, logPath: string, id: string): string {
  const adrs = adrReferencesOf(repository.logs)
  const log = logPath === '' ? '.' : logPath
  return adrs.filter((adr) => adr.id === id).length === 1 ? id : qualified({ log, id })
}

/** The Annotations that cite an ADR: the other direction of their Traces, computed (ADR-0009). */
export function citing(
  annotations: readonly AnnotationView[],
  repository: Repository,
  logPath: string,
  id: string
): AnnotationView[] {
  const adrs = adrReferencesOf(repository.logs)
  const log = logPath === '' ? '.' : logPath
  return annotations.filter((annotation) =>
    annotation.cites.some((item) => {
      const found = citedAdr(item, adrs).found
      return found?.log === log && found.id === id
    })
  )
}

/** The open Annotations of a Component: on the Source Files it owns, and on those of its children. */
export function openOf(
  component: string,
  annotations: readonly AnnotationView[],
  owners: Owners
): AnnotationView[] {
  return filtered(annotations, { component, state: 'open' }, owners)
}

/** The Annotations of a Source File, where they are now. */
export function onFile(annotations: readonly AnnotationView[], path: string): AnnotationView[] {
  return annotations.filter((annotation) => placeOf(annotation)?.path === path)
}

/** An Annotation the search found. */
export interface AnnotationHit {
  readonly annotation: AnnotationView
  readonly score: number
}

/**
 * The Annotations whose ID, text, Replies or Source File hold every word of the query, case and
 * accents aside, best first: a word in the ID or the first line counts most.
 */
export function searchAnnotations(
  annotations: readonly AnnotationView[],
  query: string
): AnnotationHit[] {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const hits: AnnotationHit[] = []
  for (const annotation of annotations) {
    const head = fold(`${annotation.id} ${firstLine(annotation.text)}`)
    const rest = fold(
      [
        annotation.text,
        sourceFileOf(annotation) ?? '',
        ...annotation.replies.map((one) => one.text)
      ].join('\n')
    )
    let score = 0
    for (const word of words) {
      const found = head.includes(word) ? 10 : rest.includes(word) ? 1 : 0
      if (found === 0) {
        score = 0
        break
      }
      score += found
    }
    if (score > 0) hits.push({ annotation, score })
  }
  return hits.sort((a, b) => b.score - a.score || (a.annotation.id < b.annotation.id ? -1 : 1))
}

/** What the window knows of the Annotations of the repository in front, and whether it asks. */
export interface ReviewKnown {
  readonly known: ReviewOverview | undefined
  readonly reading: boolean
  readonly failed: string | undefined
}

/** A Problem of Review in the list of the repository, with the Annotation it is about. */
export interface ReviewEntry {
  readonly problem: ReviewProblem
  readonly annotation: AnnotationView | undefined
  /** A Trace to an ADR that is not there: its Repair takes the item out. */
  readonly repairable: boolean
}

export type ReviewSection =
  /** The Annotations have not been read yet: their Problems follow. */
  | { readonly state: 'reading' }
  | { readonly state: 'failed'; readonly reason: string }
  | {
      readonly state: 'known'
      readonly entries: readonly ReviewEntry[]
      /** `.arch/config.yml` cannot be read: no Annotation is read. */
      readonly configUnreadable: boolean
      /** The Anchors are looked for again: what is shown is the last result. */
      readonly again: boolean
    }

/** The Problems of Review for the list of the repository (lib/repository-problems.ts). */
export function reviewSection(review: ReviewKnown | undefined): ReviewSection {
  const known = review?.known
  if (!known) {
    return review?.failed !== undefined && !review.reading
      ? { state: 'failed', reason: review.failed }
      : { state: 'reading' }
  }
  const byId = new Map(known.annotations.map((annotation) => [annotation.id, annotation]))
  return {
    state: 'known',
    entries: known.problems.map((problem) => ({
      problem,
      annotation: 'annotation' in problem ? byId.get(problem.annotation) : undefined,
      repairable: hasRepair(problem)
    })),
    configUnreadable: known.configUnreadable,
    again: known.finding || (review?.reading ?? false)
  }
}
