import { describe, expect, it } from 'vitest'
import { memoryFileSystem, openRepository } from '../src'
import { EXPORT_MARKER, PRINT_PAGE, exportSite, pageOf } from '../src/export'
import { slugOf } from '../src/export/markdown'

// docs/plan-roadmap.md, part 10

const adr = (front: string, body: string): string => `---\n${front}\n---\n\n${body}`

const REPOSITORY = {
  '.adr/config.yml': 'logs:\n  - path: docs/adr\n  - path: services/billing/adr\n',
  'docs/adr/0001-use-postgres.md': adr(
    'status: accepted\ncreated: 2026-01-10\ndecided: 2026-01-12\ntags: [storage]',
    [
      '# Use Postgres',
      '',
      '## Context',
      '',
      'See [Kafka](0002-use-kafka.md#decision), [invoices](../../services/billing/adr/0001-invoices.md),',
      '[the README](../../README.md), [the docs](https://example.com/docs) and [above](#context).',
      '',
      '![Schema](img/schema.png) ![Remote](https://example.com/x.png)',
      '',
      '<script>alert(1)</script>',
      ''
    ].join('\n')
  ),
  'docs/adr/0002-use-kafka.md': adr(
    'status: proposed\nsupersedes: [0001-use-postgres]',
    '# Use Kafka <for> "events"\n\n## Decision\n\nKafka.\n'
  ),
  'services/billing/adr/0001-invoices.md': adr(
    'status: accepted\ndepends-on: [docs/adr/0001-use-postgres]',
    '# Invoices\n'
  )
}

async function exported(logs?: string[]) {
  const repository = await openRepository(memoryFileSystem(REPOSITORY))
  return exportSite(repository, {
    title: 'Shop & Co',
    date: '2026-11-02',
    ...(logs && { logs })
  })
}

const fileOf = (files: readonly { path: string; text: string }[], path: string): string => {
  const file = files.find((one) => one.path === path)
  if (!file) throw new Error(`${path} is not exported`)
  return file.text
}

describe('the export of Decision Logs (docs/plan-roadmap.md, part 10)', () => {
  it('has an index, a page per ADR where its file is, a page to print, and its marker', async () => {
    const { files } = await exported()
    expect(files.map((file) => file.path).sort()).toEqual(
      [
        'docs/adr/0001-use-postgres.html',
        'docs/adr/0002-use-kafka.html',
        'index.html',
        PRINT_PAGE,
        'services/billing/adr/0001-invoices.html',
        EXPORT_MARKER,
        'style.css'
      ].sort()
    )
    expect(JSON.parse(fileOf(files, EXPORT_MARKER))).toEqual({
      generator: 'Softarch Suite',
      date: '2026-11-02',
      title: 'Shop & Co',
      logs: ['docs/adr', 'services/billing/adr'],
      files: [
        'docs/adr/0001-use-postgres.html',
        'docs/adr/0002-use-kafka.html',
        'docs/adr/img/schema.png',
        'index.html',
        PRINT_PAGE,
        'services/billing/adr/0001-invoices.html',
        'style.css'
      ]
    })
  })

  it('lists every ADR in the index by Status, with links that work from disk', async () => {
    const index = fileOf((await exported()).files, 'index.html')
    expect(index).toContain('<h1>Shop &amp; Co</h1>')
    expect(index).toContain('<a href="docs/adr/0001-use-postgres.html">Use Postgres</a>')
    expect(index).toContain('<td class="date">2026-01-12</td>')
    expect(index).toContain('Use Kafka &lt;for&gt; &quot;events&quot;')
    expect(index.indexOf('Accepted')).toBeLessThan(index.indexOf('Proposed'))
    expect(index).toContain('href="services/billing/adr/0001-invoices.html"')
  })

  it('links an ADR to the ADRs its text and its Relations name, in its log and in others', async () => {
    const page = fileOf((await exported()).files, 'docs/adr/0001-use-postgres.html')
    expect(page).toContain('<a href="../../docs/adr/0002-use-kafka.html#decision">Kafka</a>')
    expect(page).toContain('<a href="../../services/billing/adr/0001-invoices.html">invoices</a>')
    // A link within the ADR, to a heading that has the id GitHub would give it.
    expect(page).toContain('<h2 id="context">Context</h2>')
    expect(page).toContain('<a href="#context">above</a>')
    // Its Relations: the pending supersede, and the dependency from another log.
    expect(page).toContain(
      '<dt>Supersede proposed by</dt><dd><a href="../../docs/adr/0002-use-kafka.html">0002 Use Kafka &lt;for&gt; &quot;events&quot;</a></dd>'
    )
    expect(page).toContain('<dt>Needed by</dt>')
    expect(page).toContain('href="../../services/billing/adr/0001-invoices.html">0001 Invoices</a>')
    expect(page).toContain('<a rel="next" href="../../docs/adr/0002-use-kafka.html">')
    expect(page).toContain('<link rel="stylesheet" href="../../style.css">')
  })

  it('keeps a web link, and makes a link to a file it does not export plain text', async () => {
    const page = fileOf((await exported()).files, 'docs/adr/0001-use-postgres.html')
    expect(page).toContain('<a href="https://example.com/docs">the docs</a>')
    expect(page).toContain('<a title="../../README.md">the README</a>')
  })

  it('copies the images of the repository, and fetches none from elsewhere', async () => {
    const { files, images } = await exported()
    const page = fileOf(files, 'docs/adr/0001-use-postgres.html')
    expect(images).toEqual(['docs/adr/img/schema.png'])
    expect(page).toContain('<img src="../../docs/adr/img/schema.png" alt="Schema">')
    expect(page).toContain('<a href="https://example.com/x.png">Remote</a>')
    expect(page).toContain(`content="default-src 'none'; style-src 'self'; img-src 'self'"`)
  })

  it('runs nothing an ADR brings along', async () => {
    const page = fileOf((await exported()).files, 'docs/adr/0001-use-postgres.html')
    expect(page).not.toContain('<script')
    const kafka = fileOf((await exported()).files, 'docs/adr/0002-use-kafka.html')
    expect(kafka).toContain(
      '<title>0002 Use Kafka &lt;for&gt; &quot;events&quot; — Shop &amp; Co</title>'
    )
  })

  it('prints every ADR on a page of its own, its links leading within the page', async () => {
    const { files, print } = await exported()
    expect(fileOf(files, PRINT_PAGE)).toBe(print)
    expect(print.match(/<article class="adr" id="/g)).toHaveLength(3)
    const kafka = /<article class="adr" id="([^"]+)">\n<header>\n<p class="id">ADR 0002/.exec(
      print
    )?.[1]
    expect(kafka).toBeDefined()
    expect(print).toContain(`<a href="#${kafka}-decision">Kafka</a>`)
    expect(print).toContain(`<h2 id="${kafka}-decision">Decision</h2>`)
    expect(print).toContain('<img src="docs/adr/img/schema.png" alt="Schema">')
  })

  it('exports the Decision Logs it is asked for, and links only to what it exports', async () => {
    const { files } = await exported(['docs/adr'])
    expect(files.map((file) => file.path)).not.toContain('services/billing/adr/0001-invoices.html')
    const page = fileOf(files, 'docs/adr/0001-use-postgres.html')
    expect(page).toContain('<a title="../../services/billing/adr/0001-invoices.md">invoices</a>')
  })

  it('names a page as its file, as HTML, and a heading as GitHub does', () => {
    expect(pageOf('docs/adr/0001-a.md')).toBe('docs/adr/0001-a.html')
    expect(slugOf('Größe & Gewicht: 2. Teil')).toBe('größe--gewicht-2-teil')
  })
})
