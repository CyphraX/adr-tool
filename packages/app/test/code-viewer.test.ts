import { Text } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { languageFor, markLines } from '../src/renderer/src/lib/code-viewer'

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
})
