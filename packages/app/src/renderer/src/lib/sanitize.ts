import type { Config, DOMPurify } from 'dompurify'
import { DRAWING_ELEMENTS, drawingRefused, fetchesInCss } from '../../../shared/drawing'
import { keepsAddress } from './mermaid'

/**
 * What Mermaid drew, as it may be shown and written (docs/adr/0016-…). An ADR is untrusted
 * input, and Mermaid puts what a block's `style` and `classDef` lines say into the CSS of its
 * drawing. So the drawing goes through DOMPurify's SVG profiles, and then its CSS is read by the
 * browser's own CSS parser: what CSS calls a `url()` is what the parser sees, whatever escapes it
 * was written with. Last, its markup is held against what a drawing may hold
 * (shared/drawing.ts), as the main process holds it again before it writes a drawing to disk.
 */

const PURIFY = {
  USE_PROFILES: { svg: true, svgFilters: true },
  // Mermaid's roles say what a drawing is to a screen reader; `aria-*` stay on their own.
  ADD_ATTR: ['role']
} satisfies Config

/** Rules a drawing's style sheet may keep, by `CSSRule.type`: style, media, keyframes, supports. */
const KEPT_RULES = new Set([1, 4, 7, 8, 12])

interface RuleList {
  readonly cssRules: CSSRuleList
  deleteRule(index: number): void
}

/** Declarations that name nothing outside the drawing, and no custom property, which could. */
function scrubDeclarations(style: CSSStyleDeclaration): void {
  for (let index = style.length - 1; index >= 0; index--) {
    const property = style.item(index)
    if (property.startsWith('--') || fetchesInCss(style.getPropertyValue(property))) {
      style.removeProperty(property)
    }
  }
}

function scrubRules(list: RuleList): void {
  for (let index = list.cssRules.length - 1; index >= 0; index--) {
    const rule = list.cssRules[index]!
    if (!KEPT_RULES.has(rule.type)) {
      list.deleteRule(index)
      continue
    }
    const { style } = rule as Partial<CSSStyleRule>
    if (style && typeof style.removeProperty === 'function') scrubDeclarations(style)
    if (rule.type === 7) {
      for (const frame of (rule as CSSKeyframesRule).cssRules) {
        scrubDeclarations((frame as CSSKeyframeRule).style)
      }
    } else if ('cssRules' in rule && 'deleteRule' in rule) {
      // Media and supports, and style rules that nest others.
      scrubRules(rule as unknown as RuleList)
    }
  }
}

/**
 * A drawing's style sheet as the browser reads it, with only style, media, supports and
 * keyframes rules — no `@import`, `@font-face`, `@namespace` —, and without a declaration that
 * names anything outside the drawing. `undefined` when what is left still holds a backslash: the
 * parser has decoded every escape it understood, and one left over is not to be trusted.
 */
export function scrubSheet(css: string): string | undefined {
  const sheet = new CSSStyleSheet()
  sheet.replaceSync(css)
  scrubRules(sheet)
  const scrubbed = [...sheet.cssRules].map((rule) => rule.cssText).join('\n')
  return scrubbed.includes('\\') ? undefined : scrubbed
}

/** The size a drawing has on its own: from its view box, as an image of the export needs it. */
function sized(root: SVGSVGElement): void {
  const box = (root.getAttribute('viewBox') ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number)
  const [, , width, height] = box
  if (box.length !== 4 || !(width! > 0) || !(height! > 0)) return
  root.setAttribute('width', String(Math.ceil(width!)))
  root.setAttribute('height', String(Math.ceil(height!)))
  root.style.removeProperty('max-width')
  if (root.getAttribute('style')?.trim() === '') root.removeAttribute('style')
}

export interface SanitizeOptions {
  /** Give the drawing the size of its view box, for an image of the export. */
  readonly sized?: boolean
}

/**
 * The SVG of a drawing as it may be shown, or `undefined` when it may not be. Serialized as XML,
 * so that it reads the same in a page and in a file.
 */
export function sanitizedDrawing(
  purify: DOMPurify,
  svg: string,
  options: SanitizeOptions = {}
): string | undefined {
  const body: Node = purify.sanitize(svg, { ...PURIFY, RETURN_DOM: true })
  const root = body instanceof Element ? body.querySelector('svg') : null
  if (!root) return undefined
  const document = root.ownerDocument
  // Comments and the like carry nothing of a drawing.
  const walker = document.createTreeWalker(root, 0x80 | 0x40 | 0x8)
  const strays: Node[] = []
  while (walker.nextNode()) strays.push(walker.currentNode)
  for (const stray of strays) stray.parentNode?.removeChild(stray)

  // What DOMPurify keeps and Mermaid does not draw with: an `image` can only show what is
  // outside the drawing, which is not shown.
  for (const element of root.querySelectorAll('*')) {
    if (!DRAWING_ELEMENTS.has(element.localName)) element.remove()
  }

  for (const element of [root, ...root.querySelectorAll('*')]) {
    if (element.localName === 'style') {
      const scrubbed = scrubSheet(element.textContent ?? '')
      if (scrubbed === undefined) return undefined
      element.textContent = scrubbed
    }
    if (element.hasAttribute('style') && 'style' in element) {
      // What the parser read of it, and nothing it could not read.
      const declarations = (element as SVGElement).style
      scrubDeclarations(declarations)
      const style = declarations.cssText
      if (style.includes('\\')) return undefined
      if (style.trim() === '') element.removeAttribute('style')
      else element.setAttribute('style', style)
    }
    for (const attribute of [...element.attributes]) {
      const { name, value } = attribute
      if (name === 'style') continue
      if (/(?:^|:)href$/i.test(name)) {
        if (!keepsAddress(element.localName, value)) element.removeAttributeNode(attribute)
      } else if (value.includes('\\') || fetchesInCss(value)) {
        // A presentation attribute is CSS as well, and what else carries a backslash is no
        // part of what Mermaid draws.
        element.removeAttributeNode(attribute)
      } else if (/[\t\n\r]/.test(value)) {
        // Serialized as references otherwise, which a drawing does not hold.
        attribute.value = value.replace(/[\t\n\r]/g, ' ')
      }
    }
  }
  if (options.sized) sized(root as SVGSVGElement)
  const serialized = new XMLSerializer().serializeToString(root)
  return drawingRefused(serialized) === undefined ? serialized : undefined
}
