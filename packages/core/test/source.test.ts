import { describe, expect, it } from 'vitest'
import { applyEdits } from '../src/text/edit'
import { viewSource } from '../src/text/source'
import { fixture, fixtureNames } from './fixtures'

describe('viewSource', () => {
  it('finds frontmatter and body, and reads CRLF from the first line break', () => {
    const text = fixture('own/0001-crlf-and-foreign-keys.md')
    const view = viewSource(text)
    expect(view.eol).toBe('\r\n')
    expect(text.slice(view.frontmatter!.start, view.frontmatter!.end)).toMatch(
      /^status: proposed\r\n[\s\S]*"write model"\]\r\n$/
    )
    expect(text.slice(view.bodyStart)).toMatch(/^\r\n# Postgres for the write model\r\n/)
  })

  it('treats a file without frontmatter as all body', () => {
    const view = viewSource(fixture('own/0003-no-frontmatter.md'))
    expect(view.frontmatter).toBeUndefined()
    expect(view.bodyStart).toBe(0)
    expect(view.eol).toBe('\n')
  })

  it('looks for frontmatter behind a byte order mark', () => {
    const view = viewSource(fixture('own/0004-bom.md'))
    expect(view.hasBom).toBe(true)
    expect(view.text.slice(view.frontmatter!.start, view.frontmatter!.end)).toBe(
      'status: accepted\n'
    )
  })

  it('accepts a file that ends with its closing fence', () => {
    const text = fixture('own/0005-frontmatter-only.md')
    const view = viewSource(text)
    expect(view.frontmatter).toBeDefined()
    expect(view.bodyStart).toBe(text.length)
  })

  it('reports frontmatter that is never closed instead of guessing where it ends', () => {
    const view = viewSource(fixture('own/0006-unterminated.md'))
    expect(view.unterminatedFrontmatter).toBe(true)
    expect(view.frontmatter).toBeUndefined()
  })
})

describe('applyEdits', () => {
  it('returns identical bytes when there is nothing to change (ADR-0002)', () => {
    for (const name of fixtureNames('own')) {
      const text = fixture(`own/${name}`)
      expect(applyEdits(text, []), name).toBe(text)
    }
  })

  it('applies several edits against the original offsets', () => {
    const edits = [
      { start: 6, end: 11, insert: 'there' },
      { start: 0, end: 5, insert: 'Hi' }
    ]
    expect(applyEdits('Hello world!', edits)).toBe('Hi there!')
  })

  it('refuses overlapping edits', () => {
    const edits = [
      { start: 0, end: 5, insert: '' },
      { start: 3, end: 8, insert: '' }
    ]
    expect(() => applyEdits('Hello world!', edits)).toThrow(RangeError)
  })
})
