/**
 * What a drawing of a Mermaid block may hold once it is sanitized (docs/adr/0016-…), checked on
 * its markup as text: by the window as the last step of sanitizing, and by the main process
 * again before anything of it is written to disk. It is an allowlist of the markup — the
 * elements Mermaid draws with, no prefix, no handler, no address that leads out, no CSS that
 * fetches —, and it never looks at the text of a label, which may say anything.
 */

const SVG = 'http://www.w3.org/2000/svg'
const XLINK = 'http://www.w3.org/1999/xlink'

/**
 * The elements a sanitized drawing is made of: what Mermaid draws with, as far as DOMPurify's
 * SVG profiles let it through. No `use`, no `image` source, no `foreignObject`, no `feImage`.
 */
export const DRAWING_ELEMENTS: ReadonlySet<string> = new Set([
  'svg',
  'g',
  'defs',
  'style',
  'title',
  'desc',
  'marker',
  'symbol',
  'switch',
  'a',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'textPath',
  'linearGradient',
  'radialGradient',
  'stop',
  'clipPath',
  'mask',
  'pattern',
  'filter',
  'feBlend',
  'feColorMatrix',
  'feComponentTransfer',
  'feComposite',
  'feDropShadow',
  'feFlood',
  'feFuncA',
  'feFuncB',
  'feFuncG',
  'feFuncR',
  'feGaussianBlur',
  'feMerge',
  'feMergeNode',
  'feMorphology',
  'feOffset'
])

/** CSS functions that fetch, or that take a value from elsewhere that could. */
const UNSAFE_FUNCTIONS = new Set([
  'url',
  'src',
  'image',
  'image-set',
  'cross-fade',
  'element',
  'var',
  'env',
  'attr'
])

/**
 * Whether CSS — a declaration's value, a style attribute, a style sheet — names anything outside
 * the drawing: a `url()` other than `url(#…)` into the drawing itself, `image-set()`,
 * `cross-fade()`, `element()`, or a function that takes its value from elsewhere (`var()`,
 * `env()`, `attr()`). Escapes are not decoded here; a backslash is refused on its own.
 */
export function fetchesInCss(css: string): boolean {
  for (const match of css.matchAll(/(-?[a-z][a-z0-9-]*)\(\s*/gi)) {
    const name = match[1]!.toLowerCase().replace(/^-(?:webkit|moz|o|ms)-/, '')
    if (!UNSAFE_FUNCTIONS.has(name)) continue
    if (name !== 'url') return true
    const target = css.slice(match.index + match[0].length).replace(/^["']\s*/, '')
    if (!target.startsWith('#')) return true
  }
  return false
}

/** At-rules a drawing's style sheet never holds: they load, or change what names mean. */
const UNSAFE_AT_RULE = /@(?:import|font-face|namespace)\b/i

/** An `&` that is none of the five entities of XML. */
const OTHER_ENTITY = /&(?!(?:amp|lt|gt|quot|apos);)/

const decode = (text: string): string =>
  text
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&')

/** What a style sheet of a drawing may not hold, said for the refusal; `undefined` if nothing. */
function sheetRefused(text: string): string | undefined {
  if (OTHER_ENTITY.test(text)) return 'an entity in a style sheet'
  const css = decode(text)
  if (css.includes('\\')) return 'an escape in a style sheet'
  if (UNSAFE_AT_RULE.test(css)) return 'an at-rule that loads'
  if (fetchesInCss(css)) return 'CSS that fetches'
  return undefined
}

/** What an attribute of a drawing may not be, said for the refusal; `undefined` if it may be. */
function attributeRefused(element: string, name: string, raw: string): string | undefined {
  if (/^(?:[^:]*:)?on/i.test(name)) return `a handler, ${name}`
  if (OTHER_ENTITY.test(raw)) return `an entity in ${name}`
  const value = decode(raw)
  if (value.includes('\\')) return `an escape in ${name}`
  if (name.includes(':') || name === 'xmlns') {
    const known =
      (name === 'xmlns' && value === SVG) ||
      (name === 'xmlns:xlink' && value === XLINK) ||
      name === 'xlink:href' ||
      name === 'xml:space' ||
      name === 'xml:lang'
    if (!known) return `the attribute ${name}`
  }
  if (name === 'href' || name === 'xlink:href') {
    const address = value.trim()
    const inside = address.startsWith('#')
    if (!inside && !(element === 'a' && /^https?:\/\//i.test(address))) {
      return `an address in ${name}`
    }
  }
  if (fetchesInCss(value)) return `CSS that fetches, in ${name}`
  return undefined
}

const NAME = /^[A-Za-z][\w.-]*/
const ATTRIBUTE = /^([A-Za-z_:][\w.:-]*)\s*=\s*(?:"([^"<]*)"|'([^'<]*)')/

/**
 * Why a drawing may not be shown or written, or `undefined` when it may: one `<svg>` element of
 * the SVG namespace, well formed, made of `DRAWING_ELEMENTS` only — no prefixed element, no
 * comment, no processing instruction —, with no handler, no address that leads out of it, no
 * entity other than the five of XML and no backslash in an attribute or a style sheet, and no CSS
 * that fetches. The text of its labels is not looked at.
 */
export function drawingRefused(svg: string): string | undefined {
  const text = svg.trim()
  if (!text.startsWith('<svg')) return 'no SVG'
  const open: string[] = []
  let at = 0
  let closed = false
  while (at < text.length) {
    const next = text.indexOf('<', at)
    const between = text.slice(at, next === -1 ? text.length : next)
    if (open.length === 0) {
      if (between.trim() !== '') return 'text outside the drawing'
    } else if (open.at(-1) === 'style') {
      const refused = sheetRefused(between)
      if (refused) return refused
    }
    if (next === -1) break
    if (closed) return 'more than one root'
    const rest = text.slice(next)
    if (rest.startsWith('</')) {
      const end = /^<\/([A-Za-z][\w.:-]*)\s*>/.exec(rest)
      if (!end || end[1] !== open.pop()) return 'markup that is not well formed'
      if (open.length === 0) closed = true
      at = next + end[0].length
      continue
    }
    if (rest.startsWith('<!') || rest.startsWith('<?')) return 'a comment or declaration'
    let position = 1
    const name = NAME.exec(rest.slice(position))?.[0]
    if (!name) return 'markup that is not well formed'
    position += name.length
    if (rest[position] === ':') return 'a prefixed element'
    if (!DRAWING_ELEMENTS.has(name)) return `the element ${name}`
    if (open.length === 0 && name !== 'svg') return 'no SVG'
    let ended: 'open' | 'empty' | undefined
    while (position < rest.length) {
      const space = /^\s*/.exec(rest.slice(position))![0].length
      position += space
      if (rest.startsWith('/>', position)) {
        ended = 'empty'
        position += 2
        break
      }
      if (rest[position] === '>') {
        ended = 'open'
        position += 1
        break
      }
      if (space === 0) return 'markup that is not well formed'
      const attribute = ATTRIBUTE.exec(rest.slice(position))
      if (!attribute) return 'markup that is not well formed'
      const refused = attributeRefused(name, attribute[1]!, attribute[2] ?? attribute[3] ?? '')
      if (refused) return refused
      position += attribute[0].length
    }
    if (!ended) return 'markup that is not well formed'
    if (ended === 'open') open.push(name)
    else if (open.length === 0) closed = true
    at = next + position
  }
  if (open.length > 0 || !closed) return 'markup that is not well formed'
  return undefined
}
