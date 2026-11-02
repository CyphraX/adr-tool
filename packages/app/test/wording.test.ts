import { describe, expect, it } from 'vitest'
import { memoryFileSystem, openRepository, type FileChange } from '@adr-tool/core'
import {
  codeSpans,
  describeCorrection,
  describeForeign,
  logName,
  summarizeChange
} from '../src/renderer/src/lib/wording'

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

describe('what a Correction records, in one line', () => {
  it('names the day, and who corrected what when the file says so', () => {
    expect(describeCorrection({ date: '2026-09-20' })).toBe('2026-09-20')
    expect(describeCorrection({ date: '2026-09-20', author: 'Kim Becker' })).toBe(
      '2026-09-20 by Kim Becker'
    )
    expect(describeCorrection({ date: '2026-09-20', note: 'Spelling' })).toBe(
      '2026-09-20: Spelling'
    )
    expect(describeCorrection({ date: '2026-09-20', author: 'Kim Becker', note: 'Spelling' })).toBe(
      '2026-09-20 by Kim Becker: Spelling'
    )
  })
})

describe('what a Decision Log is called', () => {
  it('is its path, and the one at the top of the repository has a name of its own', () => {
    expect(logName('docs/adr')).toBe('docs/adr')
    expect(logName('')).toBe('(repository root)')
  })
})

describe('the header of an ADR in a foreign format', () => {
  it('names what made the tool read it so', async () => {
    const { logs } = await openRepository(
      memoryFileSystem({
        'docs/adr/0001-a.md': '---\nstatus: superseded by ADR-0002\ndeciders: [A]\n---\n\n# A\n',
        'docs/adr/0002-b.md': '# B\n\n- Status: draft\n- Tags: api\n',
        'docs/adr/0003-c.md': '# 3. C\n\n## Status\n\nAccepted\n'
      })
    )
    expect(logs[0]!.adrs.map(describeForeign)).toEqual([
      'Read as a file of MADR: a Status that names a successor and "deciders" for the decision-makers. That is read as MADR means it. The tool never writes this format. Migration rewrites the file into the tool\'s own, and shows the change first.',
      "Read as a file of MADR 2 or log4brains: its Status in the list under the title. What its list under the title says — Status, Deciders, log4brains' Tags — is taken from there, unless the frontmatter says it already, and its Relations from the links of its Links section. The tool never writes this format. Migration rewrites the file into the tool's own, and shows the change first.",
      "Read as a file of adr-tools: no frontmatter, and a Status section in its text. Its Status, its Relations and Back-references and the day it was created are taken from there. The tool never writes this format. Migration rewrites the file into the tool's own, and shows the change first."
    ])
  })
})
