import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '../src/renderer/src/lib/markdown'

describe('renderMarkdown', () => {
  it('renders the Markdown ADRs are written in, tables and task lists included', () => {
    const html = renderMarkdown(
      '# Title\n\nSome *text* with `code`.\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n- [x] done\n'
    )
    expect(html).toContain('<h1>Title</h1>')
    expect(html).toContain('<em>text</em>')
    expect(html).toContain('<table>')
    expect(html).toContain('type="checkbox"')
  })

  // An ADR from a foreign repository is untrusted input.
  it('drops raw HTML, scripts and event handlers', () => {
    const html = renderMarkdown(
      'Before <script>alert(1)</script> <img src=x onerror="alert(1)"> <iframe src="https://example.com"></iframe> after'
    )
    expect(html).not.toMatch(/<script|onerror|<iframe|<img/i)
    expect(html).toContain('Before')
    expect(html).toContain('after')
  })

  it('removes link targets that could run code, and keeps ordinary ones', () => {
    const html = renderMarkdown(
      '[bad](javascript:alert(1)) [data](data:text/html,<b>x</b>) [good](https://example.com) [adr](0002-other.md)'
    )
    expect(html).not.toMatch(/javascript:|data:text/i)
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('href="0002-other.md"')
  })
})
