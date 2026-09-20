/**
 * The widths a person gave the panes by dragging. What was never dragged is not here, and
 * the layout keeps its own proportions for it. The list and the graph each remember theirs:
 * a drawing wants more room than a list.
 */
export interface PaneSizes {
  sidebar?: number
  list?: number
  graph?: number
}

export const PANES = ['sidebar', 'list', 'graph'] as const

/** What each pane needs to stay readable, in pixels. */
export const LIMITS = {
  /** `default` is what the layout gives a sidebar nobody dragged. */
  sidebar: { min: 160, max: 420, default: 210 },
  middle: { min: 280 },
  detail: { min: 320 }
} as const

const within = (asked: number, min: number, max: number): number =>
  Math.round(Math.max(min, Math.min(asked, max)))

/** The sidebar's width: what was asked for, as long as the middle and the ADR keep their room. */
export function fitSidebar(asked: number, total: number): number {
  const room = total - LIMITS.middle.min - LIMITS.detail.min
  return within(asked, LIMITS.sidebar.min, Math.min(LIMITS.sidebar.max, room))
}

/** The middle pane's width next to a sidebar of that width: the ADR keeps its room. */
export function fitMiddle(asked: number, total: number, sidebar: number): number {
  return within(asked, LIMITS.middle.min, total - sidebar - LIMITS.detail.min)
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
