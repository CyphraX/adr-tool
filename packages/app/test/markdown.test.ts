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

// docs/plan-roadmap.md, part 2: an image next to the ADR is shown, and nothing else is read.
describe('the images of an ADR', () => {
  const base = { repositoryId: 'repo-1', directory: 'docs/adr' }

  it('come from the repository, relative to the ADR, through the protocol of the main process', () => {
    const html = renderMarkdown(
      '![A](img/diagram.png) ![B](./my%20chart.svg) ![C](../shared/c.png) ![D](/assets/d.png)',
      base
    )
    expect(html).toContain('src="adr-asset://repo-1/docs/adr/img/diagram.png"')
    expect(html).toContain('src="adr-asset://repo-1/docs/adr/my%20chart.svg"')
    expect(html).toContain('src="adr-asset://repo-1/docs/shared/c.png"')
    // A leading slash means the root of the repository, as on GitHub.
    expect(html).toContain('src="adr-asset://repo-1/assets/d.png"')
  })

  it('lose a source that leads out of the repository', () => {
    const html = renderMarkdown('![X](../../../etc/passwd.png)', base)
    expect(html).not.toContain('passwd')
    expect(renderMarkdown('![Z](z.png)', { repositoryId: 'repo-1', directory: '' })).toContain(
      'src="adr-asset://repo-1/z.png"'
    )
  })

  // A page loaded from a file reads `//host/x.png` as a network share: on Windows, merely
  // viewing such an ADR would hand the user's login to that host.
  it('lose a source with a scheme, a host or a backslash: nothing is requested from elsewhere', () => {
    const html = renderMarkdown(
      [
        '![A](https://example.com/a.png)',
        '![B](//evil.example/share/b.png)',
        '![C](\\\\evil.example\\share\\c.png)',
        '![D](img\\..\\..\\d.png)',
        '![E](img/%5c..%5cE.png)',
        '![F](file:///etc/f.png)'
      ].join(' '),
      base
    )
    expect(html.match(/<img[^>]*>/g)).toHaveLength(6)
    expect(html).not.toContain('src=')
  })

  it('have no source where there is no repository to read them from', () => {
    expect(renderMarkdown('![A](img/diagram.png) ![B](//evil.example/b.png)')).not.toContain('src=')
  })
})
