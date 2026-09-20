/**
 * The widths a person gave the panes by dragging. What was never dragged is not here, and
 * the layout keeps its own proportions for it. The middle pane remembers one width as a
 * list — of ADRs or of Problems — and one as the graph: a drawing wants more room.
 */
export interface PaneSizes {
  sidebar?: number
  list?: number
  graph?: number
}

/** What the middle pane shows, as far as its width is concerned. */
export type MiddlePane = 'list' | 'graph'

export const PANES = ['sidebar', 'list', 'graph'] as const

/**
 * What each pane needs to stay readable, in pixels. The layout in App.svelte takes its
 * numbers from here, so that a dragged pane and the grid never disagree about a minimum.
 */
export const LIMITS = {
  /** `default` is what the layout gives a sidebar nobody dragged. */
  sidebar: { min: 160, max: 420, default: 210 },
  middle: { min: 280 },
  /** Next to the graph the ADR is there to be glanced at, and still has to be readable. */
  detail: { min: 320, besideGraph: 360 }
} as const

const within = (asked: number, min: number, max: number): number =>
  Math.round(Math.max(min, Math.min(asked, max)))

const detailMin = (middle: MiddlePane): number =>
  middle === 'graph' ? LIMITS.detail.besideGraph : LIMITS.detail.min

/** The sidebar's width: what was asked for, as long as the middle and the ADR keep their room. */
export function fitSidebar(asked: number, total: number): number {
  const room = total - LIMITS.middle.min - LIMITS.detail.min
  return within(asked, LIMITS.sidebar.min, Math.min(LIMITS.sidebar.max, room))
}

/** How wide the middle pane can get next to a sidebar of that width: the ADR keeps its room. */
export function maxMiddle(total: number, sidebar: number, middle: MiddlePane = 'list'): number {
  return Math.max(LIMITS.middle.min, Math.round(total - sidebar - detailMin(middle)))
}

/** The middle pane's width: what was asked for, between its own minimum and `maxMiddle`. */
export function fitMiddle(
  asked: number,
  total: number,
  sidebar: number,
  middle: MiddlePane = 'list'
): number {
  return within(asked, LIMITS.middle.min, maxMiddle(total, sidebar, middle))
}

/** What was stored by an earlier run — or by anything else: only widths that can be used come back. */
export function readSizes(stored: string | null): PaneSizes {
  let parsed: unknown
  try {
    parsed = JSON.parse(stored ?? 'null')
  } catch {
    return {}
  }
  if (typeof parsed !== 'object' || parsed === null) return {}
  const sizes: PaneSizes = {}
  for (const pane of PANES) {
    const width = (parsed as Record<string, unknown>)[pane]
    if (typeof width === 'number' && Number.isFinite(width) && width > 0) sizes[pane] = width
  }
  return sizes
}
