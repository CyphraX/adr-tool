import { describe, expect, it } from 'vitest'
import { applyEdits, memoryFileSystem, plan, Refusal, type TextEdit } from '../src'

const text = (value: string): string => value
const append =
  (added: string) =>
  (current: string): TextEdit[] => [{ start: current.length, end: current.length, insert: added }]

describe('applyEdits', () => {
  it('leaves what no edit covers byte for byte as it was', () => {
    const before = 'one\r\ntwo\r\nthree\r\n'
    expect(applyEdits(before, [{ start: 5, end: 8, insert: 'TWO' }])).toBe(
      'one\r\nTWO\r\nthree\r\n'
    )
  })

  it('takes offsets against the original text, in any order', () => {
    expect(
      applyEdits('abcdef', [
        { start: 4, end: 5, insert: 'E' },
        { start: 0, end: 1, insert: 'A' }
      ])
    ).toBe('AbcdEf')
  })

  it('refuses edits that overlap', () => {
    const overlapping = [
      { start: 0, end: 3, insert: '' },
      { start: 2, end: 4, insert: '' }
    ]
    expect(() => applyEdits('abcdef', overlapping)).toThrow(RangeError)
  })
})

describe('plan', () => {
  it('collects the writes of an operation into one change set, several writes to a file building on each other', async () => {
    const fs = memoryFileSystem({ 'a.txt': 'a', 'b.txt': 'b' })
    const planned = await plan(fs, text, async (pending) => {
      await pending.write('a.txt', append('1'))
      await pending.write('a.txt', append('2'))
      await pending.create('c.txt', 'c')
      expect(await pending.read('a.txt')).toBe('a12')
      expect(await pending.read('b.txt')).toBe('b')
    })
    expect(planned).toEqual({
      ok: true,
      changeSet: {
        files: [
          { path: 'a.txt', before: 'a', after: 'a12' },
          { path: 'c.txt', before: '', after: 'c', creates: true }
        ]
      }
    })
    // Planning writes nothing.
    expect(await fs.readText('a.txt')).toBe('a')
  })

  it('hands every writer the view of the text that its module works on', async () => {
    const fs = memoryFileSystem({ 'a.txt': 'one\ntwo\n' })
    const lines = (value: string): string[] => value.split('\n')
    const planned = await plan(fs, lines, async (pending) => {
      await pending.write('a.txt', (view) => [{ start: 0, end: view[0]!.length, insert: 'ONE' }])
    })
    expect(planned.ok && planned.changeSet.files[0]!.after).toBe('ONE\ntwo\n')
  })

  it('turns a Refusal into the reason with its code, and lets every other error through', async () => {
    const fs = memoryFileSystem({ 'a.txt': 'a' })
    expect(await plan(fs, text, (pending) => pending.create('a.txt', 'again'))).toEqual({
      ok: false,
      reason: 'a.txt already exists.',
      said: { code: 'already-exists', values: { path: 'a.txt' } }
    })
    expect(await plan(fs, text, (pending) => pending.write('gone.txt', append('x')))).toEqual({
      ok: false,
      reason: 'gone.txt no longer exists.',
      said: { code: 'no-longer-exists', values: { path: 'gone.txt' } }
    })
    class OfAModule extends Refusal {}
    expect(
      await plan(fs, text, async () => {
        throw new OfAModule('said by a module')
      })
    ).toEqual({ ok: false, reason: 'said by a module' })
    const said = { code: 'of-a-module', values: { what: 'it' } }
    expect(
      await plan(fs, text, async () => {
        throw new OfAModule('said by a module, of it', said)
      })
    ).toEqual({ ok: false, reason: 'said by a module, of it', said })
    await expect(
      plan(fs, text, async () => {
        throw new TypeError('a bug')
      })
    ).rejects.toThrow(TypeError)
  })

  it('refuses a move onto a file that is there or that another move takes', async () => {
    const fs = memoryFileSystem({ 'a.txt': 'a', 'b.txt': 'b', 'c.txt': 'c' })
    expect(await plan(fs, text, (pending) => pending.rename('a.txt', 'b.txt'))).toMatchObject({
      ok: false,
      reason: 'b.txt already exists.'
    })
    const twice = await plan(fs, text, async (pending) => {
      await pending.rename('a.txt', 'd.txt')
      await pending.rename('b.txt', 'd.txt')
    })
    expect(twice).toMatchObject({ ok: false, reason: 'd.txt already exists.' })
  })

  it('refuses to create a file where another one is moved to', async () => {
    const fs = memoryFileSystem({ 'a.txt': 'a' })
    const result = await plan(fs, text, async (pending) => {
      await pending.rename('a.txt', 'b.txt')
      await pending.create('b.txt', 'new')
    })
    expect(result).toMatchObject({ ok: false, reason: 'b.txt already exists.' })
  })

  it('keeps a file it creates in the change set, an empty one too', async () => {
    const result = await plan(memoryFileSystem({}), text, (pending) => pending.create('e.txt', ''))
    expect(result).toEqual({
      ok: true,
      changeSet: { files: [{ path: 'e.txt', before: '', after: '', creates: true }] }
    })
  })
})
