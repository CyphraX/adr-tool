import { DIAGRAM_FONT } from '@adr-tool/core'
import type { DrawnDiagram } from '../../../shared/ipc'
import {
  DIAGRAM_TOKENS,
  Drawings,
  mermaidConfig,
  mermaidSaid,
  type DiagramColors,
  type Drawing
} from './mermaid'
import { sanitizedDrawing } from './sanitize'
import { t } from './strings'

/**
 * Mermaid blocks drawn in the window (docs/adr/0016-…): in the preview, in the live mode, and
 * for the export. Mermaid and the sanitizer are loaded the first time a block is shown, not at
 * start. An ADR is untrusted input: Mermaid draws at its strictest, and what it draws goes
 * through lib/sanitize.ts before it is shown or written anywhere.
 */

export type Theme = 'light' | 'dark'

/** What a drawing is for: the window, in its theme, or an image of the export. */
export type Purpose = Theme | 'export'

const drawings = new Drawings()
let loaded: Promise<Tools> | undefined
/** One drawing at a time: Mermaid's settings are global, and each drawing sets its own. */
let queue: Promise<unknown> = Promise.resolve()
let drawn = 0

/** How long Mermaid may take for a block before the block stays code; the queue goes on. */
const RENDER_TIMEOUT_MS = 15_000

interface Tools {
  readonly mermaid: (typeof import('mermaid'))['default']
  readonly purify: (typeof import('dompurify'))['default']
}

function tools(): Promise<Tools> {
  loaded ??= Promise.all([import('mermaid'), import('dompurify')]).then(
    ([mermaid, purify]) => ({ mermaid: mermaid.default, purify: purify.default }),
    (error: unknown) => {
      loaded = undefined
      throw error
    }
  )
  return loaded
}

/** The theme of the window, as the system has it. */
export function windowTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * The colours of a drawing, from the tokens of main.css: of the window for its own theme, and
 * of an element that holds the light tokens (`.light-tokens`) for the export, which is drawn on
 * paper whatever the window shows — in the fonts an image of the export has (`DIAGRAM_FONT`).
 */
function colorsOf(purpose: Purpose): DiagramColors {
  const own = purpose === windowTheme()
  const probe = document.createElement('div')
  probe.hidden = true
  probe.className = 'light-tokens'
  if (!own) document.body.append(probe)
  const style = getComputedStyle(own ? document.documentElement : probe)
  const colors = Object.fromEntries(
    Object.entries(DIAGRAM_TOKENS).map(([key, token]) => [
      key,
      style.getPropertyValue(token).trim()
    ])
  ) as unknown as DiagramColors
  probe.remove()
  return purpose === 'export' ? { ...colors, font: DIAGRAM_FONT } : colors
}

/** A drawing that was not made, and not because of the block: the window could not draw it. */
const NOT_DRAWN: Drawing = { kind: 'failed', said: '' }

/** Mermaid took too long for a block. */
class TooLong extends Error {}

/** What a drawing came to, and whether it is kept for the next time the block is shown. */
async function drawNow(
  source: string,
  purpose: Purpose,
  wanted: (() => boolean) | undefined
): Promise<{ readonly drawing: Drawing; readonly kept: boolean }> {
  let found: Tools
  let colors: DiagramColors
  try {
    found = await tools()
    colors = colorsOf(purpose)
  } catch {
    // Loading Mermaid or reading the tokens failed: the next time may not.
    return { drawing: NOT_DRAWN, kept: false }
  }
  const id = `softarch-diagram-${++drawn}`
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    found.mermaid.initialize(mermaidConfig(colors, purpose === 'dark'))
    const late = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new TooLong()), RENDER_TIMEOUT_MS)
    })
    const { svg } = await Promise.race([found.mermaid.render(id, source), late])
    const clean = sanitizedDrawing(found.purify, svg, { sized: purpose === 'export' })
    if (clean === undefined) return { drawing: NOT_DRAWN, kept: false }
    return { drawing: { kind: 'drawn', svg: clean }, kept: true }
  } catch (error) {
    if (error instanceof TooLong) return { drawing: NOT_DRAWN, kept: false }
    // What Mermaid says of a block is kept while the block is shown; one typed past is not.
    return { drawing: { kind: 'failed', said: mermaidSaid(error) }, kept: wanted?.() === true }
  } finally {
    clearTimeout(timer)
    // What Mermaid leaves behind of a drawing that failed.
    document.getElementById(`d${id}`)?.remove()
    document.getElementById(id)?.remove()
  }
}

/** The light tokens are at hand in either theme; the dark ones only in a dark window. */
const purposeOf = (purpose: Purpose): Purpose =>
  purpose === 'dark' && windowTheme() === 'light' ? 'light' : purpose

/** A block drawn before, at once, or `undefined`. */
export function drawnBefore(source: string, purpose: Purpose = windowTheme()): Drawing | undefined {
  return drawings.get(purposeOf(purpose), source)
}

/**
 * Draw a block, or say why it cannot be drawn. A block drawn before is not drawn again. With
 * `wanted`, a block that is no longer shown when its turn comes is not drawn: `undefined`.
 */
export function draw(
  source: string,
  purpose: Purpose = windowTheme(),
  wanted?: () => boolean
): Promise<Drawing | undefined> {
  const as = purposeOf(purpose)
  const known = drawings.get(as, source)
  if (known) return Promise.resolve(known)
  const drawing = queue.then(async (): Promise<Drawing | undefined> => {
    const again = drawings.get(as, source)
    if (again) return again
    if (wanted && !wanted()) return undefined
    const { drawing, kept } = await drawNow(source, as, wanted)
    if (kept) drawings.set(as, source, drawing)
    return drawing
  })
  queue = drawing.catch(() => undefined)
  return drawing
}

/**
 * A drawing as the window shows it: the picture with its source a click away below it, or the
 * sentence that says why there is none. `open` holds the sources whose source is shown, and
 * learns when one is opened or closed.
 */
function figureOf(drawing: Drawing, source: string, open?: Set<string>): HTMLElement {
  if (drawing.kind === 'drawn') {
    const figure = document.createElement('figure')
    figure.className = 'diagram'
    // Sanitized above, and the same text that the export writes.
    figure.innerHTML = drawing.svg
    const details = document.createElement('details')
    details.className = 'diagram-source'
    details.open = open?.has(source) ?? false
    details.addEventListener('toggle', () => {
      if (details.open) open?.add(source)
      else open?.delete(source)
    })
    const summary = document.createElement('summary')
    summary.textContent = t.diagram.source
    const pre = document.createElement('pre')
    pre.textContent = source
    details.append(summary, pre)
    figure.append(details)
    return figure
  }
  const said = document.createElement('p')
  said.className = 'diagram-error'
  said.setAttribute('role', 'note')
  said.textContent = drawing.said ? t.diagram.cannotDraw(drawing.said) : t.diagram.cannotDrawAtAll
  return said
}

export interface DrawInOptions {
  /**
   * How long to wait before a block not drawn before is drawn: while the text is typed, as in
   * the preview beside the editor, only the block the typing paused at is drawn.
   */
  readonly delay?: number
  /** The sources whose source is shown below their drawing, kept as the document is set again. */
  readonly open?: Set<string>
}

/**
 * Draw the Mermaid blocks of a rendered document in place: each `pre` of one becomes its
 * picture, or stays as it is with the sentence beside it. What was drawn already is there at
 * once; the rest comes when Mermaid has it. Returns what stops the drawings still waiting.
 */
export function drawIn(
  container: HTMLElement,
  theme: Theme = windowTheme(),
  options: DrawInOptions = {}
): () => void {
  const timers: ReturnType<typeof setTimeout>[] = []
  const show = (pre: HTMLElement, source: string, drawing: Drawing | undefined): void => {
    if (!drawing || !pre.isConnected) return
    if (drawing.kind === 'drawn') pre.replaceWith(figureOf(drawing, source, options.open))
    else pre.after(figureOf(drawing, source))
  }
  for (const code of container.querySelectorAll('pre > code.language-mermaid')) {
    const pre = code.parentElement!
    if (pre.dataset['drawing'] !== undefined) continue
    pre.dataset['drawing'] = ''
    const source = (code.textContent ?? '').replace(/\n$/, '')
    const before = drawnBefore(source, theme)
    if (before) {
      show(pre, source, before)
      continue
    }
    const start = (): void =>
      void draw(source, theme, () => pre.isConnected).then((drawing) => show(pre, source, drawing))
    if (options.delay) timers.push(setTimeout(start, options.delay))
    else start()
  }
  return () => timers.forEach(clearTimeout)
}

/** The sources shown below their drawing in the live mode, kept as a block is drawn again. */
const openInLive = new Set<string>()

/**
 * Draw one block into a box of the live mode, in a theme: the picture with its source below it,
 * or the block's source with the sentence beside it. `done` is told when the box has its final
 * size.
 */
export function drawInto(source: string, theme: Theme, box: HTMLElement, done: () => void): void {
  void draw(source, theme, () => box.isConnected).then((drawing) => {
    if (!drawing || !box.isConnected) return
    box.replaceChildren(figureOf(drawing, source, openInLive))
    if (drawing.kind === 'failed') {
      const pre = document.createElement('pre')
      pre.textContent = source
      box.prepend(pre)
    }
    done()
  })
}

/**
 * The blocks drawn for the export: light, in the fonts an image of the export has, at the size
 * of their view box, by their source. A block that cannot be drawn is left out, and stays a code
 * block there.
 */
export async function drawnForExport(sources: readonly string[]): Promise<DrawnDiagram[]> {
  const drawn: DrawnDiagram[] = []
  for (const source of new Set(sources)) {
    const drawing = await draw(source, 'export')
    if (drawing?.kind === 'drawn') drawn.push({ source, svg: drawing.svg })
  }
  return drawn
}
