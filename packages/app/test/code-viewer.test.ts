import { EditorState, Text } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import {
  languageFor,
  markLines,
  quotedLines,
  viewedText
} from '../src/renderer/src/lib/code-viewer'

describe('the code viewer', () => {
  it('highlights each language of the Structure format by its extension', () => {
    const name = (path: string) => languageFor(path)?.language.name
    expect(['a.ts', 'a.mts', 'a.cts', 'a.d.ts'].map(name)).toEqual([
      'typescript',
      'typescript',
      'typescript',
      'typescript'
    ])
    expect(['a.js', 'a.mjs', 'a.cjs'].map(name)).toEqual(['javascript', 'javascript', 'javascript'])
    // JSX is a dialect of either: only `.tsx` and `.jsx` read an element as one.
    const reads = (path: string) =>
      languageFor(path)!.language.parser.parse('const a = <b/>').toString().includes('JSX')
    expect(['a.tsx', 'a.jsx', 'a.ts', 'a.js'].map(reads)).toEqual([true, true, false, false])
    // A Svelte component is HTML whose script blocks are TypeScript where they say so.
    expect(name('Row.svelte')).toBe('html')
    expect(name('Cart.java')).toBe('java')
    expect(name('cart.py')).toBe('python')
    expect(name('cart.go')).toBe('go')
    expect(name('README.md')).toBeUndefined()
  })

  it('marks the lines a Dependency points at, and none the file no longer has', () => {
    const doc = Text.of(['import a', 'import b', '', 'use(a, b)'])
    const starts: number[] = []
    markLines(doc, [4, 2, 2, 9, 0]).between(0, doc.length, (from) => {
      starts.push(from)
    })
    expect(starts).toEqual([doc.line(2).from, doc.line(4).from])
  })

  // A carriage return that ends no line shifted every line after it: the viewer counted it as a
  // line break, the Anchor does not, and line 3 selected here was line 4 there.
  it('counts lines as an Anchor counts them: LF and CRLF end a line, a lone CR does not', () => {
    const lines = (text: string): string[] =>
      EditorState.create({ doc: viewedText(text) }).doc.toJSON()
    expect(lines('a\rb\nc\nd\n')).toEqual(['a\u240db', 'c', 'd', ''])
    expect(lines('a\r\nb\r\nc')).toEqual(['a', 'b', 'c'])
    expect(quotedLines('a\rb\nc\nd\n', 3, 3)).toEqual(['d'])
    expect(quotedLines('a\r\nb\r\nc\r\n', 2, 3)).toEqual(['b', 'c'])
  })
})
