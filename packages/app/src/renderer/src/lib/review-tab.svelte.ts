import type { AnnotationType } from '@adr-tool/review'
import type { ReviewOverview } from '../../../shared/ipc'
import type { ReviewFilter } from './review'
import type { CodeView } from './state.svelte'

/**
 * The Review module of one tab (docs/plan-vision.md, part 9): what the main process last found
 * of the Annotations, and what the person looks at — the filter of the sidebar, the Annotation
 * that is selected, the Source File the middle shows instead of the list, the Problems of the
 * repository there, and the Annotation that is being attached again to new lines.
 */
export class ReviewTab {
  /** The last answer, kept while the next one is asked for; replaced as a whole. */
  known = $state.raw<ReviewOverview | undefined>(undefined)
  reading = $state(false)
  failed = $state<string | undefined>(undefined)
  /** Counts the requests, so that an answer that is overtaken is dropped. */
  asked = 0
  filter = $state<ReviewFilter>({})
  selectedId = $state<string | undefined>(undefined)
  /** The Source File the middle shows instead of the list, if one is open. */
  code = $state<CodeView | undefined>(undefined)
  /** The middle shows the Problems of the repository instead of the list. */
  problems = $state(false)
  /** The Annotation whose new lines are being selected in the code viewer: Attach again. */
  attaching = $state<string | undefined>(undefined)
}

/** A new Annotation being described in its dialog, on the lines selected in the code viewer. */
export interface Composing {
  readonly repositoryId: string
  readonly path: string
  readonly start: number
  readonly end: number
  /** The lines as the viewer shows them, to see what is annotated. */
  readonly quote: readonly string[]
  type: AnnotationType
  text: string
  author: string
  /** ADRs, as `cites` names them. */
  cites: string[]
}

/** A Reply being written under the Annotation that is selected. */
export interface Replying {
  readonly repositoryId: string
  readonly id: string
  text: string
  author: string
}

/**
 * The forms of Review that hold what a person typed: one new Annotation, and one Reply at a
 * time. Closing the window with text in them asks first, as the editor of an ADR does.
 */
class ReviewForms {
  composing = $state<Composing | undefined>(undefined)
  replying = $state<Replying | undefined>(undefined)

  /** Whether a form holds text that would be lost. */
  readonly dirty = $derived(
    (this.composing?.text.trim() ?? '') !== '' || (this.replying?.text.trim() ?? '') !== ''
  )

  clear(): void {
    this.composing = undefined
    this.replying = undefined
  }
}

export const reviewForms = new ReviewForms()
