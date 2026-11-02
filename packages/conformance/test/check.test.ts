import { describe, expect, it } from 'vitest'
import { adrExists, fingerprintText, wordingOf, type ConformanceReport } from '../src'
import { checked, found, shop, yaml } from './repository'

const problems = (report: ConformanceReport) =>
  report.problems.map((problem) => `${problem.line}: ${problem.kind}: ${wordingOf(problem)}`)

const decisions = {
  logs: ['docs/adr'],
  adrs: [{ log: 'docs/adr', id: '0001-billing-may-format-like-the-web' }]
}

const billingNotWeb = [
  'rules:',
  '  - id: billing-not-web',
  '    why: Billing is the domain; the web is how it is shown.',
  '    kind: must-not-depend',
  '    from: billing',
  '    to: web'
]

describe('the Components a Rule names', () => {
  it('are declared: an ID that is not, or a pattern that matches none, is a Problem', async () => {
    const report = await checked(
      shop,
      yaml(
        'rules:',
        '  - id: a',
        '    why: W.',
        '    kind: must-not-depend',
        '    from: [billing, shipping]',
        '    to: [ui/**, web]',
        'patterns:',
        '  - id: p',
        '    pattern: layered',
        '    roles:',
        '      top: [frontend]'
      )
    )
    expect(problems(report)).toEqual([
      '5: unknown-component: The Rule a names shipping in from, which is not a declared Component.',
      '6: no-component-matches: The Rule a has the pattern "ui/**" in to, which matches no declared Component.',
      '11: unknown-component: The applied Pattern p names frontend in roles of top, which is not a declared Component.'
    ])
    // The Rule is still checked with the names that exist.
    expect(found(report)).toEqual(['a: billing -> web'])
  })

  it('are no Draft: Rules on a repository that declares nothing are a Problem, and not checked', async () => {
    const draft = { ...shop }
    delete draft['.arch/components.yml']
    const report = await checked(draft, yaml('# The Rules', ...billingNotWeb))
    expect(report.evaluated).toBe(false)
    expect(found(report)).toEqual([])
    expect(problems(report)).toEqual([
      '2: rules-without-declaration: .arch/rules.yml has Rules, and .arch/components.yml declares no Components that can be read, so no Rule is checked. Declare the Components, or adopt the Draft, first.'
    ])
    const unreadable = await checked(
      { ...draft, '.arch/components.yml': 'components: [x]\n' },
      yaml(...billingNotWeb)
    )
    expect(unreadable.problems.map((problem) => problem.kind)).toEqual([
      'rules-without-declaration'
    ])
  })
})

describe('Exceptions (docs/conformance-format.md, section 4)', () => {
  const exception = (...lines: string[]) => [
    '  - rule: billing-not-web',
    ...lines.map((line) => `    ${line}`)
  ]

  it('accept the Violation whose fingerprint they name', async () => {
    const report = await checked(
      shop,
      yaml(
        ...billingNotWeb,
        'exceptions:',
        ...exception(
          'from: billing',
          'to: web',
          'reason: The invoice formats dates as the web does, for now.',
          'justified-by: docs/adr/0001-billing-may-format-like-the-web'
        )
      ),
      decisions
    )
    expect(report.problems).toEqual([])
    expect(found(report)).toEqual(['billing-not-web: billing -> web (accepted)'])
    expect(report.violations[0]!.exception).toEqual({
      line: 8,
      rule: 'billing-not-web',
      from: 'billing',
      to: 'web',
      reason: 'The invoice formats dates as the web does, for now.',
      justifiedBy: { adr: 'docs/adr/0001-billing-may-format-like-the-web', line: 12 }
    })
  })

  it('that match no Violation, or name an ADR that is not there, are Problems', async () => {
    const report = await checked(
      shop,
      yaml(
        ...billingNotWeb,
        'exceptions:',
        ...exception('from: web', 'to: billing', 'reason: Gone.'),
        ...exception(
          'from: billing',
          'to: web',
          'reason: R.',
          'justified-by: docs/adr/0099-never-written'
        ),
        ...exception('from: billing', 'to: web', 'reason: Twice.')
      ),
      decisions
    )
    expect(problems(report)).toEqual([
      '8: unmatched-exception: The Exception billing-not-web: web -> billing matches no Violation: the Violation is gone. Remove the Exception.',
      '16: unknown-justification: The Exception billing-not-web: billing -> web is justified by docs/adr/0099-never-written, which is not an ADR of this repository. An ADR is named by the directory of its Decision Log and its ID: docs/adr/0001-example.',
      '17: duplicate-exception: There is an Exception billing-not-web: billing -> web already. The first one counts.'
    ])
    expect(found(report)).toEqual(['billing-not-web: billing -> web (accepted)'])
  })

  it('name a Rule that is in the file, by the keys of its kind', async () => {
    const report = await checked(
      shop,
      yaml(
        ...billingNotWeb,
        '  - id: broken',
        '    why: W.',
        '    kind: threshold',
        'exceptions:',
        '  - rule: gone',
        '    from: billing',
        '    to: web',
        '    reason: R.',
        ...exception('component: billing', 'reason: R.'),
        '  - rule: broken',
        '    component: billing',
        '    reason: R.'
      )
    )
    expect(problems(report)).toEqual([
      '7: invalid-rule: The Rule broken cannot be checked: it has no "metric".',
      '11: exception-unknown-rule: An Exception names the Rule gone, which is not in this file.',
      '15: invalid-exception: An Exception from the Rule billing-not-web cannot be read: an Exception from a Rule of the kind must-not-depend names its Violation by "from" and "to".'
    ])
  })

  it('of a Cycle name its members in any order, of a threshold its Component', async () => {
    const report = await checked(
      shop,
      yaml(
        'rules:',
        '  - {id: features, why: W., kind: no-cycles, among: features/*}',
        '  - {id: small, why: W., kind: threshold, metric: files, max: 2, of: billing}',
        'exceptions:',
        '  - {rule: features, cycle: [features/b, features/a], reason: R.}',
        '  - {rule: small, component: billing, reason: R.}'
      )
    )
    expect(report.problems).toEqual([])
    expect(found(report)).toEqual([
      'features: features/a features/b (accepted)',
      'small: billing (accepted)'
    ])
  })

  it('keep matching when lines move and imports are added: the fingerprint has no line', async () => {
    const rules = yaml(
      ...billingNotWeb,
      'exceptions:',
      ...exception('from: billing', 'to: web', 'reason: R.')
    )
    const before = await checked(shop, rules)
    const moved = await checked(
      {
        ...shop,
        'src/billing/invoice.ts': `// A new first line\n\n${shop['src/billing/invoice.ts']}`,
        'src/billing/tax.ts': `${shop['src/billing/tax.ts']}import { page } from '../web/page'\n`
      },
      rules
    )
    expect(moved.problems).toEqual([])
    const fingerprint = (report: ConformanceReport) =>
      report.violations.map((violation) => fingerprintText(violation.fingerprint))
    expect(fingerprint(moved)).toEqual(fingerprint(before))
    expect(fingerprint(moved)).toEqual(['billing-not-web: billing -> web'])
    expect(moved.violations[0]!.exception).toBeDefined()
    // The lines behind it moved, and the new import is behind it too.
    expect(before.violations[0]!.dependencies.map((one) => `${one.from}:${one.lines}`)).toEqual([
      'src/billing/invoice.ts:2'
    ])
    expect(moved.violations[0]!.dependencies.map((one) => `${one.from}:${one.lines}`)).toEqual([
      'src/billing/invoice.ts:4',
      'src/billing/tax.ts:2'
    ])
  })

  it('keep matching when a child Component is declared beneath one side', async () => {
    const rules = yaml(...billingNotWeb)
    const deeper = {
      ...shop,
      '.arch/components.yml': shop['.arch/components.yml']!.replace(
        '    paths: [src/web/**]\n',
        '    paths: [src/web/**]\n    components:\n      format:\n        paths: [src/web/format.ts]\n'
      )
    }
    expect(found(await checked(deeper, rules))).toEqual(found(await checked(shop, rules)))
  })
})

describe('justified-by names an ADR as the repository names it from outside a log', () => {
  it('by its log and ID, by a bare ID in the one log, or in another repository', () => {
    const two = {
      logs: ['docs/adr', ''],
      adrs: [
        { log: 'docs/adr', id: '0001-a' },
        { log: '', id: '0002-root' }
      ]
    }
    expect(adrExists('docs/adr/0001-a', two)).toBe(true)
    expect(adrExists('./0002-root', two)).toBe(true)
    expect(adrExists('docs/adr/0002-root', two)).toBe(false)
    // A bare ID is one of the only Decision Log, and of none where there are two.
    expect(adrExists('0001-a', two)).toBe(false)
    expect(adrExists('0001-a', { logs: ['docs/adr'], adrs: two.adrs })).toBe(true)
    // Another repository's ADR is taken as written.
    expect(adrExists('payments:docs/adr/0003-ledger', two)).toBe(true)
    expect(adrExists('payments:0003-ledger', two)).toBe(false)
  })

  it('is not checked when the checker is not told about the Decision Logs', async () => {
    const report = await checked(
      shop,
      yaml(
        ...billingNotWeb,
        'exceptions:',
        '  - {rule: billing-not-web, from: billing, to: web, reason: R., justified-by: 0042-x}'
      )
    )
    expect(report.problems).toEqual([])
  })
})
