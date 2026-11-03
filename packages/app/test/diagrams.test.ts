// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

// docs/adr/0016-…, and the review of part 2: a block is drawn one at a time, only while it is
// still shown; what a block came to is kept only when it says something of the block.

const mermaid = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn<(id: string, source: string) => Promise<{ svg: string }>>()
}))
vi.mock('mermaid', () => ({ default: mermaid }))

window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => undefined,
  removeEventListener: () => undefined
})) as unknown as typeof window.matchMedia

const { draw, drawIn, drawnBefore, drawnForExport } =
  await import('../src/renderer/src/lib/diagrams')

const svgOf = (label: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="100%" style="max-width: 120.5px;" viewBox="0 0 120.5 40"><text>${label}</text></svg>`

beforeEach(() => {
  mermaid.render.mockReset()
  mermaid.render.mockImplementation(async (_id, source) => ({ svg: svgOf(source) }))
})

const documentWith = (...sources: string[]): HTMLElement => {
  const container = document.createElement('div')
  for (const source of sources) {
    const pre = document.createElement('pre')
    const code = document.createElement('code')
    code.className = 'language-mermaid'
    code.textContent = `${source}\n`
    pre.append(code)
    container.append(pre)
  }
  document.body.append(container)
  return container
}

describe('a Mermaid block drawn in the window', () => {
  it('is not drawn when it is no longer shown when its turn comes', async () => {
    expect(await draw('gone', 'light', () => false)).toBeUndefined()
    expect(mermaid.render).not.toHaveBeenCalled()
    expect(drawnBefore('gone', 'light')).toBeUndefined()
  })

  it('keeps what Mermaid said of a block only while the block is shown', async () => {
    mermaid.render.mockRejectedValue(new Error('Parse error on line 1'))
    let shown = false
    expect(await draw('typed past', 'light', () => shown)).toBeUndefined()
    shown = true
    const said = await draw('typed past', 'light', () => {
      const now = shown
      shown = false
      return now
    })
    // Asked at the head of the queue, and no longer shown when Mermaid has said it.
    expect(said).toEqual({ kind: 'failed', said: 'Parse error on line 1' })
    expect(drawnBefore('typed past', 'light')).toBeUndefined()
    await draw('typed past', 'light', () => true)
    expect(drawnBefore('typed past', 'light')).toEqual(said)
  })

  it('does not keep a drawing the sanitizer refused, and says it without Mermaid', async () => {
    mermaid.render.mockResolvedValue({ svg: '<p>not a drawing</p>' })
    expect(await draw('refused', 'light', () => true)).toEqual({ kind: 'failed', said: '' })
    expect(drawnBefore('refused', 'light')).toBeUndefined()
  })

  it('draws a document once the typing pauses, and not what was typed past', async () => {
    vi.useFakeTimers()
    try {
      const container = documentWith('graph TD; A-->B')
      const stop = drawIn(container, 'light', { delay: 400 })
      await vi.advanceTimersByTimeAsync(399)
      expect(mermaid.render).not.toHaveBeenCalled()
      stop()
      await vi.advanceTimersByTimeAsync(400)
      expect(mermaid.render).not.toHaveBeenCalled()

      const again = documentWith('graph TD; A-->B')
      drawIn(again, 'light', { delay: 400 })
      await vi.advanceTimersByTimeAsync(400)
      await vi.waitFor(() => expect(again.querySelector('figure.diagram svg')).not.toBeNull())
      expect(mermaid.render).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps the source below a drawing open as the document is set again', async () => {
    const open = new Set<string>()
    const first = documentWith('graph LR; Open')
    drawIn(first, 'light', { open })
    await vi.waitFor(() => expect(first.querySelector('details.diagram-source')).not.toBeNull())
    const details = first.querySelector('details')!
    details.open = true
    details.dispatchEvent(new Event('toggle'))
    expect(open.has('graph LR; Open')).toBe(true)
    first.remove()

    const second = documentWith('graph LR; Open')
    drawIn(second, 'light', { open })
    // Drawn before: at once, open as it was left.
    expect(second.querySelector('details')?.open).toBe(true)
    expect(second.querySelector('details pre')?.textContent).toBe('graph LR; Open')
  })

  it('draws the export at the size of its view box', async () => {
    const [drawn] = await drawnForExport(['graph LR; Export'])
    expect(drawn?.svg).toContain('width="121"')
    expect(drawn?.svg).toContain('height="40"')
    expect(drawn?.svg).not.toContain('max-width')
  })
})
