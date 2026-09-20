import { describe, expect, it } from 'vitest'
import { LIMITS, fitMiddle, fitSidebar, maxMiddle, readSizes } from '../src/renderer/src/lib/panes'

describe('the width a pane gets', () => {
  it('is what was asked for while the others stay readable', () => {
    expect(fitSidebar(260, 1280)).toBe(260)
    expect(fitMiddle(500, 1280, 210)).toBe(500)
  })

  it('never goes below what the pane itself needs', () => {
    expect(fitSidebar(20, 1280)).toBe(LIMITS.sidebar.min)
    expect(fitMiddle(20, 1280, 210)).toBe(LIMITS.middle.min)
  })

  it('leaves the ADR its room: the middle gives way first, then the sidebar', () => {
    expect(fitMiddle(2000, 1280, 210)).toBe(1280 - 210 - LIMITS.detail.min)
    expect(fitSidebar(2000, 1280)).toBe(LIMITS.sidebar.max)
    // A narrow window: the sidebar leaves room for the smallest middle and the smallest detail.
    expect(fitSidebar(400, 900)).toBe(900 - LIMITS.middle.min - LIMITS.detail.min)
  })

  it('keeps its own minimum in a window too small for everything', () => {
    expect(fitMiddle(500, 600, 210)).toBe(LIMITS.middle.min)
    expect(fitSidebar(300, 500)).toBe(LIMITS.sidebar.min)
  })

  it('leaves the ADR more room next to the graph, as the layout does', () => {
    expect(LIMITS.detail.besideGraph).toBeGreaterThan(LIMITS.detail.min)
    expect(fitMiddle(2000, 1280, 210, 'graph')).toBe(1280 - 210 - LIMITS.detail.besideGraph)
    expect(fitMiddle(2000, 1280, 210, 'list')).toBe(1280 - 210 - LIMITS.detail.min)
  })

  it('says how far the middle can go, for the divider to announce', () => {
    expect(maxMiddle(1280, 210, 'list')).toBe(1280 - 210 - LIMITS.detail.min)
    expect(maxMiddle(1280, 210, 'graph')).toBe(1280 - 210 - LIMITS.detail.besideGraph)
    // Before the window has been measured there is no room to speak of.
    expect(maxMiddle(0, 210, 'list')).toBe(LIMITS.middle.min)
  })

  it('is a whole number of pixels', () => {
    expect(fitSidebar(233.6, 1280)).toBe(234)
  })
})

describe('the widths remembered from the last run', () => {
  it('are read back as they were stored', () => {
    expect(readSizes('{"sidebar":250,"list":480,"graph":700}')).toEqual({
      sidebar: 250,
      list: 480,
      graph: 700
    })
  })

  it('are nothing when nothing usable was stored', () => {
    expect(readSizes(null)).toEqual({})
    expect(readSizes('not json')).toEqual({})
    expect(readSizes('[1,2]')).toEqual({})
    expect(readSizes('{"sidebar":"wide","list":-5,"graph":null,"other":3}')).toEqual({})
  })
})
