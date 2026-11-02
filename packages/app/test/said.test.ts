import { describe, expect, it, vi } from 'vitest'
import { SENTENCES, type CoreSaid, type Said } from '@adr-tool/core'
import { STRUCTURE_SENTENCES, wordingOf, type StructureProblem } from '@adr-tool/structure/model'
import { DIAGRAMS_SENTENCES } from '@adr-tool/diagrams'
import { DE, inGerman } from '../src/renderer/src/lib/said.de'
import { wordIn, wordOf, wordStructureProblem, wordWarnings } from '../src/renderer/src/lib/said'

// The window in English: what `core`, `structure` and `diagrams` say comes as they say it.
vi.mock('../src/renderer/src/lib/language', () => ({ language: 'en' }))

type Sentence = (values: unknown) => string

/**
 * Values for any sentence, by the name of the value: a sentence takes what it needs. What one
 * says of another is a code of its own module.
 */
function some(detail: Said): Record<string, unknown> {
  // Each value stands out in the sentence, so that a sentence that drops one is seen to.
  const known: Record<string, unknown> = {
    format: 'madr-2',
    type: 'amends',
    number: 731,
    added: 913,
    removed: 482,
    numbers: ['417', '4170'],
    keeps: ['‹keep-1›', '‹keep-2›'],
    files: ['src/‹file-1›.ts', 'src/‹file-2›.ts'],
    reasons: [
      { code: 'waits-for-successor', values: { adr: '‹reason›', successor: '‹successor›' } }
    ],
    why: { code: 'not-a-list', values: { key: '‹why-key›' } },
    detail
  }
  return new Proxy(known, { get: (values, key: string) => values[key] ?? `‹${key}›` })
}

const MODULES = [
  {
    name: 'core',
    sentences: SENTENCES,
    detail: { code: 'not-a-date', values: { value: '‹detail-value›' } }
  },
  {
    name: 'structure',
    sentences: STRUCTURE_SENTENCES,
    detail: { code: 'top-not-map', values: {} }
  },
  {
    name: 'diagrams',
    sentences: DIAGRAMS_SENTENCES,
    detail: { code: 'diagram-not-map', values: {} }
  }
] as const

describe('German', () => {
  it('has a sentence for every code of core, structure and diagrams', () => {
    // The compiler asks for them (`DE` is typed by the three tables); this says so where it runs.
    for (const { sentences } of MODULES) {
      for (const code of Object.keys(sentences)) expect(Object.keys(DE), code).toContain(code)
    }
    const codes = new Set(MODULES.flatMap(({ sentences }) => Object.keys(sentences)))
    expect(Object.keys(DE).filter((code) => !codes.has(code))).toEqual([])
  })

  it('gives each module codes of its own: only the kernel’s are shared', () => {
    for (const [first, second] of [
      [SENTENCES, STRUCTURE_SENTENCES],
      [SENTENCES, DIAGRAMS_SENTENCES],
      [STRUCTURE_SENTENCES, DIAGRAMS_SENTENCES]
    ] as const) {
      const shared = Object.keys(first).filter((code) => code in second)
      expect(shared.sort()).toEqual(['already-exists', 'no-longer-exists'])
    }
  })

  it('says every sentence in German, not in English, and leaves no value out', () => {
    for (const { sentences, detail } of MODULES) {
      for (const [code, english] of Object.entries(sentences)) {
        const values = some(detail)
        const german = (DE as unknown as Record<string, Sentence>)[code]!(values)
        expect(german, code).not.toBe((english as Sentence)(values))
        expect(german, code).not.toMatch(/undefined|\[object Object\]|‹(format|type|why|detail)›/)
        // A value the English sentence names, the German one names too: every marked value,
        // every number, and the name of a format.
        const named = (english as Sentence)(values).match(/‹[\w-]+›|\b\d{3,}\b|MADR 2/g) ?? []
        for (const value of named) expect(german, `${code}: ${value}`).toContain(value)
      }
    }
  })

  it('words what one sentence says within another in German too', () => {
    const said: CoreSaid = {
      code: 'nothing-migrated',
      values: {
        reasons: [
          {
            code: 'cannot-migrate',
            values: { adr: '0002-b', why: { code: 'not-a-list', values: { key: 'tags' } } }
          },
          { code: 'waits-for-successor', values: { adr: '0001-a', successor: '0002-b' } }
        ]
      }
    }
    expect(inGerman(said)).toBe(
      'Nichts kann migriert werden. 0002-b kann nicht migriert werden: „tags“ ist keine Liste 0001-a wartet auf seinen Nachfolger 0002-b.'
    )
    expect(
      wordIn(
        'de',
        { code: 'cannot-migrate', values: { adr: '0002-b', why: 'a parser said so' } },
        ''
      )
    ).toBe('0002-b kann nicht migriert werden: a parser said so')
  })

  it('is what a window in German shows, where there is a code', () => {
    const said: CoreSaid = { code: 'no-adr', values: { id: '0042' } }
    expect(wordIn('de', said, 'There is no ADR 0042 in this Decision Log.')).toBe(
      'Es gibt kein ADR 0042 in diesem Decision Log.'
    )
    expect(wordIn('de', undefined, 'Said by the main process.')).toBe('Said by the main process.')
    expect(wordIn('de', { code: 'of-another-module', values: {} }, 'Unknown.')).toBe('Unknown.')
  })
})

describe('a window in English', () => {
  it('shows what core and structure say as they say it', () => {
    const said: CoreSaid = { code: 'no-adr', values: { id: '0042' } }
    expect(wordOf(said, 'There is no ADR 0042 in this Decision Log.')).toBe(
      'There is no ADR 0042 in this Decision Log.'
    )
    expect(wordIn('en', said, 'as it was said')).toBe('as it was said')
    const problem: StructureProblem = { kind: 'empty-component', component: 'core' }
    expect(wordStructureProblem(problem)).toBe(wordingOf(problem))
  })

  it('keeps the warnings in their order, those without a code as well', () => {
    const warnings = ['A number changed: 20.', 'On the branch b, 0003-x has the number 3 too.']
    const warned: CoreSaid[] = [{ code: 'number-changed', values: { numbers: ['20'] } }]
    expect(wordWarnings({ warnings, warned })).toEqual(warnings)
    expect(wordWarnings({ warnings })).toEqual(warnings)
  })
})
