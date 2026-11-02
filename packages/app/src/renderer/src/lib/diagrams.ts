import type { DrawnDiagram } from '../../../shared/ipc'
import {
  DIAGRAM_TOKENS,
  Drawings,
  keepsAddress,
  mermaidConfig,
  mermaidSaid,
  scrubCss,
  type DiagramColors,
  type Drawing
} from './mermaid'
import { t } from './strings'

/**
 * Mermaid blocks drawn in the window (docs/adr/0016-…): in the preview, in the live mode, and
 * for the export. Mermaid and the sanitizer are loaded the first time a block is shown, not at
 * start. An ADR is untrusted input: Mermaid draws at its strictest, and what it draws goes
 * through DOMPurify's SVG profile and `scrubCss` before it is shown or written anywhere.
 */

export type Theme = 'light' | 'dark'

const drawings = new Drawings()
let loaded: Promise<Tools> | undefined
/** One drawing at a time: Mermaid's settings are global, and each drawing sets its own. */
let queue: Promise<unknown> = Promise.resolve()
let drawn = 0

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
 * The colours of a theme, from the tokens of main.css: of the window for its own theme, and of
 * an element that holds the light tokens (`.light-tokens`) for the export, which is drawn on
 * paper whatever the window shows.
 */
function colorsOf(theme: Theme): DiagramColors {
  const own = theme === windowTheme()
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
  return colors
}

/**
 * The SVG of a drawing as it may be shown: through DOMPurify's SVG profile — no script, no
 * handler, no HTML —, then without an address that leads out of the drawing and without CSS
 * that would fetch. Serialized as XML, so that it reads the same in a page and in a file.
 */
function sanitized(purify: Tools['purify'], svg: string): string | undefined {
  const body: Node = purify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    RETURN_DOM: true
  })
  const root = body instanceof Element ? body.querySelector('svg') : null
  if (!root) return undefined
  for (const element of [root, ...root.querySelectorAll('*')]) {
    if (element.localName === 'style') element.textContent = scrubCss(element.textContent ?? '')
    for (const attribute of [...element.attributes]) {
      const { name, value } = attribute
      if (/(?:^|:)href$/i.test(name) && !keepsAddress(element.localName, value)) {
        element.removeAttribute(name)
      } else if (/url\(|@import|image-set/i.test(value)) {
        element.setAttribute(name, scrubCss(value))
      }
    }
  }
  return new XMLSerializer().serializeToString(root)
}

/** Draw a block, or say why it cannot be drawn. A block drawn before is not drawn again. */
export function draw(source: string, theme: Theme = windowTheme()): Promise<Drawing> {
  // The light tokens are at hand in either theme; the dark ones only in a dark window.
  if (theme === 'dark' && windowTheme() === 'light') theme = 'light'
  const known = drawings.get(theme, source)
  if (known) return Promise.resolve(known)
  const drawing = queue.then(async (): Promise<Drawing> => {
    const again = drawings.get(theme, source)
    if (again) return again
    const id = `softarch-diagram-${++drawn}`
    let result: Drawing
    try {
      const { mermaid, purify } = await tools()
      mermaid.initialize(mermaidConfig(colorsOf(theme), theme === 'dark'))
      const { svg } = await mermaid.render(id, source)
      const clean = sanitized(purify, svg)
      result = clean ? { kind: 'drawn', svg: clean } : { kind: 'failed', said: '' }
    } catch (error) {
      result = { kind: 'failed', said: mermaidSaid(error) }
    } finally {
      // What Mermaid leaves behind of a drawing that failed.
      document.getElementById(`d${id}`)?.remove()
      document.getElementById(id)?.remove()
    }
    drawings.set(theme, source, result)
    return result
  })
  queue = drawing.catch(() => undefined)
  return drawing
}

/** A drawing as the window shows it: the picture, or the sentence that says why there is none. */
function figureOf(drawing: Drawing): HTMLElement {
  if (drawing.kind === 'drawn') {
    const figure = document.createElement('figure')
    figure.className = 'diagram'
    // Sanitized above, and the same text that the export writes.
    figure.innerHTML = drawing.svg
    return figure
  }
  const said = document.createElement('p')
  said.className = 'diagram-error'
  said.setAttribute('role', 'note')
  said.textContent = drawing.said ? t.diagram.cannotDraw(drawing.said) : t.diagram.cannotDrawAtAll
  return said
}

/**
 * Draw the Mermaid blocks of a rendered document in place: each `pre` of one becomes its
 * picture, or stays as it is with the sentence beside it. What was drawn already is there at
 * once; the rest comes when Mermaid has it.
 */
export function drawIn(container: HTMLElement, theme: Theme = windowTheme()): void {
  for (const code of container.querySelectorAll('pre > code.language-mermaid')) {
    const pre = code.parentElement!
    if (pre.dataset['drawing'] !== undefined) continue
    pre.dataset['drawing'] = ''
    const source = (code.textContent ?? '').replace(/\n$/, '')
    void draw(source, theme).then((drawing) => {
      if (!pre.isConnected) return
      if (drawing.kind === 'drawn') pre.replaceWith(figureOf(drawing))
      else pre.after(figureOf(drawing))
    })
  }
}

/**
 * Draw one block into a box of the live mode: the picture, or the block's source with the
 * sentence beside it. `done` is told when the box has its final size.
 */
export function drawInto(source: string, box: HTMLElement, done: () => void): void {
  void draw(source).then((drawing) => {
    box.replaceChildren(figureOf(drawing))
    if (drawing.kind === 'failed') {
      const pre = document.createElement('pre')
      pre.textContent = source
      box.prepend(pre)
    }
    done()
  })
}

/**
 * The blocks drawn for the export, light, by their source; a block that cannot be drawn is
 * left out, and stays a code block there.
 */
export async function drawnForExport(sources: readonly string[]): Promise<DrawnDiagram[]> {
  const drawn: DrawnDiagram[] = []
  for (const source of new Set(sources)) {
    const drawing = await draw(source, 'light')
    if (drawing.kind === 'drawn') drawn.push({ source, svg: drawing.svg })
  }
  return drawn
}
