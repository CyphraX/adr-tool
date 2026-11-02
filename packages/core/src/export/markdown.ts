import rehypeSanitize from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'

/** Where the page of an ADR finds what its text points to. */
export interface Links {
  /** The directory of the ADR's file, relative to the root of the repository. */
  readonly directory: string
  /**
   * Where a link to a file of the repository leads in the export, or `undefined` when the
   * file is not exported: the link is then text.
   */
  readonly link: (path: string, fragment: string) => string | undefined
  /**
   * Where an image of the repository is in the export, where it is copied to; `undefined` for
   * a file that is no image (`imageOf`): the image is then its alt text.
   */
  readonly image: (path: string) => string | undefined
  /**
   * The `id` of a heading of the ADR, from its slug as GitHub makes it; a link to `#slug` in
   * the same ADR leads there.
   */
  readonly heading: (slug: string) => string
}

/** As much of a node of the HTML tree as the links need. */
interface HtmlNode {
  type: string
  tagName?: string
  value?: string
  properties?: Record<string, unknown>
  children?: HtmlNode[]
}

/** The text of a node and all below it. */
const textOf = (node: HtmlNode): string =>
  node.type === 'text' ? (node.value ?? '') : (node.children ?? []).map(textOf).join('')

/** A heading's slug as GitHub makes it: lower case, letters, digits, `-` and `_`, spaces as `-`. */
export function slugOf(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
    .replaceAll(' ', '-')
}

/**
 * The path in the repository a relative reference of an ADR names, or `undefined` for a
 * reference with a scheme or a host, one with a backslash, one that leads out of the
 * repository. As the app reads an image's source (packages/app/src/renderer/src/lib/markdown.ts).
 */
export function repositoryPath(directory: string, reference: string): string | undefined {
  if (/^[a-z][a-z0-9+.-]*:/i.test(reference) || reference.startsWith('//')) return undefined
  if (reference.includes('\\')) return undefined
  const path = reference.split(/[?#]/)[0]!
  if (path === '') return undefined
  const segments = path.startsWith('/') ? [] : directory.split('/').filter(Boolean)
  for (const raw of path.split('/')) {
    let segment: string
    try {
      segment = decodeURIComponent(raw)
    } catch {
      return undefined
    }
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      if (segments.length === 0) return undefined
      segments.pop()
    } else if (segment.includes('/')) return undefined
    else segments.push(segment)
  }
  return segments.length === 0 ? undefined : segments.join('/')
}

/** The extensions of the images an export copies: those the app shows (main/assets.ts). */
const IMAGE = /\.(?:apng|avif|bmp|gif|ico|jpe?g|png|svg|webp)$/i

/**
 * Whether a path of the repository is an image the export may copy: a file with the extension
 * of one, and not one that is hidden — the export never takes `.git/` or `.env` along, whatever
 * an ADR names.
 */
export const isImage = (path: string): boolean =>
  IMAGE.test(path) && !path.split('/').some((segment) => segment.startsWith('.'))

/**
 * The ids `remark-rehype` gives footnotes start with `user-content-`, and the sanitizer puts
 * the same prefix in front again; the pages have no script that ids could clobber.
 */
const unprefixed = (id: string): string => id.replace(/^(?:user-content-)+/, '')

const decodeFragment = (fragment: string): string => {
  try {
    return decodeURIComponent(fragment)
  } catch {
    return fragment
  }
}

/** After the sanitizer: links and images pointed to where they are in the export. */
function rehypeExport() {
  return (tree: HtmlNode, file: { data: object }): void => {
    const links = (file.data as { links: Links }).links
    // As github-slugger counts: the second heading of a name is `-1`, and a suffix that is
    // taken already by a heading of that name is skipped.
    const occurrences = new Map<string, number>()
    const unique = (slug: string): string => {
      let result = slug
      while (occurrences.has(result)) {
        const count = occurrences.get(slug)! + 1
        occurrences.set(slug, count)
        result = `${slug}-${count}`
      }
      occurrences.set(result, 0)
      return result
    }
    const visit = (node: HtmlNode): void => {
      const properties = node.properties
      if (node.type === 'element' && properties) {
        const id = properties['id']
        if (/^h[1-6]$/.test(node.tagName ?? '') && typeof id !== 'string') {
          properties['id'] = links.heading(unique(slugOf(textOf(node))))
        } else if (typeof id === 'string') {
          // The footnotes, and the heading above them, keep the ids they were given.
          properties['id'] = links.heading(unprefixed(id))
        }
        const described = properties['ariaDescribedBy']
        if (Array.isArray(described)) {
          properties['ariaDescribedBy'] = described.map((one) =>
            links.heading(unprefixed(String(one)))
          )
        }
        if (node.tagName === 'a' && typeof properties['href'] === 'string') {
          const href = properties['href']
          if (href.startsWith('#')) {
            properties['href'] = `#${links.heading(unprefixed(decodeFragment(href.slice(1))))}`
          } else if (!/^(?:https?:|mailto:)/i.test(href)) {
            const path = repositoryPath(links.directory, href)
            const fragment = decodeFragment(/#(.*)$/.exec(href)?.[1] ?? '')
            const target = path === undefined ? undefined : links.link(path, fragment)
            if (target === undefined) {
              delete properties['href']
              properties['title'] = href
            } else properties['href'] = target
          }
        }
        if (node.tagName === 'img') {
          const source = properties['src']
          const path =
            typeof source === 'string' ? repositoryPath(links.directory, source) : undefined
          const copied = path === undefined ? undefined : links.image(path)
          const alt = typeof properties['alt'] === 'string' ? properties['alt'] : ''
          if (copied !== undefined) properties['src'] = copied
          else if (path !== undefined) {
            // A file of the repository that is no image is not copied: its alt text stays.
            node.type = 'text'
            node.value = alt
            delete node.tagName
            delete node.properties
          } else {
            // An image from elsewhere would be fetched from the network: it is a link to it.
            node.tagName = 'a'
            node.properties =
              typeof source === 'string' && /^https?:/i.test(source) ? { href: source } : {}
            node.children = [{ type: 'text', value: alt || String(source ?? '') }]
          }
        }
      }
      node.children?.forEach(visit)
    }
    visit(tree)
  }
}

// The same pipeline as the app's: raw HTML is dropped, what remains goes through the
// sanitizer's GitHub-like allow list. Links are rewritten after it.
const pipeline = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeSanitize)
  .use(rehypeExport)
  .use(rehypeStringify)

/** The body of an ADR as HTML that is safe to put into a page of the export. */
export function renderBody(markdown: string, links: Links): string {
  return String(pipeline.processSync({ value: markdown, data: { links } }))
}
