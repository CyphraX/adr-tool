import { describe, expect, it } from 'vitest'
import { memoryFileSystem } from '@adr-tool/kernel'
import {
  citingComponent,
  findingsCiting,
  hasRepair,
  metricValueIn,
  openAssessments,
  planEvidence,
  traceProblems,
  wordingOf,
  type AdrReference,
  type Known
} from '../src'

const DIR = 'docs/architecture/assessments'

const assessment = (frontmatter: string, findings: string): string =>
  [
    '---',
    frontmatter,
    '---',
    '',
    '# An Assessment',
    '',
    '## S1',
    '',
    '```yaml',
    'scenario: S1',
    'attribute: maintainability',
    'stimulus: a change',
    'response: made',
    'measure: in a day',
    '```',
    '',
    '## F1',
    '',
    '```yaml',
    'finding: F1',
    findings,
    '```',
    ''
  ].join('\n')

const EVIDENCE = [
  'scenarios: [S1, S7]',
  'evidence:',
  '  - violation: web-through-cart',
  '    from: web',
  '    to: catalog',
  '  - violation: no-cycles',
  '    cycle: [cart, web]',
  '  - metric: instability',
  '    component: cart',
  '  - metric: complexity',
  '    file: cart/Cart.java',
  '    name: Cart.total()',
  '  - annotation: 20261102-gone',
  '  - adr: 0004-events',
  '  - adr: docs/adr/0009-gone',
  '  - risk: gone',
  '  - debt: d'
].join('\n')

const ADRS: AdrReference[] = [
  { log: 'docs/adr', id: '0004-events' },
  { log: 'services/billing/docs/adr', id: '0004-events' }
]

const KNOWN: Known = {
  components: ['cart', 'web'],
  violations: [{ kind: 'cycle', rule: 'no-cycles', cycle: ['web', 'cart'] }],
  metrics: { components: { cart: { instability: 0.5 } } },
  annotations: ['20261102-there'],
  adrs: ADRS
}

async function reading(
  frontmatter: string,
  findings = EVIDENCE,
  more: Record<string, string> = {}
) {
  return openAssessments(
    memoryFileSystem({
      [`${DIR}/a.md`]: assessment(frontmatter, findings),
      'docs/architecture/debt/d.md': '---\ncomponents: [cart, gone]\n---\n# D\n',
      ...more
    })
  )
}

describe('the Traces of an Assessment', () => {
  it('are each checked against what the caller hands in', async () => {
    const read = await reading('date: 2026-11-03\nscope: [cart, catalog]\nprevious: gone')
    expect(read.problems).toEqual([])
    const problems = traceProblems(read, KNOWN)
    expect(problems.map(wordingOf)).toEqual([
      `${DIR}/a.md names catalog in "scope", which is not a declared Component.`,
      `${DIR}/a.md follows gone, which is no Assessment of this repository.`,
      `${DIR}/a.md: F1 concerns S7, which is no Quality Scenario of this Assessment.`,
      `${DIR}/a.md: F1 cites the Violation web-through-cart: web -> catalog, which the code no longer has. Look at the Finding again: it may be resolved.`,
      `${DIR}/a.md: F1 cites complexity of Cart.total() in cart/Cart.java, which the code does not have.`,
      `${DIR}/a.md: F1 cites 20261102-gone, which is no Annotation of this repository.`,
      `${DIR}/a.md: F1 cites 0004-events, which several Decision Logs have: docs/adr/0004-events and services/billing/docs/adr/0004-events. Name it with its log.`,
      `${DIR}/a.md: F1 cites docs/adr/0009-gone, which is no ADR of this repository.`,
      `${DIR}/a.md: F1 cites gone, which is no Risk of this repository.`,
      'docs/architecture/debt/d.md names gone in "components", which is not a declared Component.'
    ])
    expect(problems.map(hasRepair)).toEqual([
      true,
      false,
      true,
      true,
      true,
      true,
      false,
      true,
      true,
      true
    ])
  })

  it('check nothing that is not handed in: on a Draft, no Component; without Rules, no Violation', async () => {
    const read = await reading('date: 2026-11-03\nscope: [whatever]')
    expect(traceProblems(read).map((problem) => problem.kind)).toEqual([
      'finding-unknown-scenario',
      'finding-unknown-risk'
    ])
  })

  it('read a metric from the Snapshot when there is one, however the code moved on', async () => {
    const snapshot = `${DIR}/a.snapshot.yml`
    const frozen = await reading('date: 2026-11-03', EVIDENCE, {
      [snapshot]: 'components:\n  cart:\n    instability: 0.75\n'
    })
    const kinds = traceProblems(frozen, KNOWN).map((problem) => problem.kind)
    expect(kinds).toContain('metric-not-in-snapshot')
    expect(kinds).not.toContain('metric-not-measured')
    expect(
      wordingOf(traceProblems(frozen, KNOWN).find((p) => p.kind === 'metric-not-in-snapshot')!)
    ).toBe(
      `${DIR}/a.md: F1 cites complexity of Cart.total() in cart/Cart.java, which its Snapshot does not hold.`
    )
    // A Snapshot that cannot be read says so once, and no metric is checked against it.
    const broken = await reading('date: 2026-11-03', EVIDENCE, { [snapshot]: 'components: [\n' })
    expect(broken.problems.map((problem) => problem.kind)).toEqual(['unreadable-snapshot'])
    expect(traceProblems(broken, KNOWN).map((problem) => problem.kind)).not.toContain(
      'metric-not-in-snapshot'
    )
  })

  it('keep a final Assessment as a record of its day: its Violations are not checked, its metrics need a Snapshot', async () => {
    const read = await reading('date: 2026-11-03\nstatus: final')
    const kinds = traceProblems(read, KNOWN).map((problem) => problem.kind)
    expect(kinds).not.toContain('violation-gone')
    expect(kinds).not.toContain('metric-not-measured')
    expect(kinds).toContain('final-without-snapshot')
    expect(
      wordingOf(traceProblems(read, KNOWN).find((p) => p.kind === 'final-without-snapshot')!)
    ).toBe(
      `${DIR}/a.md is final and cites metric values, but has no Snapshot that keeps them: they read differently with every commit.`
    )
  })

  it('take no key of Object.prototype for a value, and keep every key of a Snapshot', async () => {
    const snapshot = `${DIR}/a.snapshot.yml`
    const read = await reading(
      'date: 2026-11-03',
      'evidence:\n  - metric: name\n    component: constructor\n  - metric: toString\n    component: cart',
      { [snapshot]: 'components:\n  __proto__:\n    files: 1\n  cart:\n    files: 2\n' }
    )
    expect(read.problems).toEqual([])
    const frozen = read.assessments[0]!.snapshot!
    expect(Object.keys(frozen.components)).toEqual(['__proto__', 'cart'])
    expect(metricValueIn(frozen, 'files', { component: '__proto__' })).toBe(1)
    expect(metricValueIn(frozen, 'name', { component: 'constructor' })).toBeUndefined()
    expect(metricValueIn(frozen, 'toString', { component: 'cart' })).toBeUndefined()
    expect(
      traceProblems(read, {})
        .filter((problem) => problem.kind.startsWith('metric'))
        .map((problem) => problem.kind)
    ).toEqual(['metric-not-in-snapshot', 'metric-not-in-snapshot'])
    // Nor do the values now, which the caller hands in as plain objects.
    const now = { components: { cart: { files: 2 } } }
    expect(metricValueIn(now, 'constructor', { component: 'cart' })).toBeUndefined()
    expect(metricValueIn(now, 'files', { component: 'toString' })).toBeUndefined()
    const fs = memoryFileSystem({
      [`${DIR}/a.md`]: assessment('date: 2026-11-03', 'scenarios: [S1]')
    })
    const plan = await planEvidence(
      fs,
      'a',
      'F1',
      { kind: 'metric', metric: 'valueOf', subject: { component: 'cart' } },
      { metrics: now }
    )
    expect(plan.ok ? 'planned' : plan.reason).toBe(
      'the metric valueOf of cart is not there, so a Finding cannot cite it.'
    )
  })

  it('compare two Cycles by their members, and nothing else', async () => {
    const cycle = (members: string): Known => ({
      violations: [{ kind: 'cycle', rule: 'no-cycles', cycle: members.split(' ') }]
    })
    const read = await reading(
      'date: 2026-11-03',
      'evidence:\n  - violation: no-cycles\n    cycle: [cart, web]'
    )
    expect(traceProblems(read, cycle('web cart'))).toEqual([])
    expect(traceProblems(read, cycle('web cart order')).map((p) => p.kind)).toEqual([
      'violation-gone'
    ])
  })
})

describe('the other direction of a Trace', () => {
  it('is computed: which Findings cite an ADR, an Annotation, a Component', async () => {
    const read = await reading('date: 2026-11-03\nscope: [cart]')
    const docs = { log: 'docs/adr', id: '0004-events' }
    // A bare ID that two logs have names neither.
    expect(findingsCiting(read.assessments, { kind: 'adr', adr: docs, adrs: ADRS })).toEqual([])
    expect(
      findingsCiting(read.assessments, { kind: 'adr', adr: docs, adrs: [docs] }).map(
        (found) => found.finding.id
      )
    ).toEqual(['F1'])
    expect(
      findingsCiting(read.assessments, { kind: 'annotation', id: '20261102-gone' })
    ).toHaveLength(1)
    const cart = citingComponent(read, 'cart')
    expect(cart.assessments.map((one) => one.id)).toEqual(['a'])
    expect(cart.findings.map((found) => found.finding.id)).toEqual(['F1'])
    expect(cart.debtItems.map((item) => item.id)).toEqual(['d'])
    expect(citingComponent(read, 'catalog').findings).toHaveLength(1)
    expect(citingComponent(read, 'order')).toEqual({
      assessments: [],
      findings: [],
      risks: [],
      debtItems: []
    })
  })
})
