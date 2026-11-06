import { describe, expect, it } from 'vitest'
import { draftOf, readRules, type Rule } from '@adr-tool/conformance'
import { memoryFileSystem } from '@adr-tool/core'
import { analyseDependencies, openStructure } from '@adr-tool/structure'
import { conformanceView, planException, planRule } from '../src/main/conformance'
import type { ConformanceException, ConformanceViolation, StructureView } from '../src/shared/ipc'
import {
  adrNamed,
  draftOfForm,
  exceptionNames,
  exceptionsJustifiedBy,
  missingOf,
  numberOf,
  referenceOf,
  ruleFormOf,
  rulesNaming,
  violationsAbout,
  violationsOnLevel
} from '../src/renderer/src/lib/conformance'

// docs/plan-vision.md, part 4: what the window makes of the Rules — the form a Rule is written
// with, the Violations on a level of the drawing, what names a Component or an ADR.

const RULES = readRules(
  [
    'rules:',
    '  - id: billing-not-web',
    '    why: Billing is the domain.',
    '    kind: must-not-depend',
    '    from: billing',
    '    to: [web, ui/**]',
    '    type-only: ignored',
    '  - id: persistence-alone',
    '    why: Storage knows nothing else.',
    '    kind: may-only-depend',
    '    from: persistence',
    '    to: []',
    '  - id: layered',
    '    why: Top down.',
    '    kind: layers',
    '    layers: [web, [billing, shipping], persistence]',
    '    mode: strict',
    '  - id: features-apart',
    '    why: Features stand alone.',
    '    kind: no-cycles',
    "    inside: 'features/*'",
    '    tests: included',
    '  - id: small',
    '    why: Small things.',
    '    kind: threshold',
    '    metric: fan-out',
    '    max: 0.5',
    '    of: billing',
    ''
  ].join('\n')
).rules

const ruleOf = (id: string): Rule => RULES.find((rule) => rule.id === id)!

describe('the form a Rule is written with', () => {
  it('starts from a Rule of every kind and gives the same Rule back', () => {
    for (const rule of RULES) expect(draftOfForm(ruleFormOf(rule))).toEqual(draftOf(rule))
  })

  it('starts empty for a new Rule, and says what it lacks', () => {
    const form = ruleFormOf()
    expect(form.original).toBeUndefined()
    expect(missingOf(form)).toEqual(['id', 'why', 'from', 'to'])
    expect(draftOfForm(form)).toBeUndefined()
    form.id = 'web-alone'
    form.why = 'The web is the top.'
    form.kind = 'may-only-depend'
    form.from = ['web']
    // An empty `to` says: no other Component at all.
    expect(missingOf(form)).toEqual([])
    expect(draftOfForm(form)).toEqual({
      id: 'web-alone',
      why: 'The web is the top.',
      tests: false,
      ignoreTypeOnly: false,
      kind: 'may-only-depend',
      from: ['web'],
      to: []
    })
  })

  it('reads a limit with a point or a comma, and leaves out what is empty', () => {
    expect(numberOf(' 0,5 ')).toBe(0.5)
    expect(numberOf('12')).toBe(12)
    expect(numberOf('')).toBeUndefined()
    expect(numberOf('half')).toBeNaN()
    const form = ruleFormOf(ruleOf('small'))
    form.max = ''
    expect(missingOf(form)).toEqual(['max'])
    form.min = '0,25'
    expect(draftOfForm(form)).toMatchObject({ kind: 'threshold', min: 0.25, of: ['billing'] })
    expect(draftOfForm(form)).not.toHaveProperty('max')
    form.min = 'x'
    expect(missingOf(form)).toEqual(['min'])
  })

  it('needs two layers, and writes only those that name a Component', () => {
    const form = ruleFormOf(ruleOf('layered'))
    expect(form.strict).toBe(true)
    form.layers = [['web'], [], []]
    expect(missingOf(form)).toEqual(['layers'])
    form.layers = [['web'], [], ['persistence']]
    expect(draftOfForm(form)).toMatchObject({ layers: [['web'], ['persistence']], mode: 'strict' })
  })
})

const dependency = (from: string, to: string, lines = [1]) => ({
  from,
  to,
  typeOnly: false,
  lines
})

const violation = (
  key: string,
  extra: Partial<ConformanceViolation> = {}
): ConformanceViolation => ({
  key,
  rule: 'billing-not-web',
  kind: 'must-not-depend',
  fingerprint: { kind: 'dependency', rule: 'billing-not-web', from: 'billing', to: 'web' },
  said: { code: 'must-not-depend', values: { from: 'billing', to: 'web' } },
  dependencies: [],
  ...extra
})

describe('the Violations on a level of the drawing', () => {
  const level: Pick<StructureView, 'nodes' | 'edges'> = {
    nodes: [
      { id: 'billing', kind: 'component', name: 'billing', files: 2, lines: 10 },
      { id: 'web', kind: 'component', name: 'web', files: 1, lines: 5 },
      { id: 'persistence', kind: 'component', name: 'persistence', files: 1, lines: 5 }
    ] as unknown as StructureView['nodes'],
    edges: [
      {
        from: 'billing',
        to: 'web',
        weight: 2,
        typeOnly: false,
        dependencies: [
          dependency('src/billing/a.ts', 'src/web/x.ts'),
          dependency('src/billing/b.ts', 'src/web/x.ts')
        ]
      },
      {
        from: 'billing',
        to: 'persistence',
        weight: 1,
        typeOnly: false,
        dependencies: [dependency('src/billing/a.ts', 'src/persistence/db.ts')]
      }
    ]
  }

  it('marks a line red by the Source File Dependencies behind it, unless an Exception accepts it', () => {
    const open = violation('one', {
      dependencies: [dependency('src/billing/b.ts', 'src/web/x.ts')]
    })
    const accepted = violation('two', {
      dependencies: [dependency('src/billing/a.ts', 'src/persistence/db.ts')],
      exception: { line: 9, rule: 'billing-not-web', reason: 'Accepted.' }
    })
    const drawn = violationsOnLevel(level, [open, accepted])
    expect([...drawn.edges.keys()]).toEqual(['billing\nweb'])
    expect(drawn.edges.get('billing\nweb')).toEqual([open])
    expect(drawn.nodes.size).toBe(0)
  })

  it('marks a box red for a threshold of the Component or of one inside it', () => {
    const inside = violation('three', {
      rule: 'small',
      kind: 'threshold',
      component: 'billing/tax',
      value: 3
    })
    const drawn = violationsOnLevel(level, [inside])
    expect([...drawn.nodes.keys()]).toEqual(['billing'])
    expect(drawn.edges.size).toBe(0)
  })
})

describe('what names a Component, and what an ADR justifies', () => {
  it('finds the Rules that name a Component, by ID or by a pattern', () => {
    expect(rulesNaming(RULES, 'billing').map((rule) => rule.id)).toEqual([
      'billing-not-web',
      'layered',
      'small'
    ])
    expect(rulesNaming(RULES, 'ui/forms').map((rule) => rule.id)).toEqual(['billing-not-web'])
    expect(rulesNaming(RULES, 'features/a').map((rule) => rule.id)).toEqual(['features-apart'])
  })

  it('finds the Violations about a Component or one inside it', () => {
    const from = violation('a', { from: 'billing/tax', to: 'web' })
    const cycle = violation('b', {
      cycle: { members: ['features/a', 'features/b'], roundTrip: ['features/a'], typeOnly: false }
    })
    expect(violationsAbout([from, cycle], 'billing')).toEqual([from])
    expect(violationsAbout([from, cycle], 'features/b')).toEqual([cycle])
    expect(violationsAbout([from, cycle], 'bill')).toEqual([])
  })

  it('finds the Exceptions an ADR justifies, by its log and ID, or its ID alone in one log', () => {
    const exception = (adr: string, line: number): ConformanceException => ({
      line,
      rule: 'billing-not-web',
      from: 'billing',
      to: 'web',
      reason: 'Dates.',
      justifiedBy: { adr, line: line + 1 },
      accepts: []
    })
    const written = [
      exception('docs/adr/0009-dates', 4),
      exception('0009-dates', 8),
      exception('./0009-dates', 12)
    ]
    expect(
      exceptionsJustifiedBy(written, ['docs/adr'], 'docs/adr', '0009-dates').map((e) => e.line)
    ).toEqual([4, 8])
    expect(
      exceptionsJustifiedBy(written, ['docs/adr', ''], 'docs/adr', '0009-dates').map((e) => e.line)
    ).toEqual([4])
    expect(
      exceptionsJustifiedBy(written, ['docs/adr', ''], '', '0009-dates').map((e) => e.line)
    ).toEqual([12])
    expect(exceptionNames(written[0]!)).toBe('billing → web')
  })

  it('names an ADR as an Exception does, and finds it again', () => {
    const logs = [
      { path: 'docs/adr', adrs: [{ id: '0009-dates' }] },
      { path: '', adrs: [{ id: '0001-top' }] }
    ]
    expect(referenceOf('docs/adr', '0009-dates')).toBe('docs/adr/0009-dates')
    expect(referenceOf('', '0001-top')).toBe('./0001-top')
    expect(adrNamed('./0001-top', logs)).toEqual({ log: '', adr: { id: '0001-top' } })
    expect(adrNamed('docs/adr/0009-dates', logs)?.log).toBe('docs/adr')
    expect(adrNamed('0009-dates', logs)).toBeUndefined()
  })
})

describe('the Rules as the main process checks and plans them', () => {
  const adr = [
    '---',
    'status: accepted',
    'created: 2026-11-01',
    'decided: 2026-11-01',
    'decision-makers: [Kim Becker]',
    '---',
    '',
    '# The invoice formats dates like the web',
    '',
    'It does.',
    ''
  ].join('\n')
  const files = {
    '.arch/components.yml': [
      'components:',
      '  web:',
      '    paths: [src/web/**]',
      '  billing:',
      '    paths: [src/billing/**]',
      ''
    ].join('\n'),
    '.arch/rules.yml': [
      'rules:',
      '  - id: billing-not-web',
      '    why: Billing is the domain.',
      '    kind: must-not-depend',
      '    from: billing',
      '    to: web',
      '  - id: simple',
      '    why: Simple functions.',
      '    kind: threshold',
      '    metric: complexity',
      '    max: 1',
      '    of: web',
      'exceptions:',
      '  - rule: billing-not-web',
      '    from: billing',
      '    to: web',
      '    reason: The invoice formats dates like the web.',
      '    justified-by: 0001-dates',
      ''
    ].join('\n'),
    'docs/adr/0001-dates.md': adr,
    'src/web/format.ts': [
      'export function format(d: Date | undefined): string {',
      "  return d ? d.toISOString() : ''",
      '}',
      ''
    ].join('\n'),
    'src/billing/invoice.ts':
      "import { format } from '../web/format'\nexport const invoice = format\n"
  }

  async function viewOf(fs: ReturnType<typeof memoryFileSystem>) {
    const paths = Object.keys(files)
    const structure = await openStructure(fs, paths)
    const dependencies = await analyseDependencies(fs, paths, structure.sourceFiles)
    return conformanceView(
      'r1',
      fs,
      { structure, dependencies, milliseconds: 0 },
      {
        current: true,
        analysedAt: 0
      }
    )
  }

  it('gives each Violation its key, the file and the Component of a function, and each Exception what it accepts', async () => {
    const view = await viewOf(memoryFileSystem(files))
    expect(view.problems).toEqual([])
    const [dependency, complex] = view.violations
    expect(dependency).toMatchObject({
      rule: 'billing-not-web',
      from: 'billing',
      to: 'web',
      exception: { line: 14 }
    })
    expect(complex).toMatchObject({
      rule: 'simple',
      file: 'src/web/format.ts',
      line: 1,
      name: 'format',
      owner: 'web',
      value: 2,
      fingerprint: { kind: 'function', rule: 'simple', file: 'src/web/format.ts', name: 'format' }
    })
    expect(view.exceptions).toMatchObject([
      {
        line: 14,
        fingerprint: { kind: 'dependency', rule: 'billing-not-web', from: 'billing', to: 'web' },
        accepts: [dependency!.key]
      }
    ])
  })

  it('plans a Rule with a warning for a name the declaration does not have, and an Exception by an ADR there is', async () => {
    const fs = memoryFileSystem(files)
    const added = await planRule(fs, {
      action: 'add',
      draft: { id: 'apart', why: 'W.', kind: 'no-cycles', scope: 'among', components: ['shop'] }
    })
    expect(added).toMatchObject({ ok: true, warned: [{ code: 'unknown-component' }] })
    expect(await planRule(fs, { action: 'remove', id: 'simple' })).toMatchObject({ ok: true })
    const fingerprint = {
      kind: 'function' as const,
      rule: 'simple',
      file: 'src/web/format.ts',
      name: 'format'
    }
    const accepted = await planException(fs, {
      fingerprint,
      reason: 'R.',
      justifiedBy: '0001-dates'
    })
    if (!accepted.ok) throw new Error(accepted.reason)
    expect(accepted.changeSet.files[0]!.after).toContain('    name: format\n')
    expect(
      await planException(fs, { fingerprint, reason: 'R.', justifiedBy: '0099-never' })
    ).toMatchObject({ ok: false, said: { code: 'unknown-justification' } })
  })
})
