import type { MermaidConfig } from 'mermaid'

/**
 * What the window does with a Mermaid block before anything is drawn (docs/adr/0016-…): which
 * block is one, how Mermaid is set up — at its strictest, in the colours of the window —, what
 * is taken out of the SVG it draws beyond what the sanitizer takes, and how a block that cannot
 * be drawn says why. Nothing here loads Mermaid; lib/diagrams.ts does, when a block is shown.
 */

/**
 * Whether the info string of a fenced code block makes it a Mermaid block: its first word is
 * `mermaid`, as GitHub reads it and as remark gives the block its language.
 */
export function isMermaidInfo(info: string): boolean {
  return info.trim().split(/\s/, 1)[0] === 'mermaid'
}

/** The colours a diagram is drawn in, read from the tokens of main.css. */
export interface DiagramColors {
  readonly paper: string
  readonly panel: string
  readonly panelRaised: string
  readonly line: string
  readonly lineStrong: string
  readonly ink: string
  readonly inkSoft: string
  readonly inkFaint: string
  readonly selected: string
  readonly font: string
}

/** The token of main.css behind each colour. */
export const DIAGRAM_TOKENS: Record<keyof DiagramColors, string> = {
  paper: '--paper',
  panel: '--panel',
  panelRaised: '--panel-raised',
  line: '--line',
  lineStrong: '--line-strong',
  ink: '--ink',
  inkSoft: '--ink-soft',
  inkFaint: '--ink-faint',
  selected: '--selected',
  font: '--ui'
}

/**
 * The settings a diagram cannot change from its own text — `%%{init: …}%%` or a frontmatter of
 * the block —: Mermaid's own, and what keeps a label from becoming HTML or the sanitizer from
 * being loosened.
 */
export const SECURE_KEYS = [
  'secure',
  'securityLevel',
  'startOnLoad',
  'maxTextSize',
  'maxEdges',
  'suppressErrorRendering',
  'htmlLabels',
  'dompurifyConfig',
  'themeCSS'
] as const

/**
 * How Mermaid draws in the window: at its strictest security level, labels as SVG text rather
 * than HTML, no picture of its own for an error — the window says it —, and the colours of the
 * window's tokens: ink on paper, in three strengths (docs/design.md, "Look").
 */
export function mermaidConfig(colors: DiagramColors, dark: boolean): MermaidConfig {
  return {
    startOnLoad: false,
    securityLevel: 'strict',
    htmlLabels: false,
    suppressErrorRendering: true,
    secure: [...SECURE_KEYS],
    theme: 'base',
    darkMode: dark,
    fontFamily: colors.font,
    themeVariables: {
      darkMode: dark,
      fontFamily: colors.font,
      fontSize: '14px',
      background: colors.paper,
      primaryColor: colors.panel,
      primaryTextColor: colors.ink,
      primaryBorderColor: colors.inkSoft,
      secondaryColor: colors.selected,
      secondaryTextColor: colors.ink,
      secondaryBorderColor: colors.inkSoft,
      tertiaryColor: colors.panelRaised,
      tertiaryTextColor: colors.ink,
      tertiaryBorderColor: colors.lineStrong,
      lineColor: colors.inkSoft,
      textColor: colors.ink,
      mainBkg: colors.panel,
      nodeBorder: colors.inkSoft,
      clusterBkg: colors.panelRaised,
      clusterBorder: colors.lineStrong,
      edgeLabelBackground: colors.paper,
      titleColor: colors.ink,
      noteBkgColor: colors.panelRaised,
      noteTextColor: colors.ink,
      noteBorderColor: colors.lineStrong,
      actorBkg: colors.panel,
      actorBorder: colors.inkSoft,
      actorTextColor: colors.ink,
      actorLineColor: colors.inkFaint,
      signalColor: colors.inkSoft,
      signalTextColor: colors.ink,
      labelBoxBkgColor: colors.panel,
      labelBoxBorderColor: colors.inkSoft,
      labelTextColor: colors.ink,
      loopTextColor: colors.ink,
      activationBkgColor: colors.selected,
      activationBorderColor: colors.inkSoft,
      sequenceNumberColor: colors.paper
    }
  }
}

/** `url(…)` with what it points to, quoted or not. */
const URL_FUNCTION = /url\(\s*(['"]?)(.*?)\1\s*\)/gi

/**
 * CSS of a drawing as it may stay: what points into the drawing itself — `url(#marker)` — and
 * nothing that would fetch: no `@import`, no `url()` to anywhere else, no `image-set()`. Mermaid
 * writes what a diagram's `classDef` and `style` lines say into its CSS, and an ADR is not
 * trusted; the window's policy would refuse the request, a file of the export opened on its own
 * would not.
 */
export function scrubCss(css: string): string {
  return css
    .replace(/@import\b[^;]*;?/gi, '')
    .replace(/(?:-webkit-)?image-set\([^)]*\)/gi, 'none')
    .replace(URL_FUNCTION, (whole, _quote: string, target: string) =>
      target.trim().startsWith('#') ? whole : 'none'
    )
}

/**
 * What an address in a drawing may be: a fragment of the drawing itself, and on a link a web
 * address — which the window opens in the browser, as any link of an ADR. Anything else goes.
 */
export function keepsAddress(element: string, address: string): boolean {
  const value = address.trim()
  if (value.startsWith('#')) return true
  return element.toLowerCase() === 'a' && /^https?:\/\//i.test(value)
}

/** How long what Mermaid says about a block may be beside it. */
const SAID_AT_MOST = 300

/**
 * What Mermaid said about a block it cannot draw, as one line beside the block: the line that
 * names where, and the one that says what it expected, without the picture of the line between.
 */
export function mermaidSaid(error: unknown): string {
  const text =
    error instanceof Error ? error.message : typeof error === 'string' ? error : String(error)
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    // The quoted line and the arrow under it need a monospaced block to make sense.
    .filter((line) => line !== '' && !/^-*\^$/.test(line) && !line.startsWith('...'))
  const said = [...new Set([lines[0], lines.length > 1 ? lines.at(-1) : undefined])]
    .filter(Boolean)
    .join(' ')
    // What the parser expected can be a list of twenty tokens: the first few say enough.
    .replace(/(Expecting (?:'[^']*', ){4})(?:'[^']*', )+/, '$1…, ')
  return said.length > SAID_AT_MOST ? `${said.slice(0, SAID_AT_MOST - 1)}…` : said
}

/** What a block came to: a drawing, sanitized, or why there is none. */
export type Drawing =
  | { readonly kind: 'drawn'; readonly svg: string }
  | { readonly kind: 'failed'; readonly said: string }

/**
 * The drawings made so far, by the theme and the source of their block: a block that is shown
 * again — the preview as one types beside it — is not drawn again. The oldest go first.
 */
export class Drawings {
  private readonly drawings = new Map<string, Drawing>()

  constructor(private readonly limit = 200) {}

  get(theme: string, source: string): Drawing | undefined {
    const key = `${theme}\n${source}`
    const drawing = this.drawings.get(key)
    if (drawing) {
      // The most recently used last: what goes first is what was shown longest ago.
      this.drawings.delete(key)
      this.drawings.set(key, drawing)
    }
    return drawing
  }

  set(theme: string, source: string, drawing: Drawing): void {
    const key = `${theme}\n${source}`
    this.drawings.delete(key)
    this.drawings.set(key, drawing)
    while (this.drawings.size > this.limit) {
      this.drawings.delete(this.drawings.keys().next().value!)
    }
  }
}
