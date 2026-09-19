import { describe, expect, it } from 'vitest'
import type { FileChange } from '@adr-tool/core'
import { codeSpans, summarizeChange } from '../src/renderer/src/lib/wording'

const changed = (path: string): FileChange => ({ path, before: 'a\n', after: 'b\n' })
const created: FileChange = { path: 'new.md', before: '', after: 'text\n', creates: true }
const renamed: FileChange = { path: 'old.md', before: 'a\n', after: 'a\n', renameTo: 'new.md' }

describe('what a change does, in one sentence', () => {
  it('counts the files it changes', () => {
    expect(summarizeChange([changed('a.md')])).toBe(
      'This changes one file. Nothing else in it is touched.'
    )
    expect(summarizeChange([changed('a.md'), changed('b.md'), changed('c.md')])).toBe(
      'This changes 3 files. Nothing else in them is touched.'
    )
  })

  it('names a new file and a renamed file for what they are', () => {
    expect(summarizeChange([created])).toBe('This creates one file.')
    expect(summarizeChange([renamed])).toBe('This renames one file.')
    expect(summarizeChange([renamed, changed('a.md'), changed('b.md')])).toBe(
      'This renames one file and changes 2 files. Nothing else in them is touched.'
    )
    expect(summarizeChange([renamed, created, changed('a.md')])).toBe(
      'This renames one file, creates one file and changes one file. Nothing else in it is touched.'
    )
  })

  it('has something to say about a change without files', () => {
    expect(summarizeChange([])).toBe('This changes nothing.')
  })
})

describe('a text that names files, for the markup to set in code', () => {
  it('splits at the backticks and says which parts are code', () => {
    expect(codeSpans('Look for `.adr-dir`, then for `docs/adr`.')).toEqual([
      { text: 'Look for ', code: false },
      { text: '.adr-dir', code: true },
      { text: ', then for ', code: false },
      { text: 'docs/adr', code: true },
      { text: '.', code: false }
    ])
  })

  it('leaves a text without backticks as it is, and has no empty parts', () => {
    expect(codeSpans('Nothing here.')).toEqual([{ text: 'Nothing here.', code: false }])
    expect(codeSpans('`docs/adr` first')).toEqual([
      { text: 'docs/adr', code: true },
      { text: ' first', code: false }
    ])
  })
})
