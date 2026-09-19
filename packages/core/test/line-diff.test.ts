import { describe, expect, it } from 'vitest'
import { applyEdits } from '../src/text/edit'
import { editsForLines } from '../src/text/line-diff'

/** Replace everything from `offset` on, and report the result together with the edits it took. */
function replace(text: string, offset: number, replacement: string, eol: '\n' | '\r\n' = '\n') {
  const edits = editsForLines(text, offset, replacement, eol)
  return { edits, result: applyEdits(text, edits) }
}

describe('editsForLines', () => {
  it('needs no edit when nothing changed, whatever the line breaks are', () => {
    const text = '---\r\nstatus: accepted\r\n---\r\n# Title\r\n\r\nText.\r\n'
    const bodyStart = text.indexOf('# Title')
    expect(replace(text, bodyStart, '# Title\n\nText.\n', '\r\n').edits).toEqual([])
  })

  it('touches only the line that changed', () => {
    const text = 'head\n# Title\n\nOne.\nTwo.\nThree.\n'
    const { edits, result } = replace(text, 5, '# Title\n\nOne.\nTwo, corrected.\nThree.\n')
    expect(edits).toEqual([{ start: 19, end: 24, insert: 'Two, corrected.\n' }])
    expect(result).toBe('head\n# Title\n\nOne.\nTwo, corrected.\nThree.\n')
  })

  it('keeps the line breaks of untouched lines in a file that mixes them', () => {
    const text = 'a\r\nb\nc\r\n'
    const { result } = replace(text, 0, 'a\nB\nc\nd\n', '\r\n')
    // `a` and `c` keep their CRLF, the changed and the new line get the file's line ending.
    expect(result).toBe('a\r\nB\r\nc\r\nd\r\n')
  })

  it('makes separate edits for separate places', () => {
    const text = '1\n2\n3\n4\n5\n6\n'
    const { edits, result } = replace(text, 0, '1\ntwo\n3\n4\nfive\n6\n')
    expect(edits).toHaveLength(2)
    expect(result).toBe('1\ntwo\n3\n4\nfive\n6\n')
  })

  it('inserts and removes lines at the start, in the middle and at the end', () => {
    expect(replace('b\nc\n', 0, 'a\nb\nc\n').result).toBe('a\nb\nc\n')
    expect(replace('a\nc\n', 0, 'a\nb\nc\n').result).toBe('a\nb\nc\n')
    expect(replace('a\nb\n', 0, 'a\nb\nc\n').result).toBe('a\nb\nc\n')
    expect(replace('a\nb\nc\n', 0, 'b\nc\n').result).toBe('b\nc\n')
    expect(replace('a\nb\nc\n', 0, 'a\nc\n').result).toBe('a\nc\n')
    expect(replace('a\nb\nc\n', 0, 'a\nb\n').result).toBe('a\nb\n')
  })

  it('handles a last line without a line break, and an empty text on either side', () => {
    expect(replace('a', 0, 'a\nb').result).toBe('a\nb')
    expect(replace('a\nb', 0, 'a\n').result).toBe('a\n')
    expect(replace('front\n', 6, 'new body\n').result).toBe('front\nnew body\n')
    expect(replace('front\nbody\n', 6, '').result).toBe('front\n')
  })

  it('leaves everything before the offset alone', () => {
    const text = 'same\nsame\n'
    const { edits, result } = replace(text, 5, 'changed\n')
    expect(edits).toEqual([{ start: 5, end: 10, insert: 'changed\n' }])
    expect(result).toBe('same\nchanged\n')
  })
})
