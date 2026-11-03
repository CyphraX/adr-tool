import { describe, expect, it } from 'vitest'
import { drawingRefused, fetchesInCss } from '../src/shared/drawing'

// docs/adr/0016-…: what a sanitized drawing may hold, checked on its markup by the window and by
// the main process. The review of part 2 found the cases below past a list of words to look for.

const SVG = 'xmlns="http://www.w3.org/2000/svg"'
const svg = (inner: string, attributes = ''): string => `<svg ${SVG}${attributes}>${inner}</svg>`

describe('a drawing as its markup says', () => {
  it('may be what Mermaid draws: its elements, its style sheet, its markers and gradients', () => {
    const drawing = svg(
      '<style>#d .label{font-family:"IBM Plex Sans";fill:#1c2230}#d .a &gt; .b{marker-end:url("#arrow")}@keyframes dash{to{stroke-dashoffset:0}}</style>' +
        '<defs><marker id="arrow"><path d="M 0 0 L 10 5 z"/></marker><linearGradient id="g"><stop offset="0"/></linearGradient></defs>' +
        '<g class="node" style="fill: url(&quot;#g&quot;);" data-id="a"><rect width="10" height="10" rx="5"/>' +
        '<text xml:space="preserve"><tspan>Plan &amp; preview</tspan></text></g>' +
        '<a xlink:href="https://example.com"><text>web</text></a>',
      ' xmlns:xlink="http://www.w3.org/1999/xlink" width="100%" viewBox="0 0 10 10" role="graphics-document document" aria-roledescription="flowchart-v2"'
    )
    expect(drawingRefused(drawing)).toBeUndefined()
    expect(drawingRefused(`  ${svg('<g/>')}\n`)).toBeUndefined()
  })

  it('never looks at the text of a label, which may say anything', () => {
    expect(
      drawingRefused(
        svg('<text>javascript:alert(1) onload="x" url(https://x) \\72 &lt;script&gt;</text>')
      )
    ).toBeUndefined()
  })

  it('refuses elements that are not drawn with, and any element with a prefix', () => {
    expect(drawingRefused(svg('<script>alert(1)</script>'))).toBe('the element script')
    expect(drawingRefused(svg('<foreignObject><div/></foreignObject>'))).toBe(
      'the element foreignObject'
    )
    expect(drawingRefused(svg('<use href="#a"/>'))).toBe('the element use')
    expect(
      drawingRefused(svg('<s:script>alert(1)</s:script>', ' xmlns:s="http://www.w3.org/2000/svg"'))
    ).toBe('the attribute xmlns:s')
    expect(drawingRefused(svg('<s:script>alert(1)</s:script>'))).toBe('a prefixed element')
    expect(drawingRefused(svg('<h:img xmlns:h="http://www.w3.org/1999/xhtml" src="x"/>'))).toBe(
      'a prefixed element'
    )
    expect(drawingRefused(svg('<g xmlns="http://www.w3.org/1999/xhtml"/>'))).toBe(
      'the attribute xmlns'
    )
  })

  it('refuses handlers, prefixed or not, and addresses that lead out', () => {
    expect(drawingRefused(svg('<g onclick="alert(1)"/>'))).toBe('a handler, onclick')
    expect(drawingRefused(svg('<g ONLOAD="alert(1)"/>'))).toBe('a handler, ONLOAD')
    expect(drawingRefused(svg('<g x:onclick="alert(1)"/>'))).toBe('a handler, x:onclick')
    expect(drawingRefused(svg('<a href="javascript:alert(1)"/>'))).toBe('an address in href')
    expect(drawingRefused(svg('<a href="jav&#x61;script:alert(1)"/>'))).toBe('an entity in href')
    expect(drawingRefused(svg('<a href="&#106;avascript:alert(1)"/>'))).toBe('an entity in href')
    expect(drawingRefused(svg('<image href="https://attacker.example/t.png"/>'))).toBe(
      'the element image'
    )
    expect(drawingRefused(svg('<g href="https://attacker.example/"/>'))).toBe('an address in href')
    expect(drawingRefused(svg('<a xlink:href="#node"><text>x</text></a>'))).toBeUndefined()
  })

  it('refuses CSS that fetches, and any backslash in an attribute or a style sheet', () => {
    expect(drawingRefused(svg('<g style="filter:url(https://attacker.example/t.svg#f)"/>'))).toBe(
      'CSS that fetches, in style'
    )
    expect(drawingRefused(svg('<g filter="url(https://attacker.example/t.svg#f)"/>'))).toBe(
      'CSS that fetches, in filter'
    )
    expect(
      drawingRefused(svg('<g style="filter:u\\72l(https://attacker.example/t.svg#f)"/>'))
    ).toBe('an escape in style')
    expect(
      drawingRefused(svg('<style>.a{filter:u\\72l(https://attacker.example/t.svg)}</style>'))
    ).toBe('an escape in a style sheet')
    expect(drawingRefused(svg('<style>@import "https://attacker.example/a.css";</style>'))).toBe(
      'an at-rule that loads'
    )
    expect(drawingRefused(svg('<style>@font-face{font-family:x}</style>'))).toBe(
      'an at-rule that loads'
    )
    expect(drawingRefused(svg('<style>.a{background:image-set("a.png" 1x)}</style>'))).toBe(
      'CSS that fetches'
    )
    expect(drawingRefused(svg('<style>.a{fill:var(--x)}</style>'))).toBe('CSS that fetches')
    expect(drawingRefused(svg('<style>.a{fill:#fff}&#x3C;</style>'))).toBe(
      'an entity in a style sheet'
    )
  })

  it('refuses what is not one well-formed SVG element', () => {
    expect(drawingRefused('<p>not a drawing</p>')).toBe('no SVG')
    expect(drawingRefused(`${svg('<g/>')}<script>alert(1)</script>`)).toBe('more than one root')
    expect(drawingRefused(`${svg('<g/>')} text`)).toBe('text outside the drawing')
    expect(drawingRefused(svg('<g>'))).toBe('markup that is not well formed')
    expect(drawingRefused(svg('<g></text>'))).toBe('markup that is not well formed')
    expect(drawingRefused(svg('<!-- x --><g/>'))).toBe('a comment or declaration')
    expect(drawingRefused(svg('<g x=1/>'))).toBe('markup that is not well formed')
    expect(drawingRefused(`<svg ${SVG}><g/>`)).toBe('markup that is not well formed')
  })
})

describe('CSS that fetches', () => {
  it('is a url() other than one into the drawing, or a function that loads or looks elsewhere', () => {
    expect(fetchesInCss('marker-end: url(#arrow)')).toBe(false)
    expect(fetchesInCss('fill: url("#g")')).toBe(false)
    expect(fetchesInCss("fill: url( '#g' )")).toBe(false)
    expect(fetchesInCss('fill: rgb(1, 2, 3); transform: translate(1px)')).toBe(false)
    expect(fetchesInCss('filter: url("https://attacker.example/t.svg#f")')).toBe(true)
    expect(fetchesInCss('background: URL(data:image/png;base64,AAAA)')).toBe(true)
    expect(fetchesInCss('background: -webkit-image-set("a.png" 1x)')).toBe(true)
    expect(fetchesInCss('background: cross-fade(a, b)')).toBe(true)
    expect(fetchesInCss('background: -moz-element(#x)')).toBe(true)
    expect(fetchesInCss('fill: var(--x)')).toBe(true)
    expect(fetchesInCss('content: attr(data-x)')).toBe(true)
  })
})
