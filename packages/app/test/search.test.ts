import { describe, expect, it } from 'vitest'
import { memoryFileSystem, openRepository, type Adr } from '@adr-tool/core'
import { search } from '../src/renderer/src/lib/search'

const adr = (frontmatter: string[], title: string, ...body: string[]): string =>
  ['---', ...frontmatter, '---', '', `# ${title}`, '', ...body, ''].join('\n')

async function adrs(): Promise<readonly Adr[]> {
  const repository = await openRepository(
    memoryFileSystem({
      'docs/adr/0001-modular-monolith.md': adr(
        ['status: accepted', 'tags: [structure]', 'decision-makers: [Kim Becker]'],
        'Start as a modular monolith',
        'One deployable. Modules talk through interfaces, never through the database.'
      ),
      'docs/adr/0002-sqlite-for-everything.md': adr(
        ['status: superseded', 'tags: [persistence]'],
        'SQLite for everything',
        'One file, no server, trivial backups.'
      ),
      'docs/adr/0004-postgres-for-the-write-model.md': adr(
        ['status: accepted', 'tags: [persistence]', 'decision-makers: [Kim Becker, Alex Roth]'],
        'Postgres for the write model',
        'The second customer brings concurrent writers, and SQLite serializes them.',
        '',
        'Backups move from copying a file to point-in-time recovery of the database.'
      ),
      'docs/adr/0012-backups.md': adr(
        ['status: proposed'],
        'Where backups go',
        'Off-site, encrypted, tested every quarter.'
      )
    })
  )
  return repository.logs[0]!.adrs
}

const ids = (hits: readonly { adr: Adr }[]): string[] => hits.map((hit) => hit.adr.id.slice(0, 4))

describe('full-text search', () => {
  it('finds nothing for nothing', async () => {
    expect(search(await adrs(), '   ')).toEqual([])
    expect(search(await adrs(), 'kubernetes')).toEqual([])
  })

  it('puts a match in the title before a match in the text', async () => {
    expect(ids(search(await adrs(), 'sqlite'))).toEqual(['0002', '0004'])
    expect(ids(search(await adrs(), 'backups'))).toEqual(['0012', '0002', '0004'])
  })

  it('ignores case, and wants every word to be somewhere in the ADR', async () => {
    expect(ids(search(await adrs(), 'POSTGRES writers'))).toEqual(['0004'])
    expect(ids(search(await adrs(), 'postgres quarter'))).toEqual([])
  })

  it('finds an ADR by its number, as people say it', async () => {
    expect(ids(search(await adrs(), '4'))[0]).toBe('0004')
    expect(ids(search(await adrs(), '0012'))).toEqual(['0012'])
    expect(ids(search(await adrs(), 'adr-12'))).toEqual(['0012'])
  })

  it('finds by tag, decision-maker and Status', async () => {
    expect(ids(search(await adrs(), 'persistence'))).toEqual(['0002', '0004'])
    expect(ids(search(await adrs(), 'alex'))).toEqual(['0004'])
    expect(ids(search(await adrs(), 'proposed'))).toEqual(['0012'])
  })

  it('shows where in the text it matched, with the match marked', async () => {
    const [, inText] = search(await adrs(), 'sqlite')
    expect(inText!.excerpt.map((part) => part.text).join('')).toContain(
      'and SQLite serializes them'
    )
    expect(inText!.excerpt.filter((part) => part.match).map((part) => part.text)).toEqual([
      'SQLite'
    ])
    // A match in the title needs no excerpt; one further down the text gets its own surroundings.
    const [inTitle] = search(await adrs(), 'sqlite')
    expect(inTitle!.excerpt).toEqual([])
    const recovery = search(await adrs(), 'recovery')[0]!
    expect(recovery.excerpt.map((part) => part.text).join('')).toMatch(
      /^… .*point-in-time recovery/
    )
  })

  it('does not search the frontmatter as text', async () => {
    expect(search(await adrs(), 'decision-makers')).toEqual([])
  })
})
