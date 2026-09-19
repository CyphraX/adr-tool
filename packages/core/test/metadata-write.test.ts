import { describe, expect, it } from 'vitest'
import { parseDocument } from 'yaml'
import { MetadataNotWritableError, addToList, removeKey, setScalar } from '../src/metadata/write'
import { applyEdits, type TextEdit } from '../src/text/edit'
import { viewSource, type SourceView } from '../src/text/source'
import { fixture, lines, ownAdrs } from './fixtures'

interface WriteResult {
  after: string
  removed: string[]
  added: string[]
  metadata: Record<string, unknown>
}

/** Apply a write and report which lines left the file and which are new. */
function write(text: string, edit: (view: SourceView) => TextEdit[]): WriteResult {
  const after = applyEdits(text, edit(viewSource(text)))
  const [old, now] = [lines(text), lines(after)]
  const removed = old.filter((line) => !now.includes(line))
  const added = now.filter((line) => !old.includes(line))
  return { after, removed, added, metadata: metadataOf(after) }
}

function metadataOf(text: string): Record<string, unknown> {
  const view = viewSource(text)
  if (!view.frontmatter) return {}
  return parseDocument(text.slice(view.frontmatter.start, view.frontmatter.end)).toJS() ?? {}
}

describe('setScalar', () => {
  it('changes one line of a CRLF file and keeps its line ending', () => {
    const text = fixture('own/0001-crlf-and-foreign-keys.md')
    const result = write(text, (view) => setScalar(view, 'status', 'accepted'))
    expect(result.removed).toEqual(['status: proposed\r\n'])
    expect(result.added).toEqual(['status: accepted\r\n'])
  })

  it('inserts a new key behind the tool key that precedes it, with the file line ending', () => {
    const text = fixture('own/0001-crlf-and-foreign-keys.md')
    const result = write(text, (view) => setScalar(view, 'decided', '2026-03-09'))
    expect(result.removed).toEqual([])
    expect(result.added).toEqual(['decided: 2026-03-09\r\n'])
    expect(lines(result.after).slice(1, 5)).toEqual([
      'status: proposed\r\n',
      'created: 2026-03-02\r\n',
      'decided: 2026-03-09\r\n',
      '# team-owned key, keep me\r\n'
    ])
    expect(result.metadata['decided']).toBe('2026-03-09')
  })

  it('keeps quoting, odd spacing and the trailing comment of the value it replaces', () => {
    const text = fixture('own/0002-hostile-formatting.md')
    const double = write(text, (view) => setScalar(view, 'status', 'superseded'))
    expect(double.removed).toEqual([
      'status:   "accepted"   # odd spacing, quoted, trailing comment\n'
    ])
    expect(double.added).toEqual([
      'status:   "superseded"   # odd spacing, quoted, trailing comment\n'
    ])
    const single = write(text, (view) => setScalar(view, 'created', '2026-04-01'))
    expect(single.added).toEqual(["created: '2026-04-01'\n"])
  })

  it('creates the frontmatter when a file has none, and leaves the body alone', () => {
    const text = fixture('own/0003-no-frontmatter.md')
    const result = write(text, (view) => setScalar(view, 'status', 'deprecated'))
    expect(result.after).toBe(`---\nstatus: deprecated\n---\n${text}`)
  })

  it('keeps the byte order mark in front of frontmatter it writes into', () => {
    const text = fixture('own/0004-bom.md')
    const result = write(text, (view) => setScalar(view, 'status', 'rejected'))
    expect(result.after.startsWith('\uFEFF---\nstatus: rejected\n---\n')).toBe(true)
  })

  it('quotes a value that would not read back as the same string', () => {
    const text = '---\nstatus: accepted\n---\n'
    const colon = write(text, (view) => setScalar(view, 'created', 'a: b'))
    expect(colon.metadata['created']).toBe('a: b')
    const digits = write(text, (view) => setScalar(view, 'created', '123'))
    expect(digits.metadata['created']).toBe('123')
  })
})

describe('addToList', () => {
  it('appends to a flow list in place, keeping its inner spacing', () => {
    const text = fixture('own/0002-hostile-formatting.md')
    const result = write(text, (view) => addToList(view, 'supersedes', '0003-no-frontmatter'))
    expect(result.removed).toEqual(['supersedes: [ 0001-crlf-and-foreign-keys ]\n'])
    expect(result.added).toEqual([
      'supersedes: [ 0001-crlf-and-foreign-keys, 0003-no-frontmatter ]\n'
    ])
  })

  it('appends to a block list with the indentation of its items, after a trailing comment', () => {
    const text = fixture('own/0002-hostile-formatting.md')
    const result = write(text, (view) => addToList(view, 'decision-makers', 'Sam: Lee'))
    expect(result.removed).toEqual([])
    expect(result.added).toEqual(['  - "Sam: Lee"\n'])
    expect(result.metadata['decision-makers']).toEqual(['Kim Becker', 'Alex Roth', 'Sam: Lee'])
    expect(result.metadata['parent']).toBe('Decisions')
  })

  it('writes a new list in flow style at its canonical position', () => {
    const text = fixture('own/0001-crlf-and-foreign-keys.md')
    const result = write(text, (view) => addToList(view, 'amends', '0002-hostile-formatting'))
    expect(result.added).toEqual(['amends: [0002-hostile-formatting]\r\n'])
    // `tags` is the last tool key before `amends`; the foreign key above it does not move.
    const after = lines(result.after)
    expect(after[after.indexOf('amends: [0002-hostile-formatting]\r\n') - 1]).toBe(
      'tags: [persistence, "write model"]\r\n'
    )
  })

  it('does nothing when the item is already there', () => {
    const text = fixture('own/0001-crlf-and-foreign-keys.md')
    expect(addToList(viewSource(text), 'tags', 'write model')).toEqual([])
  })

  it('turns a single value into a list when a second one arrives', () => {
    const text = '---\nsupersedes: 0001-a\n---\n'
    const result = write(text, (view) => addToList(view, 'supersedes', '0002-b'))
    expect(result.after).toBe('---\nsupersedes: [0001-a, 0002-b]\n---\n')
  })
})

describe('removeKey', () => {
  it('removes a block list with all its lines and nothing else', () => {
    const text = fixture('own/0002-hostile-formatting.md')
    const result = write(text, (view) => removeKey(view, 'decision-makers'))
    expect(result.added).toEqual([])
    expect(result.removed).toEqual([
      'decision-makers:\n',
      '  - Kim Becker\n',
      '  - "Alex Roth"   # block list, mixed quoting\n'
    ])
  })

  it('leaves the comment above a key to the author', () => {
    const text = fixture('own/0002-hostile-formatting.md')
    const result = write(text, (view) => removeKey(view, 'status'))
    expect(result.after.startsWith('---\n# leading comment\n\ncreated:')).toBe(true)
  })
})

describe('Metadata the tool must not write into', () => {
  it('refuses frontmatter that is never closed', () => {
    const view = viewSource(fixture('own/0006-unterminated.md'))
    expect(() => setScalar(view, 'status', 'accepted')).toThrow(MetadataNotWritableError)
  })

  it('refuses invalid YAML and duplicate keys', () => {
    for (const text of ['---\nstatus: [unclosed\n---\n', '---\nstatus: a\nstatus: b\n---\n']) {
      expect(() => setScalar(viewSource(text), 'status', 'accepted')).toThrow(
        MetadataNotWritableError
      )
    }
  })
})

describe("this repository's own ADRs", () => {
  it('change by exactly one line when their Status is set', () => {
    const adrs = ownAdrs()
    expect(adrs.length).toBeGreaterThanOrEqual(3)
    for (const { name, text } of adrs) {
      const result = write(text, (view) => setScalar(view, 'status', 'deprecated'))
      expect(result.removed, name).toEqual(['status: accepted\n'])
      expect(result.added, name).toEqual(['status: deprecated\n'])
    }
  })
})
