import { describe, expect, it } from 'vitest'
import { mermaidSources } from '@adr-tool/core/export'
import {
  Drawings,
  SECURE_KEYS,
  isMermaidInfo,
  keepsAddress,
  mermaidConfig,
  mermaidSaid,
  type DiagramColors
} from '../src/renderer/src/lib/mermaid'

// docs/plan-vision.md, part 2; docs/adr/0016-…

const COLORS: DiagramColors = {
  paper: '#fcfcfd',
  panel: '#eef1f5',
  panelRaised: '#f7f8fa',
  line: '#dde2ea',
  lineStrong: '#c5ccd8',
  ink: '#1c2230',
  inkSoft: '#566075',
  inkFaint: '#8891a3',
  selected: '#dbe4f3',
  font: "'IBM Plex Sans', system-ui, sans-serif"
}

describe('a Mermaid block', () => {
  it('is a fence whose info string starts with the word mermaid', () => {
    expect(isMermaidInfo('mermaid')).toBe(true)
    expect(isMermaidInfo(' mermaid title="Flow"')).toBe(true)
    expect(isMermaidInfo('Mermaid')).toBe(false)
    expect(isMermaidInfo('mermaidx')).toBe(false)
    expect(isMermaidInfo('')).toBe(false)
    expect(isMermaidInfo('ts mermaid')).toBe(false)
  })

  it('is found in an ADR as the export finds it, so that its drawing is shown there', () => {
    const body = '# A\n\n```mermaid\nflowchart LR\n  a --> b\n```\n\n```ts\nx\n```\n'
    expect(mermaidSources(body)).toEqual(['flowchart LR\n  a --> b'])
  })
})

describe('Mermaid, as the window sets it up', () => {
  it('runs at its strictest, draws labels as SVG text, and draws no error of its own', () => {
    const config = mermaidConfig(COLORS, false)
    expect(config.securityLevel).toBe('strict')
    expect(config.htmlLabels).toBe(false)
    expect(config.startOnLoad).toBe(false)
    expect(config.suppressErrorRendering).toBe(true)
  })

  it('lets no diagram loosen that from its own text, nor write its fonts or theme into the CSS', () => {
    const secure = mermaidConfig(COLORS, true).secure ?? []
    const keys = ['securityLevel', 'htmlLabels', 'dompurifyConfig', 'maxTextSize', 'themeCSS']
    // The review of part 2: `%%{init: {"fontFamily": "x; filter: u\\72l(…)"}}%%` reached the CSS.
    keys.push('fontFamily', 'altFontFamily', 'themeVariables', 'theme', 'layout')
    for (const key of keys) {
      expect(secure).toContain(key)
    }
    expect(secure).toEqual([...SECURE_KEYS])
  })

  it('draws in the colours of the tokens, light or dark', () => {
    const light = mermaidConfig(COLORS, false)
    expect(light.theme).toBe('base')
    expect(light.themeVariables.primaryTextColor).toBe(COLORS.ink)
    expect(light.themeVariables.background).toBe(COLORS.paper)
    expect(light.themeVariables.lineColor).toBe(COLORS.inkSoft)
    expect(light.themeVariables.darkMode).toBe(false)
    const dark = mermaidConfig({ ...COLORS, ink: '#e4e7ee' }, true)
    expect(dark.themeVariables.darkMode).toBe(true)
    expect(dark.themeVariables.textColor).toBe('#e4e7ee')
    // Nothing but the tokens: every colour is one of them.
    const values = new Set<string>(Object.values(COLORS))
    for (const [name, value] of Object.entries(light.themeVariables as Record<string, unknown>)) {
      if (typeof value === 'string' && value.startsWith('#')) expect(values, name).toContain(value)
    }
  })
})

describe('what is taken out of a drawing beyond the sanitizer', () => {
  it('keeps an address into the drawing, and a web link on a link', () => {
    expect(keepsAddress('use', '#node-1')).toBe(true)
    expect(keepsAddress('a', 'https://example.com')).toBe(true)
    expect(keepsAddress('image', 'https://evil.example/x.png')).toBe(false)
    expect(keepsAddress('a', 'javascript:alert(1)')).toBe(false)
    expect(keepsAddress('a', 'file:///etc/passwd')).toBe(false)
    expect(keepsAddress('image', 'data:image/png;base64,AAAA')).toBe(false)
  })
})

describe('a block that cannot be drawn', () => {
  it('says what Mermaid said, as one line: where, and what it expected', () => {
    const error = new Error(
      "Parse error on line 2:\n...LR\n  a -->\n-------------^\nExpecting 'AMP', 'COLON', 'PIPE', got 'EOF'"
    )
    expect(mermaidSaid(error)).toBe(
      "Parse error on line 2: Expecting 'AMP', 'COLON', 'PIPE', got 'EOF'"
    )
    expect(mermaidSaid('No diagram type detected matching given configuration for text: x')).toBe(
      'No diagram type detected matching given configuration for text: x'
    )
    expect(
      mermaidSaid(
        "Parse error on line 2:\n...b(\n---^\nExpecting 'SQE', 'PE', '-)', 'PIPE', 'TEXT', 'TAGSTART', got 'PS'"
      )
    ).toBe("Parse error on line 2: Expecting 'SQE', 'PE', '-)', 'PIPE', …, got 'PS'")
    expect(mermaidSaid(new Error('x'.repeat(400)))).toHaveLength(300)
  })
})

describe('the drawings made so far', () => {
  it('are found again by theme and source, and the oldest go first', () => {
    const drawings = new Drawings(2)
    drawings.set('light', 'a', { kind: 'drawn', svg: '<svg/>' })
    drawings.set('light', 'b', { kind: 'failed', said: 'no' })
    expect(drawings.get('dark', 'a')).toBeUndefined()
    // Used again: it stays when another comes.
    expect(drawings.get('light', 'a')).toEqual({ kind: 'drawn', svg: '<svg/>' })
    drawings.set('light', 'c', { kind: 'drawn', svg: '<svg/>' })
    expect(drawings.get('light', 'b')).toBeUndefined()
    expect(drawings.get('light', 'a')).toBeDefined()
    expect(drawings.get('light', 'c')).toBeDefined()
  })
})
