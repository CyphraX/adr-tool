import { describe, expect, it } from 'vitest'
import { memoryFileSystem, openRepository, type Adr } from '@adr-tool/core'
import { fold, foldWithPlaces, search, searchLogs } from '../src/renderer/src/lib/search'

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
        [
          'status: proposed',
          'created: 2025-11-03',
          'corrections:',
          '  - date: 2025-11-20',
          '    author: Jo Meier',
          '    note: Dead link to the runbook'
        ],
        'Where backups go',
        'Off-site, encrypted, tested every quarter. İstanbul is where the second copy lives, für alle Fälle.',
        '',
        'See https://backups.example.com/runbooks/restore/how-to-restore-the-database-from-the-off-site-copy-step-by-step for the drill.'
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
    for (const spoken of ['adr-12', 'ADR 12', 'adr12', '#12']) {
      expect(ids(search(await adrs(), spoken))).toEqual(['0012'])
    }
    expect(ids(search(await adrs(), 'adr 4 postgres'))).toEqual(['0004'])
  })

  it('finds by tag, decision-maker and Status', async () => {
    expect(ids(search(await adrs(), 'persistence'))).toEqual(['0002', '0004'])
    expect(ids(search(await adrs(), 'alex'))).toEqual(['0004'])
    expect(ids(search(await adrs(), 'proposed'))).toEqual(['0012'])
    expect(ids(search(await adrs(), 'supersed'))).toEqual(['0002'])
  })

  it('finds by a date from its start, and by what a Correction says', async () => {
    expect(ids(search(await adrs(), '2025-11'))).toEqual(['0012'])
    expect(ids(search(await adrs(), '11-20'))).toEqual([])
    expect(ids(search(await adrs(), 'runbook meier'))).toEqual(['0012'])
  })

  it('does not care about accents, in the query or in the text', async () => {
    expect(ids(search(await adrs(), 'fur alle falle'))).toEqual(['0012'])
    expect(ids(search(await adrs(), 'FÜR'))).toEqual(['0012'])
    expect(ids(search(await adrs(), 'istanbul'))).toEqual(['0012'])
    expect(fold('Für İstanbul, Straße')).toBe('fur istanbul, strasse')
  })

  it('reads "ß" as "ss", either way round, and marks the match in the text as written', async () => {
    const repository = await openRepository(
      memoryFileSystem({
        'docs/adr/0001-strasse.md': adr(
          ['status: accepted'],
          'Die Straße zum Release',
          'Die Maße stimmen, über die Hauptstraße geht es zum Kunden.'
        ),
        'docs/adr/0002-routing.md': adr(
          ['status: proposed'],
          'Routing',
          'In der Schweiz schreibt man die Strasse ohne Eszett.'
        ),
        'docs/adr/0003-gross.md': adr(['status: proposed'], 'GROSSE DATEIEN', 'Kein Text.')
      })
    )
    const [log] = repository.logs
    const found = (query: string): string[] => ids(search(log!.adrs, query))
    for (const query of ['strasse', 'STRASSE', 'Straße', 'STRAẞE']) {
      expect(found(query), query).toEqual(['0001', '0002'])
    }
    expect(found('große')).toEqual(['0003'])

    const marked = (query: string): string[] =>
      search(log!.adrs, query)[0]!
        .excerpt.filter((part) => part.match)
        .map((part) => part.text)
    // Folded, the text is one character longer than written for every "ß" before the match.
    expect(marked('stimmen')).toEqual(['stimmen'])
    expect(marked('kunden')).toEqual(['Kunden'])
    expect(marked('hauptstrasse')).toEqual(['Hauptstraße'])
    // Half of a "ß" is all of it.
    expect(marked('hauptstras')).toEqual(['Hauptstraß'])
    expect(marked('eszett')).toEqual(['Eszett'])
    // The excerpt is the line as written, from a word some way before the match.
    expect(
      search(log!.adrs, 'kunden')[0]!
        .excerpt.map((part) => part.text)
        .join('')
    ).toBe('… über die Hauptstraße geht es zum Kunden.')
  })

  it('knows where every folded character came from', () => {
    expect(foldWithPlaces('aßb')).toEqual({ text: 'assb', from: [0, 1, 1, 2], to: [1, 2, 2, 3] })
    // Text written decomposed: the mark folds to nothing and belongs to its letter.
    expect(foldWithPlaces('für')).toEqual({ text: 'fur', from: [0, 1, 3], to: [1, 3, 4] })
    // A letter outside the first plane is one character, two code units long.
    expect(foldWithPlaces('𝐀b')).toEqual({ text: '𝐀b', from: [0, 0, 2], to: [2, 2, 3] })
    // A Hangul syllable stays one letter: "가" is not the start of "강".
    expect(foldWithPlaces('강남')).toEqual({ text: '강남', from: [0, 1], to: [1, 2] })
    expect(fold('가')).not.toBe(fold('강').slice(0, 1))
    expect(fold('Éé')).toBe('ee')
  })

  it('marks the match where it is, whatever stands before it', async () => {
    // "İ" is one character that lowercases to two: the text and what is compared must not drift apart.
    const [hit] = search(await adrs(), 'copy lives')
    expect(hit!.excerpt.filter((part) => part.match).map((part) => part.text)).toEqual(['copy'])
    // No space to start at in front of the match: it still has to be in sight.
    const [inUrl] = search(await adrs(), 'step-by-step')
    const shown = inUrl!.excerpt.map((part) => part.text)
    expect(shown[0]!.length).toBeLessThanOrEqual(42)
    expect(shown[1]).toBe('step-by-step')
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

describe('the search over several Decision Logs', () => {
  it('puts the best hit first, whichever log it is in, and the log in view first among equals', async () => {
    const service = await adrs()
    const repository = await openRepository(
      memoryFileSystem({
        'docs/adr/0001-sqlite-on-the-device.md': adr(['status: accepted'], 'SQLite on the device'),
        'docs/adr/0002-sync.md': adr(
          ['status: proposed'],
          'Sync',
          'Conflicts are resolved on the device.'
        )
      })
    )
    const logs = [
      { path: 'service/docs/adr', adrs: service },
      { path: 'app/docs/adr', adrs: repository.logs[0]!.adrs }
    ]
    const found = (inView: string): string[] =>
      searchLogs(logs, 'sqlite', inView).map(
        (hit) => `${hit.logPath.split('/')[0]} ${hit.adr.id.slice(0, 4)}`
      )
    // Two titles, then a text: the hit in the text of the log in view does not push a title away.
    expect(found('service/docs/adr')).toEqual(['service 0002', 'app 0001', 'service 0004'])
    expect(found('app/docs/adr')).toEqual(['app 0001', 'service 0002', 'service 0004'])
  })
})
