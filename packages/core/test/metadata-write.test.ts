import { describe, expect, it } from 'vitest'
import { parseDocument } from 'yaml'
import {
  MetadataNotWritableError,
  addToList,
  removeFromList,
  removeKey,
  replaceInList,
  setScalar
} from '../src/metadata/write'
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

  it('fills a key that is there without a value, however the emptiness was written', () => {
    const text = '---\nstatus:\ncreated: ~   # unknown\ntags: null\n---\n'
    const status = write(text, (view) => setScalar(view, 'status', 'accepted'))
    expect(status.added).toEqual(['status: accepted\n'])
    const created = write(text, (view) => setScalar(view, 'created', '2026-03-02'))
    expect(created.added).toEqual(['created: 2026-03-02   # unknown\n'])
    const tags = write(text, (view) => addToList(view, 'tags', 'persistence'))
    expect(tags.added).toEqual(['tags: [persistence]\n'])
    expect(tags.removed).toEqual(['tags: null\n'])
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

describe('removeFromList', () => {
  const flow = (list: string) => `---\nstatus: accepted\ntags: ${list}\nnav_order: 3\n---\n# T\n`
  const tagsAfter = (list: string, item: string) =>
    lines(write(flow(list), (view) => removeFromList(view, 'tags', item)).after)[2]

  it('takes the first, a middle or the last item out of a flow list, with one comma', () => {
    expect(tagsAfter('[a, b, c]', 'a')).toBe('tags: [b, c]\n')
    expect(tagsAfter('[a, b, c]', 'b')).toBe('tags: [a, c]\n')
    expect(tagsAfter('[a, b, c]', 'c')).toBe('tags: [a, b]\n')
  })

  it('leaves the spacing and quoting of the items that stay', () => {
    expect(tagsAfter('[ a ,  "b: c" ,\'d\' ]', 'a')).toBe('tags: [ "b: c" ,\'d\' ]\n')
    expect(tagsAfter('[ a ,  "b: c" ,\'d\' ]', 'b: c')).toBe("tags: [ a ,  'd' ]\n")
    expect(tagsAfter('[ a ,  "b: c" ,\'d\' ]', 'd')).toBe('tags: [ a ,  "b: c" ]\n')
    expect(tagsAfter('[a, b,]', 'b')).toBe('tags: [a,]\n')
  })

  it('takes every occurrence of an item that is written more than once', () => {
    expect(tagsAfter('[a, a, b]', 'a')).toBe('tags: [b]\n')
    expect(tagsAfter('[b, a, a]', 'a')).toBe('tags: [b]\n')
    expect(tagsAfter('[a, b, a, c, a]', 'a')).toBe('tags: [b, c]\n')
  })

  it('takes an item out of a flow list that spans lines', () => {
    const text = '---\ntags: [\n  a,\n  b,\n  c\n]\n---\n'
    const after = (item: string) => write(text, (view) => removeFromList(view, 'tags', item)).after
    expect(after('a')).toBe('---\ntags: [\n  b,\n  c\n]\n---\n')
    expect(after('b')).toBe('---\ntags: [\n  a,\n  c\n]\n---\n')
    expect(after('c')).toBe('---\ntags: [\n  a,\n  b\n]\n---\n')
  })

  it('refuses a flow list with a comment next to the item, and takes out an item elsewhere', () => {
    const text = '---\ntags: [\n  a, # the first\n  b,\n  c\n]\n---\n'
    const remove = (item: string) => write(text, (view) => removeFromList(view, 'tags', item))
    expect(() => remove('a')).toThrow(MetadataNotWritableError)
    expect(() => remove('a')).toThrow('Remove "a" in an editor.')
    expect(remove('c').after).toBe('---\ntags: [\n  a, # the first\n  b\n]\n---\n')
  })

  it('removes one line of a block list: the item with its trailing comment', () => {
    const text = fixture('own/0002-hostile-formatting.md')
    const quoted = write(text, (view) => removeFromList(view, 'decision-makers', 'Alex Roth'))
    expect(quoted.added).toEqual([])
    expect(quoted.removed).toEqual(['  - "Alex Roth"   # block list, mixed quoting\n'])
    const plain = write(text, (view) => removeFromList(view, 'decision-makers', 'Kim Becker'))
    expect(plain.added).toEqual([])
    expect(plain.removed).toEqual(['  - Kim Becker\n'])
    expect(plain.metadata['decision-makers']).toEqual(['Alex Roth'])
  })

  it('leaves blank lines and comments between block items to the author', () => {
    const text = '---\ntags:\r\n- a-b\r\n\r\n# about c\r\n- c\r\n- d\r\n---\r\n'
    const result = write(text, (view) => removeFromList(view, 'tags', 'c'))
    expect(result.after).toBe('---\ntags:\r\n- a-b\r\n\r\n# about c\r\n- d\r\n---\r\n')
    const first = write(text, (view) => removeFromList(view, 'tags', 'a-b'))
    expect(first.after).toBe('---\ntags:\r\n\r\n# about c\r\n- c\r\n- d\r\n---\r\n')
  })

  it('removes the key with the last item, never leaving an empty list', () => {
    const crlf = fixture('own/0001-crlf-and-foreign-keys.md')
    const once = applyEdits(crlf, removeFromList(viewSource(crlf), 'tags', 'persistence'))
    const result = write(once, (view) => removeFromList(view, 'tags', 'write model'))
    expect(result.added).toEqual([])
    expect(result.removed).toEqual(['tags: ["write model"]\r\n'])

    const hostile = fixture('own/0002-hostile-formatting.md')
    const flowList = write(hostile, (view) =>
      removeFromList(view, 'supersedes', '0001-crlf-and-foreign-keys')
    )
    expect(flowList.removed).toEqual(['supersedes: [ 0001-crlf-and-foreign-keys ]\n'])
    expect(flowList.added).toEqual([])
  })

  it('removes the key of a single value that stands for a list of one', () => {
    const text = '---\nsupersedes: 0001-a\nstatus: proposed\n---\n'
    const result = write(text, (view) => removeFromList(view, 'supersedes', '0001-a'))
    expect(result.after).toBe('---\nstatus: proposed\n---\n')
    expect(removeFromList(viewSource(text), 'supersedes', '0002-b')).toEqual([])
  })

  it('does nothing when the item or the key is not there', () => {
    const text = fixture('own/0001-crlf-and-foreign-keys.md')
    expect(removeFromList(viewSource(text), 'tags', 'Persistence')).toEqual([])
    expect(removeFromList(viewSource(text), 'relates-to', '0002-hostile-formatting')).toEqual([])
    expect(removeFromList(viewSource(fixture('own/0003-no-frontmatter.md')), 'tags', 'a')).toEqual(
      []
    )
  })

  it('reads the number 2024 as the tag "2024"', () => {
    expect(tagsAfter('[2024, api]', '2024')).toBe('tags: [api]\n')
  })
})

describe('replaceInList', () => {
  it('puts the new item where the old one stood, in its quoting, and changes one line', () => {
    const hostile = fixture('own/0002-hostile-formatting.md')
    const flow = write(hostile, (view) =>
      replaceInList(view, 'supersedes', '0001-crlf-and-foreign-keys', '0009-crlf-and-foreign-keys')
    )
    expect(flow.removed).toEqual(['supersedes: [ 0001-crlf-and-foreign-keys ]\n'])
    expect(flow.added).toEqual(['supersedes: [ 0009-crlf-and-foreign-keys ]\n'])

    const block = write(hostile, (view) =>
      replaceInList(view, 'decision-makers', 'Alex Roth', 'Alex "Lex" Roth')
    )
    expect(block.removed).toEqual(['  - "Alex Roth"   # block list, mixed quoting\n'])
    expect(block.added).toEqual(['  - "Alex \\"Lex\\" Roth"   # block list, mixed quoting\n'])

    const crlf = fixture('own/0001-crlf-and-foreign-keys.md')
    const first = write(crlf, (view) => replaceInList(view, 'tags', 'persistence', 'storage'))
    expect(first.removed).toEqual(['tags: [persistence, "write model"]\r\n'])
    expect(first.added).toEqual(['tags: [storage, "write model"]\r\n'])
  })

  it('replaces a single value that stands for a list of one', () => {
    const text = "---\namends: '0001-a'   # the first\n---\n"
    const result = write(text, (view) => replaceInList(view, 'amends', '0001-a', '0002-a'))
    expect(result.after).toBe("---\namends: '0002-a'   # the first\n---\n")
  })

  it('just takes the old item out when the new one is in the list already', () => {
    const text = '---\nrelates-to: [0001-a, 0002-b, 0003-c]\n---\n'
    const result = write(text, (view) => replaceInList(view, 'relates-to', '0002-b', '0003-c'))
    expect(result.after).toBe('---\nrelates-to: [0001-a, 0003-c]\n---\n')
  })

  it('does nothing when the item or the key is not there', () => {
    const text = fixture('own/0001-crlf-and-foreign-keys.md')
    expect(replaceInList(viewSource(text), 'tags', 'Persistence', 'x')).toEqual([])
    expect(replaceInList(viewSource(text), 'amends', '0001-a', '0002-a')).toEqual([])
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
      // Whatever the Status is: an ADR of ours may be proposed for a while.
      expect(result.removed, name).toEqual([expect.stringMatching(/^status: [a-z]+\n$/)])
      expect(result.added, name).toEqual(['status: deprecated\n'])
    }
  })
})
