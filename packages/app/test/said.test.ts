import { describe, expect, it, vi } from 'vitest'
import { CONFORMANCE_SENTENCES, type ConformanceSaid } from '@adr-tool/conformance'
import { SENTENCES, type CoreSaid, type Said } from '@adr-tool/core'
import { REVIEW_SENTENCES } from '@adr-tool/review'
import { STRUCTURE_SENTENCES, wordingOf, type StructureProblem } from '@adr-tool/structure/model'
import { DIAGRAMS_SENTENCES } from '@adr-tool/diagrams'
import { DE, inGerman } from '../src/renderer/src/lib/said.de'
import { wordIn, wordOf, wordStructureProblem, wordWarnings } from '../src/renderer/src/lib/said'

// The window in English: what the modules say comes as they say it.
vi.mock('../src/renderer/src/lib/language', () => ({ language: 'en' }))

type Sentence = (values: unknown) => string

/**
 * Values for any sentence, by the name of the value: a sentence takes what it needs. What one
 * says of another is a code of its own module.
 */
function some(
  detail: Said,
  why: Said = { code: 'not-a-list', values: { key: '‹why-key›' } }
): Record<string, unknown> {
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
    candidates: ['docs/adr/‹candidate-1›', 'services/docs/adr/‹candidate-2›'],
    reasons: [
      { code: 'waits-for-successor', values: { adr: '‹reason›', successor: '‹successor›' } }
    ],
    why,
    // Of Conformance: what it names takes lists and Said values of its own.
    kinds: ['‹kind-1›', '‹kind-2›'],
    allowed: ['‹allowed-1›', '‹allowed-2›'],
    members: ['‹member-1›', '‹member-2›', '‹member-3›'],
    roundTrip: ['‹member-1›', '‹member-2›', '‹member-3›'],
    weakest: ['‹weak-from›', '‹weak-to›'],
    metrics: ['‹metric-1›'],
    keys: ['‹key-1›', '‹key-2›'],
    by: 'rule',
    where: 'above',
    bound: 'max',
    change: 'add-rule',
    value: 417,
    limit: 731,
    line: 913,
    violation: { code: 'must-not-depend', values: { from: '‹v-from›', to: '‹v-to›' } },
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
    name: 'conformance',
    sentences: CONFORMANCE_SENTENCES,
    detail: { code: 'missing-key', values: { key: '‹detail-key›' } },
    why: { code: 'list-in-brackets', values: { key: '‹why-key›' } }
  },
  {
    name: 'diagrams',
    sentences: DIAGRAMS_SENTENCES,
    detail: { code: 'diagram-not-map', values: {} }
  },
  {
    name: 'review',
    sentences: REVIEW_SENTENCES,
    detail: { code: 'frontmatter-yaml', values: { message: '‹detail-message›' } }
  }
] as const

/**
 * The codes the modules take from the kernel: those of every operation and of why
 * `.arch/config.yml` cannot be read (`KERNEL_SENTENCES`), and why a file in YAML cannot be read
 * (`YAML_SENTENCES`), for the two that read one.
 */
const KERNEL_CODES = [
  'already-exists',
  'no-longer-exists',
  'unreadable-config',
  'config-not-yaml',
  'config-not-map',
  'not-yaml',
  'top-not-map'
]

describe('German', () => {
  it('has a sentence for every code of core, structure, conformance, diagrams and review', () => {
    // The compiler asks for them (`DE` is typed by the tables); this says so where it runs.
    for (const { sentences } of MODULES) {
      for (const code of Object.keys(sentences)) expect(Object.keys(DE), code).toContain(code)
    }
    const codes = new Set(MODULES.flatMap(({ sentences }) => Object.keys(sentences)))
    expect(Object.keys(DE).filter((code) => !codes.has(code))).toEqual([])
  })

  it('gives every module codes of its own: only the kernel’s are shared', () => {
    for (const one of MODULES) {
      for (const other of MODULES) {
        if (one === other) continue
        const shared = Object.keys(one.sentences).filter((code) => code in other.sentences)
        for (const code of shared)
          expect(KERNEL_CODES, `${one.name}, ${other.name}`).toContain(code)
      }
    }
  })

  it('says every sentence in German, not in English, and leaves no value out', () => {
    for (const module of MODULES) {
      const { sentences, detail } = module
      for (const [code, english] of Object.entries(sentences)) {
        const values = some(detail, 'why' in module ? module.why : undefined)
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

  it('words a Violation at its import, and why a Rule cannot be written', () => {
    const at: ConformanceSaid = {
      code: 'violation-at',
      values: {
        violation: { code: 'must-not-depend', values: { from: 'structure', to: 'core' } },
        file: 'packages/structure/src/model.ts',
        line: 3,
        imports: 'packages/core/src/index.ts'
      }
    }
    expect(inGerman(at)).toBe(
      'structure darf nicht von core abhängen: packages/structure/src/model.ts:3 importiert packages/core/src/index.ts.'
    )
    const refused: ConformanceSaid = {
      code: 'cannot-write-rules',
      values: {
        path: '.arch/rules.yml',
        change: 'add-rule',
        why: { code: 'list-in-brackets', values: { key: 'rules' } }
      }
    }
    expect(inGerman(refused)).toBe(
      '.arch/rules.yml ist so geschrieben, dass die Suite keine Regel hinzufügen kann, ohne mehr davon neu zu schreiben: „rules“ ist in eckigen Klammern geschrieben. Das muss in einem Editor geändert werden.'
    )
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
