import { describe, expect, it } from 'vitest'
import { memoryFileSystem } from '@adr-tool/kernel'
import { readDeclaration, type DeclaredComponent } from '@adr-tool/structure/model'
import { drawDiagram, planExport, readDiagram, textWidth, wordingOf, type Diagram } from '../src'

const PATH = 'docs/architecture/diagrams/shop.yml'

const declaration = readDeclaration(
  [
    'components:',
    '  web:',
    '    name: Web shop',
    '    description: The pages customers see, and the forms they fill in.',
    '    paths: [src/web/**]',
    '  billing:',
    '    paths: [src/billing/**]',
    ''
  ].join('\n')
)
if (declaration.kind !== 'declared') throw new Error(declaration.kind)
const components: readonly DeclaredComponent[] = declaration.components

const shop = [
  'title: The shop',
  'description: Its parts, and what each of them uses.',
  'level: container',
  'elements:',
  '  - component: billing',
  '    at: [40, 40]',
  '  - component: web',
  '    at: [400, 40]',
  '  - external: bank',
  '    name: The bank',
  '    at: [40, 200]',
  '    size: [150, 60]',
  'connections:',
  '  - from: web',
  '    to: billing',
  '    label: shows invoices',
  '  - from: billing',
  '    to: bank',
  ''
].join('\n')

function read(text: string): Diagram {
  const diagram = readDiagram(PATH, text)
  if (!diagram.readable) throw new Error(wordingOf(diagram.problems[0]))
  return diagram
}

/** The attributes of the first element of a name whose attributes match. */
function attributesOf(svg: string, element: string, matching = ''): Record<string, string> {
  const tag = new RegExp(`<${element}\\b([^>]*${matching}[^>]*)>`).exec(svg)
  if (!tag) throw new Error(`no <${element}> ${matching}`)
  return Object.fromEntries([...tag[1]!.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]))
}

describe('the picture of a Diagram', () => {
  it('is the same bytes for the same Diagram, every time', () => {
    const first = drawDiagram(read(shop), components)
    expect(drawDiagram(read(shop), components)).toBe(first)
    expect(drawDiagram(read(`# a comment changes nothing\n${shop}`), components)).toBe(first)
    expect(first.startsWith('<svg xmlns="http://www.w3.org/2000/svg" ')).toBe(true)
    expect(first.endsWith('</svg>\n')).toBe(true)
    expect(first).not.toMatch(/\r/)
  })

  it('stands each box where its file puts it, at its size or as large as its text', () => {
    const svg = drawDiagram(read(shop), components)
    const billing = attributesOf(svg, 'rect', 'x="40" y="40"')
    expect(billing).toMatchObject({ class: 'box', width: '120', height: '48' })
    const bank = attributesOf(svg, 'rect', 'x="40" y="200"')
    expect(bank).toMatchObject({ width: '150', height: '60' })
    // The web's description is wrapped inside a box as wide as it allows.
    const web = attributesOf(svg, 'rect', 'x="400" y="40"')
    expect(web.width).toBe('240')
    expect(Number(web.height)).toBeGreaterThan(48)
    expect(svg).toContain('>Web shop</text>')
    expect(svg).toContain('>The pages customers see, and the</text>')
    expect(svg).toContain('>forms they fill in.</text>')
  })

  it('draws an External System with a dashed border, and says so in the legend at the foot', () => {
    const svg = drawDiagram(read(shop), components)
    expect(svg).toContain('<g class="element external">')
    expect(svg).toContain('.external .box { stroke-dasharray: 6 4; }')
    const legend = svg.slice(svg.indexOf('<g class="legend">'))
    expect(legend).toContain('>Component</text>')
    expect(legend).toContain('>External System</text>')
    expect(legend).toContain('>uses; the arrow points at what is used</text>')
    expect(legend).not.toContain('This repository')
    // The legend is below every box.
    const top = Number(attributesOf(legend, 'rect').y)
    expect(top).toBeGreaterThan(200 + 60)
  })

  /** Two boxes of the same height side by side, and the bank below. */
  const plain = shop
    .replace('component: web', 'component: billing-two')
    .replace('to: billing\n', 'to: billing\n')
    .replace(/from: web/g, 'from: billing-two')

  it('points each arrow at what is used, from border to border, with its label on the line', () => {
    const svg = drawDiagram(read(plain), [])
    const paths = [
      ...svg.matchAll(/<path class="line" d="M([\d.-]+) ([\d.-]+)L([\d.-]+) ([\d.-]+)"/g)
    ]
    expect(paths).toHaveLength(2)
    const [, x0, y0, x1, y1] = paths[0]!.map(Number)
    // From the left border of billing-two towards the right one of billing, which the arrowhead reaches.
    expect([x0, y0, x1, y1]).toEqual([400, 64, 160 + 4, 64])
    expect(svg).toContain('marker-end="url(#arrow)"')
    expect(svg).toContain('text-anchor="middle">shows invoices</text>')
    expect(attributesOf(svg, 'rect', 'class="ground"')).toMatchObject({ y: '56', height: '16' })
    expect(drawDiagram(read(shop), components)).toContain(
      '<desc>Its parts, and what each of them uses. Web shop uses billing: shows invoices. billing uses The bank.</desc>'
    )
  })

  it('moves two connections between the same elements apart, one each way', () => {
    const both = plain.replace(
      'connections:\n',
      'connections:\n  - from: billing\n    to: billing-two\n'
    )
    const svg = drawDiagram(read(both), [])
    const ys = [...svg.matchAll(/<path class="line" d="M[\d.-]+ ([\d.-]+)L/g)].map((m) =>
      Number(m[1])
    )
    // Each to its own right: below the one that goes right, above the one that goes left.
    expect(ys.slice(0, 2)).toEqual([64 + 6, 64 - 6])
  })

  it('holds nothing that runs or reaches outside, and escapes every text', () => {
    const hostile = [
      'title: "<script>alert(1)</script> & co"',
      'description: "a \'quote\' and \\"double\\" <b>bold</b>\\u0000"',
      'level: system-context',
      'elements:',
      '  - repository: suite',
      '    name: "<img src=x onerror=alert(1)>"',
      '    at: [0, 0]',
      '  - external: evil',
      '    name: "javascript:alert(1)"',
      '    description: "<foreignObject>x</foreignObject>\\ttab\\nline"',
      '    at: [300, 0]',
      'connections:',
      '  - from: suite',
      '    to: evil',
      '    label: "</text><script>x</script>"',
      ''
    ].join('\n')
    const svg = drawDiagram(read(hostile), components)
    // Every element and every attribute the picture has is one of these, and only the arrow is referred to.
    const tags = [...svg.matchAll(/<([a-zA-Z]+)((?:\s+[\w-]+="[^"<>]*")*)\s*\/?>/g)]
    const names = new Set(tags.map((tag) => tag[1]))
    expect([...names].sort()).toEqual([
      'defs',
      'desc',
      'g',
      'marker',
      'path',
      'rect',
      'style',
      'svg',
      'text',
      'title'
    ])
    const attributes = new Set(
      tags.flatMap((tag) => [...tag[2]!.matchAll(/([\w-]+)=/g)].map((m) => m[1]))
    )
    expect([...attributes].filter((name) => /^on|href|src/i.test(name!))).toEqual([])
    expect(svg.match(/url\(/g)).toHaveLength(svg.match(/url\(#arrow\)/g)!.length)
    expect(svg).not.toMatch(/@import|<!|<\?/)
    // Nothing from the Diagram makes a tag of its own.
    expect(svg.match(/</g)).toHaveLength(tags.length + svg.match(/<\//g)!.length)
    expect(svg).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; co')
    expect(svg).toContain('a &apos;quote&apos; and &quot;double&quot; &lt;b&gt;bold&lt;/b&gt;�')
    expect(svg).toContain('tab line')
    const controls = [...svg].filter((char) => char < ' ' && char !== '\n')
    expect(controls).toEqual([])
    expect(svg).toContain('<g class="element repository">')
    expect(svg).toContain('>This repository</text>')
  })

  it('does not draw Drift, nor what the file does not read', () => {
    const odd = shop
      .replace(
        '  - external: bank',
        '  - component: gone\n    at: [700, 40]\n  - component: web\n    at: [900, 900]\n  - external: bank'
      )
      .replace(
        'connections:\n',
        'connections:\n  - from: web\n    to: web\n  - from: web\n    to: nowhere\n  - from: billing\n    to: gone\n'
      )
    const svg = drawDiagram(read(odd), components)
    // A Component that is gone is drawn under its ID; a second web is not drawn.
    expect(svg).toContain('>gone</text>')
    expect(svg.match(/>Web shop</g)).toHaveLength(1)
    expect(svg).not.toContain('x="900"')
    expect(svg.match(/<path class="line" d=/g)).toHaveLength(4)
    expect(svg).not.toMatch(/problem|drift|#b0382f|#f08378/i)
  })

  it('reads in light and in dark, on a ground of its own', () => {
    const svg = drawDiagram(read(shop), components)
    expect(svg).toContain('@media (prefers-color-scheme: dark)')
    const view = attributesOf(svg, 'svg').viewBox!.split(' ').map(Number)
    expect(attributesOf(svg, 'rect', 'class="background"')).toEqual({
      class: 'background',
      x: String(view[0]),
      y: String(view[1]),
      width: String(view[2]),
      height: String(view[3])
    })
    expect(attributesOf(svg, 'svg')).toMatchObject({
      width: String(view[2]),
      height: String(view[3])
    })
  })

  it('of an empty Diagram is a small picture with its ID as its title', () => {
    const svg = drawDiagram(read('level: container\n'), [])
    expect(svg).toContain('<title>shop</title>')
    expect(attributesOf(svg, 'svg')).toMatchObject({ width: '48', height: '48' })
  })
})

describe('the width of a text', () => {
  it('is estimated from fixed metrics, wider in bold', () => {
    expect(textWidth('', { size: 12 })).toBe(0)
    expect(textWidth('il', { size: 10 })).toBeCloseTo(6)
    expect(textWidth('Ab1', { size: 10 })).toBeCloseTo(19)
    expect(textWidth('MW', { size: 10 })).toBeCloseTo(18)
    expect(textWidth('é', { size: 10 })).toBeCloseTo(6.5)
    expect(textWidth('é', { size: 10 })).toBeCloseTo(6)
    expect(textWidth('图', { size: 10 })).toBeCloseTo(10)
    expect(textWidth('ab', { size: 10, bold: true })).toBeCloseTo(12.6)
  })
})

describe('the export', () => {
  const fs = (extra: Record<string, string> = {}) => memoryFileSystem({ [PATH]: shop, ...extra })
  const SVG = 'docs/architecture/diagrams/shop.svg'

  it('writes the picture beside the Diagram as a new file, previewed', async () => {
    const planned = await planExport(fs(), PATH, components)
    if (!planned.ok) throw new Error(planned.reason)
    expect(planned.svg).toBe(SVG)
    expect(planned.changeSet.files).toEqual([
      { path: SVG, before: '', after: drawDiagram(read(shop), components), creates: true }
    ])
  })

  it('replaces a picture that is not the Diagram any more, and changes nothing when it is', async () => {
    const replaced = await planExport(fs({ [SVG]: '<svg>old</svg>\n' }), PATH, components)
    if (!replaced.ok) throw new Error(replaced.reason)
    expect(replaced.changeSet.files).toEqual([
      { path: SVG, before: '<svg>old</svg>\n', after: drawDiagram(read(shop), components) }
    ])
    const current = await planExport(
      fs({ [SVG]: drawDiagram(read(shop), components) }),
      PATH,
      components
    )
    expect(current).toMatchObject({ ok: true, changeSet: { files: [] } })
  })

  it('is refused for a Diagram that cannot be read or is not there', async () => {
    const broken = await planExport(memoryFileSystem({ [PATH]: 'elements: 3\n' }), PATH, components)
    expect(broken).toMatchObject({ ok: false, said: { code: 'unreadable-diagram' } })
    if (broken.ok) throw new Error('planned')
    expect(broken.reason).toBe(`${PATH} cannot be read: "elements" on line 1 must be a list.`)
    expect(await planExport(memoryFileSystem({}), PATH, components)).toMatchObject({
      ok: false,
      said: { code: 'no-longer-exists' }
    })
  })
})
