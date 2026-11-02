import rehypeSanitize from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'

/** Where an ADR lies, so that the images it names can be found next to it. */
export interface DocumentBase {
  readonly repositoryId: string
  /** The directory of the ADR's file, relative to the root of the repository. */
  readonly directory: string
}

/** The base of an ADR's file in a repository. */
export function baseOf(repositoryId: string, path: string): DocumentBase {
  return { repositoryId, directory: path.slice(0, Math.max(0, path.lastIndexOf('/'))) }
}

/**
 * The URL under which the main process serves an image of the repository (main/assets.ts), for
 * a source as the ADR writes it: relative to the ADR's directory, or to the root with a leading
 * slash. A source with a scheme stays as it is — the page's policy decides about it — and one
 * that leads out of the repository has none.
 */
export function assetSource(base: DocumentBase, source: string): string | undefined {
  if (/^[a-z][a-z0-9+.-]*:/i.test(source) || source.startsWith('//')) return source
  const path = source.split(/[?#]/)[0]!
  if (path === '') return undefined
  const segments = path.startsWith('/') ? [] : base.directory.split('/').filter(Boolean)
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
    } else if (segment.includes('/') || segment.includes('\\')) return undefined
    else segments.push(segment)
  }
  if (segments.length === 0) return undefined
  return `adr-asset://${base.repositoryId}/${segments.map(encodeURIComponent).join('/')}`
}

/** As much of a node of the HTML tree as the images need. */
interface HtmlNode {
  readonly type: string
  readonly tagName?: string
  readonly properties?: Record<string, unknown>
  readonly children?: readonly HtmlNode[]
}

/** After the sanitizer: the sources of images, rewritten to where the main process serves them. */
function rehypeImages() {
  return (tree: HtmlNode, file: { data: object }): void => {
    const base = (file.data as { base?: DocumentBase }).base
    if (!base) return
    const visit = (node: HtmlNode): void => {
      if (node.type === 'element' && node.tagName === 'img' && node.properties) {
        rewrite(node.properties, base)
      }
      node.children?.forEach(visit)
    }
    visit(tree)
  }
}

function rewrite(properties: Record<string, unknown>, base: DocumentBase): void {
  const source = properties['src']
  if (typeof source !== 'string') return
  const rewritten = assetSource(base, source)
  if (rewritten === undefined) delete properties['src']
  else properties['src'] = rewritten
}

// ADRs from foreign repositories are untrusted input. Raw HTML in the Markdown is dropped
// (remark-rehype does not pass it on), and what remains goes through the sanitizer's
// GitHub-like allow list: no scripts, no event handlers, no `javascript:` links. Images are
// rewritten after it, so that the sanitizer never sees the protocol of the main process.
const pipeline = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeSanitize)
  .use(rehypeImages)
  .use(rehypeStringify)

/**
 * Render the body of an ADR to HTML that is safe to put into the page. With a base, the images
 * it names in its repository are shown.
 */
export function renderMarkdown(markdown: string, base?: DocumentBase): string {
  return String(pipeline.processSync({ value: markdown, data: base ? { base } : {} }))
}
