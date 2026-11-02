import type { Adr, GuestAdr } from '../adr/adr'
import type { DecisionLog, Repository } from '../log/load'
import type { Relation } from '../relations/graph'
import { isQualified } from '../relations/reference'
import type { RelationType } from '../relation'
import type { Status } from '../status'
import { isImage, renderBody, type Links } from './markdown'
import { STYLE } from './style'

export interface ExportOptions {
  /** The Decision Logs to export, by their directories; every log when left out. */
  readonly logs?: readonly string[]
  /** What the export is called: the name of the repository. */
  readonly title: string
  /** When it was made, `YYYY-MM-DD`; every page says so. */
  readonly date: string
}

export interface ExportedFile {
  /** Where it goes in the export, with forward slashes. */
  readonly path: string
  readonly text: string
}

/**
 * A read-only export of Decision Logs for readers who do not use the tool
 * (docs/plan-roadmap.md, part 10): HTML pages that open from disk, with nothing that needs a
 * server or the network. Writing it is the caller's: `core` writes nothing.
 */
export interface Export {
  /** The pages and the style sheet; the marker is not among them (`marker`). */
  readonly files: readonly ExportedFile[]
  /**
   * The images the ADRs show, as paths of the repository: files with the extension of an image,
   * none of them hidden (`isImage`). Each is copied, byte for byte, to the same path in the
   * export; the pages point there.
   */
  readonly images: readonly string[]
  /** The page with every exported ADR, one per printed page: what a PDF is made from. */
  readonly print: string
  /**
   * The marker, naming the files of the export: the pages and the images of `copied`. It is
   * written last, once the images that could be copied are known.
   */
  readonly marker: (copied: readonly string[]) => ExportedFile
}

/**
 * The file that marks a directory as an export, and that a new export may write over: it names
 * the export's files, with itself left out.
 */
export const EXPORT_MARKER = 'softarch-export.json'
export const PRINT_PAGE = 'print.html'

const STATUS_ORDER: readonly (Status | 'unknown')[] = [
  'accepted',
  'proposed',
  'superseded',
  'deprecated',
  'rejected',
  'unknown'
]

const STATUS_LABEL: Record<Status | 'unknown', string> = {
  proposed: 'Proposed',
  accepted: 'Accepted',
  rejected: 'Rejected',
  deprecated: 'Deprecated',
  superseded: 'Superseded',
  unknown: 'Unknown status'
}

const RELATION_WORDING: Record<RelationType, { from: string; to: string }> = {
  supersedes: { from: 'Supersedes', to: 'Superseded by' },
  amends: { from: 'Amends', to: 'Amended by' },
  'depends-on': { from: 'Depends on', to: 'Needed by' },
  'relates-to': { from: 'Relates to', to: 'Related from' }
}

const PENDING_WORDING: Partial<Record<RelationType, { from: string; to: string }>> = {
  supersedes: { from: 'Proposes to supersede', to: 'Supersede proposed by' },
  amends: { from: 'Proposes to amend', to: 'Amendment proposed by' }
}

export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/** Where the page of an ADR goes: its file's path, as HTML. */
export function pageOf(path: string): string {
  return path.replace(/\.md$/i, '') + '.html'
}

/** A link from one file of the export to another, relative, so that it works from disk. */
export function hrefFrom(from: string, to: string): string {
  const up = from.split('/').length - 1
  const encoded = to.split('/').map(encodeURIComponent).join('/')
  return '../'.repeat(up) + encoded
}

/** What an ADR of the export is to the others: its page, its name, and where it is printed. */
interface Exported {
  readonly adr: Adr | GuestAdr
  readonly log: string
  readonly page: string
  readonly anchor: string
}

export function exportSite(repository: Repository, options: ExportOptions): Export {
  const logs = repository.logs.filter(
    (log) => options.logs === undefined || options.logs.includes(log.path)
  )
  const byPath = new Map<string, Exported>()
  for (const log of logs) {
    for (const adr of log.adrs) {
      byPath.set(adr.path, {
        adr,
        log: log.path,
        page: pageOf(adr.path),
        anchor: `adr-${encodeURIComponent(adr.path.replace(/\.md$/i, '')).replaceAll('%', '_')}`
      })
    }
  }
  const images = new Set<string>()
  const files: ExportedFile[] = [{ path: 'style.css', text: STYLE }]

  /** The links of a page at `page`, for an ADR in `directory`; in print, to the anchors. */
  // In print every ADR is on one page: its headings are told apart by its anchor.
  const headingIn = (exported: Exported, print: boolean, slug: string): string =>
    print ? `${exported.anchor}-${slug}` : slug
  const linksFor = (exported: Exported, directory: string, print: boolean): Links => ({
    directory,
    link: (path, fragment) => {
      const target = byPath.get(path)
      if (!target) return undefined
      const heading = fragment ? headingIn(target, print, fragment) : undefined
      if (print) return `#${heading ?? target.anchor}`
      return hrefFrom(exported.page, target.page) + (heading ? `#${heading}` : '')
    },
    image: (path) => {
      if (!isImage(path)) return undefined
      images.add(path)
      return hrefFrom(print ? PRINT_PAGE : exported.page, path)
    },
    heading: (slug) => headingIn(exported, print, slug)
  })

  const articles: string[] = []
  for (const log of logs) {
    log.adrs.forEach((adr, position) => {
      const exported = byPath.get(adr.path)!
      const directory = adr.path.slice(0, Math.max(0, adr.path.lastIndexOf('/')))
      const article = (print: boolean): string =>
        articleOf(log, adr, exported, linksFor(exported, directory, print), print, (reference) => {
          const target = targetOf(log, reference)
          const found = target && byPath.get(target.path)
          if (!found) return undefined
          return print ? `#${found.anchor}` : hrefFrom(exported.page, found.page)
        })
      const previous = log.adrs[position - 1]
      const next = log.adrs[position + 1]
      const nav = [
        `<a href="${hrefFrom(exported.page, 'index.html')}">All decisions</a>`,
        previous
          ? `<a rel="prev" href="${hrefFrom(exported.page, pageOf(previous.path))}">← ${escapeHtml(nameOf(previous))}</a>`
          : '',
        next
          ? `<a rel="next" href="${hrefFrom(exported.page, pageOf(next.path))}">${escapeHtml(nameOf(next))} →</a>`
          : ''
      ]
        .filter(Boolean)
        .join('')
      files.push({
        path: exported.page,
        text: documentOf(
          `${nameOf(adr)} — ${options.title}`,
          hrefFrom(exported.page, 'style.css'),
          `<nav class="pages">${nav}</nav>\n${article(false)}\n${footerOf(options)}`
        )
      })
      articles.push(article(true))
    })
  }

  files.push({
    path: 'index.html',
    text: documentOf(
      `${options.title} — Architecture Decisions`,
      'style.css',
      indexOf(logs, options)
    )
  })
  const print = documentOf(
    `${options.title} — Architecture Decisions`,
    'style.css',
    `<main class="print">\n${articles.join('\n')}\n</main>`
  )
  files.push({ path: PRINT_PAGE, text: print })
  // What the export consists of: a later export into the directory removes what it no longer has.
  const marker = (copied: readonly string[]): ExportedFile => ({
    path: EXPORT_MARKER,
    text: `${JSON.stringify(
      {
        generator: 'Softarch Suite',
        date: options.date,
        title: options.title,
        logs: logs.map((log) => log.path),
        files: [...new Set([...files.map((file) => file.path), ...copied])].sort()
      },
      null,
      2
    )}\n`
  })
  return { files, images: [...images].sort(), print, marker }
}

/** An ADR as people name it: its number or ID, and its title. */
function nameOf(adr: Pick<Adr, 'id' | 'number' | 'title'>): string {
  const prefix = /^\d+/.exec(adr.id)?.[0]
  const title = adr.title ?? adr.id
  return prefix !== undefined ? `${prefix} ${title}` : title
}

/** The ADR a Relation names, in its own log or another one. */
function targetOf(log: DecisionLog, reference: string): Adr | GuestAdr | undefined {
  return isQualified(reference)
    ? log.guests.find((guest) => guest.reference === reference)
    : log.adrs.find((adr) => adr.id === reference)
}

function articleOf(
  log: DecisionLog,
  adr: Adr,
  exported: Exported,
  links: Links,
  print: boolean,
  hrefOf: (reference: string) => string | undefined
): string {
  const status = adr.metadata.status ?? 'unknown'
  const label = adr.metadata.rawStatus ?? STATUS_LABEL[status]
  const { metadata } = adr
  const facts: [string, string][] = [
    ['Created', metadata.created ?? ''],
    ['Decided', metadata.decided ?? ''],
    ['Decision-makers', metadata.decisionMakers.join(', ')],
    ['Tags', metadata.tags.join(', ')],
    ['Affects', metadata.affects.join(', ')]
  ]
  const relations = relationsOf(log, adr, hrefOf)
  const corrections = metadata.corrections.map(
    (correction) =>
      `<li>${escapeHtml([correction.date, correction.author, correction.note].filter(Boolean).join(' — '))}</li>`
  )
  return [
    `<article class="adr"${print ? ` id="${exported.anchor}"` : ''}>`,
    '<header>',
    `<p class="id">ADR ${escapeHtml(/^\d+/.exec(adr.id)?.[0] ?? adr.id)} <span class="path">${escapeHtml(adr.path)}</span></p>`,
    `<p class="status ${status}">${escapeHtml(label)}</p>`,
    '<dl class="facts">',
    ...facts
      .filter(([, value]) => value !== '')
      .map(([term, value]) => `<div><dt>${term}</dt><dd>${escapeHtml(value)}</dd></div>`),
    '</dl>',
    relations.length > 0 ? `<dl class="relations">${relations.join('')}</dl>` : '',
    corrections.length > 0
      ? `<details class="corrections"><summary>Corrections</summary><ul>${corrections.join('')}</ul></details>`
      : '',
    '</header>',
    `<div class="body">${renderBody(adr.body, links)}</div>`,
    '</article>'
  ]
    .filter(Boolean)
    .join('\n')
}

/** The Relations of an ADR, each with the ADR on its other side as a link. */
function relationsOf(
  log: DecisionLog,
  adr: Adr,
  hrefOf: (reference: string) => string | undefined
): string[] {
  const lines = (relation: Relation, side: 'from' | 'to'): string | undefined => {
    if (relation.state === 'void') return undefined
    const other = side === 'from' ? relation.to : relation.from
    const target = targetOf(log, other)
    const wording =
      (relation.state === 'pending' ? PENDING_WORDING[relation.type] : undefined) ??
      RELATION_WORDING[relation.type]
    const name = escapeHtml(target ? nameOf(target) : other)
    const href = hrefOf(other)
    const where =
      target && 'log' in target && target.log !== log.path
        ? ` <span class="log">${escapeHtml(target.log)}</span>`
        : ''
    return `<div><dt>${wording[side]}</dt><dd>${href ? `<a href="${escapeHtml(href)}">${name}</a>` : name}${where}</dd></div>`
  }
  return [
    ...log.relations
      .filter((relation) => relation.from === adr.id)
      .map((relation) => lines(relation, 'from')),
    ...log.relations
      .filter((relation) => relation.to === adr.id)
      .map((relation) => lines(relation, 'to'))
  ].filter((line) => line !== undefined)
}

function indexOf(logs: readonly DecisionLog[], options: ExportOptions): string {
  const sections = logs.map((log) => {
    const groups = STATUS_ORDER.map((status) => {
      const adrs = log.adrs.filter((adr) => (adr.metadata.status ?? 'unknown') === status)
      if (adrs.length === 0) return ''
      const rows = adrs.map((adr) => {
        const date = adr.metadata.decided ?? adr.metadata.created ?? ''
        return `<tr><td class="number">${escapeHtml(/^\d+/.exec(adr.id)?.[0] ?? '')}</td><td><a href="${hrefFrom('index.html', pageOf(adr.path))}">${escapeHtml(adr.title ?? adr.id)}</a></td><td class="date">${escapeHtml(date)}</td></tr>`
      })
      return `<section class="group"><h3><span class="status ${status}">${STATUS_LABEL[status]}</span> <span class="count">${adrs.length}</span></h3>\n<table>${rows.join('\n')}</table></section>`
    })
    return `<section class="log"><h2>${escapeHtml(log.path || '(repository root)')} <span class="count">${log.adrs.length} ADRs</span></h2>\n${groups.filter(Boolean).join('\n')}</section>`
  })
  return [
    '<header class="site">',
    `<h1>${escapeHtml(options.title)}</h1>`,
    `<p>The architecture decisions of this repository, by Status. <a href="${PRINT_PAGE}">Every ADR on one page, for printing</a>.</p>`,
    '</header>',
    '<main>',
    ...sections,
    '</main>',
    footerOf(options)
  ].join('\n')
}

function footerOf(options: ExportOptions): string {
  return `<footer>Exported on ${escapeHtml(options.date)} with Softarch Suite. Read-only: the ADRs live in the repository.</footer>`
}

function documentOf(title: string, style: string, body: string): string {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    // Nothing of the export runs, and nothing is fetched from elsewhere.
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self'; img-src 'self'">`,
    `<title>${escapeHtml(title)}</title>`,
    `<link rel="stylesheet" href="${style}">`,
    '</head>',
    `<body>\n${body}\n</body>`,
    '</html>',
    ''
  ].join('\n')
}
