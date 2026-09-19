import rehypeSanitize from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'

// ADRs from foreign repositories are untrusted input. Raw HTML in the Markdown is dropped
// (remark-rehype does not pass it on), and what remains goes through the sanitizer's
// GitHub-like allow list: no scripts, no event handlers, no `javascript:` links.
const pipeline = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeSanitize)
  .use(rehypeStringify)

/** Render the body of an ADR to HTML that is safe to put into the page. */
export function renderMarkdown(markdown: string): string {
  return String(pipeline.processSync(markdown))
}
