// @vitest-environment jsdom
import purify from 'dompurify'
import { describe, expect, it } from 'vitest'
import { sanitizedDrawing, scrubSheet } from '../src/renderer/src/lib/sanitize'

// docs/adr/0016-…, and the review of part 2: what Mermaid draws is sanitized by DOMPurify's SVG
// profiles, then its CSS is read by the CSS parser and scrubbed. jsdom's parser is not Chrome's:
// it drops a value it cannot read, `u\72l(…)` among them, where Chrome decodes the escape and
// reads a `url()`, which the scrub then takes out. What either leaves with a backslash is refused.

const ATTACKER = 'https://attacker.example/t.svg#f'
const drawing = (inner: string, style = ''): string =>
  `<svg id="d1" width="100%" xmlns="http://www.w3.org/2000/svg" style="max-width: 360px;${style}" viewBox="4 4 360 57" role="graphics-document document" aria-roledescription="flowchart-v2">${inner}</svg>`

describe('a drawing as it is shown', () => {
  it('keeps what Mermaid draws with, its roles among it', () => {
    const svg = sanitizedDrawing(
      purify,
      drawing(
        '<style>#d1 .label{font-family:"IBM Plex Sans";fill:#1c2230}#d1 .edge{marker-end:url(#arrow)}</style>' +
          '<defs><marker id="arrow"><path d="M 0 0\nL 10 5 z"/></marker></defs>' +
          '<g class="node"><rect width="10" height="10" style="fill:#eef1f5;stroke:#566075"/><text>Plan</text></g>'
      )
    )!
    expect(svg).toContain('role="graphics-document document"')
    expect(svg).toContain('aria-roledescription="flowchart-v2"')
    expect(svg).toContain('marker-end: url("#arrow")')
    expect(svg).toContain('<text>Plan</text>')
    // A line break in an attribute would be written as a reference.
    expect(svg).toContain('d="M 0 0 L 10 5 z"')
    expect(svg).not.toContain('&#')
  })

  it('takes out of its style sheet what fetches or loads, and custom properties', () => {
    const svg = sanitizedDrawing(
      purify,
      drawing(
        `<style>@import "https://attacker.example/a.css"; @font-face{font-family:x;src:url(${ATTACKER})} #d1 .a{fill:red;background:url(${ATTACKER});--v:u\\72l(${ATTACKER})} @media (min-width:1px){#d1 .b{mask:url(${ATTACKER});fill:blue}}</style><g class="a"/>`
      )
    )!
    expect(svg).not.toContain('attacker')
    expect(svg).not.toContain('@import')
    expect(svg).not.toContain('@font-face')
    expect(svg).toContain('fill: red')
    expect(svg).toContain('fill: blue')
  })

  it('takes out of a style attribute or a presentation attribute what fetches', () => {
    const svg = sanitizedDrawing(
      purify,
      drawing(
        `<g style="fill:red;filter:url(${ATTACKER})"/><g filter="url(${ATTACKER})" fill="u\\72l(${ATTACKER})"/><g style="filter:u\\72l(${ATTACKER});stroke:blue"/>`
      )
    )!
    expect(svg).not.toContain('attacker')
    expect(svg).not.toContain('\\')
    expect(svg).toContain('fill: red')
    expect(svg).toContain('stroke: blue')
  })

  it('takes out addresses that lead out, scripts and handlers', () => {
    const svg = sanitizedDrawing(
      purify,
      drawing(
        `<a href="javascript:alert(1)"><text>x</text></a><a href="https://example.com/"><text>web</text></a><image href="${ATTACKER}"/><script>alert(1)</script><g onclick="alert(1)"/><foreignObject><div>html</div></foreignObject><!-- note -->`
      )
    )!
    expect(svg).not.toMatch(/javascript|attacker|<script|onclick|foreignObject|<!--|<image/)
    expect(svg).toContain('href="https://example.com/"')
  })

  it('is refused when its style sheet keeps a backslash after the parser read it', () => {
    expect(scrubSheet('#d1 .a\\:b{fill:red}')).toBeUndefined()
    expect(
      sanitizedDrawing(purify, drawing('<style>#d1 .a\\:b{fill:red}</style><g class="a:b"/>'))
    ).toBeUndefined()
    expect(scrubSheet(`.a{filter:u\\72l(${ATTACKER});fill:red}`)).not.toContain('attacker')
  })

  it('gets the size of its view box for an image of the export', () => {
    const svg = sanitizedDrawing(purify, drawing('<g/>'), { sized: true })!
    expect(svg).toContain('width="360"')
    expect(svg).toContain('height="57"')
    expect(svg).not.toContain('max-width')
  })
})
