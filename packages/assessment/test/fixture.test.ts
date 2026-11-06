import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { applyChangeSet, memoryFileSystem, type Plan } from '@adr-tool/kernel'
import {
  assessmentsNaming,
  metricValueOf,
  openAssessments,
  planEvidence,
  snapshotText,
  traceProblems,
  wordingOf,
  type Evidence
} from '../src'
import { inMemory, shopIn } from './repository'

// The Java shop of Structure with an Assessment written by hand (test/fixtures/maven-shop): six
// Quality Scenarios, four Findings that cite a Violation of its Rule, metrics, an Annotation, an
// ADR, Risks and Technical Debt Items, its Snapshot, three Risks and two Items. The done-when of
// part 10 is pinned here.
const root = fileURLToPath(new URL('fixtures/maven-shop/', import.meta.url))
const ID = '20261103-the-shop-before-the-checkout-rewrite'
const PATH = `docs/architecture/assessments/${ID}.md`
const PAGE = 'web/src/main/java/com/shop/web/Page.java'

describe('the Assessment of the shop', () => {
  it('reads without a Problem into Scenarios, Findings, a Snapshot, Risks and Technical Debt Items', async () => {
    const shop = await shopIn(await inMemory(root))
    const reading = await openAssessments(shop.fs)
    expect(reading.problems).toEqual([])
    expect(traceProblems(reading, shop.known)).toEqual([])

    const [assessment, ...others] = reading.assessments
    expect(others).toEqual([])
    expect(assessment).toMatchObject({
      id: ID,
      path: PATH,
      title: 'The shop before the checkout rewrite',
      date: '2026-11-03',
      status: 'draft',
      authors: ['Aylin Demir', 'Lena Becker'],
      scope: ['cart', 'catalog', 'web'],
      writable: true
    })
    expect(
      assessment!.scenarios.map((scenario) => [
        scenario.id,
        scenario.attribute?.characteristic,
        scenario.attribute?.subCharacteristic,
        scenario.importance,
        scenario.difficulty,
        scenario.rating
      ])
    ).toEqual([
      ['S1', 'performance-efficiency', 'time-behaviour', 'H', 'M', 'partly-met'],
      ['S2', 'maintainability', 'modifiability', 'H', 'L', 'not-met'],
      ['S3', 'maintainability', 'modularity', 'M', 'L', 'met'],
      ['S4', 'maintainability', 'testability', 'M', 'M', 'partly-met'],
      ['S5', 'reliability', 'fault-tolerance', 'L', 'H', undefined],
      ['S6', 'security', 'integrity', 'H', 'L', 'met']
    ])
    expect(assessment!.scenarios[0]).toMatchObject({
      title: 'The total of a large cart shows at once',
      level: 3,
      source: 'A customer',
      stimulus: 'adds a product to a cart of 200 lines',
      artifact: 'cart',
      environment: 'normal operation, at the Christmas peak',
      response: 'the cart shows its new total',
      measure: 'within 100 ms',
      text: 'The total is computed on every call, over every line. At 200 lines that is still fast enough;\nat the peak it is not known.'
    })

    const [f1, f2, f3, f4] = assessment!.findings
    expect(assessment!.findings.map((finding) => [finding.id, finding.scenarios])).toEqual([
      ['F1', ['S2', 'S4']],
      ['F2', ['S3', 'S6']],
      ['F3', ['S3']],
      ['F4', ['S1']]
    ])
    expect(f1!.evidence).toEqual([
      {
        kind: 'violation',
        violation: { kind: 'dependency', rule: 'web-through-cart', from: 'web', to: 'catalog' },
        line: 130
      },
      { kind: 'annotation', id: '20261102-the-page-searches-the-catalog-itself', line: 133 },
      { kind: 'adr', id: '0001-the-web-shows-the-catalog-through-the-cart', line: 134 },
      { kind: 'risk', id: '20261103-a-change-to-the-search-breaks-the-page', line: 135 }
    ])
    expect(f2!.evidence.map((evidence) => evidence.kind)).toEqual(['metric', 'metric'])
    expect(f3!.evidence.map((evidence) => evidence.kind)).toEqual(['debt', 'risk', 'metric'])
    expect(f4!.evidence.at(-1)).toMatchObject({
      kind: 'metric',
      metric: 'complexity',
      subject: { file: 'cart/src/main/java/com/shop/cart/Cart.java', name: 'Cart.total()' }
    })
    expect(f4!.text).toBe(
      'Fast enough today, and as simple as a function gets: one way through it. Kept as a debt until\nthe rewrite keeps the total with the lines.'
    )

    // The Snapshot beside it freezes what Structure measures now, as the suite writes it.
    const snapshot = assessment!.snapshot!
    expect(snapshot).toMatchObject({
      commit: '3f2a9c0e8b1d4f6a7c5e2b9d0f1a3c4e5b6d7f8a',
      date: '2026-11-03'
    })
    expect(snapshot.components).toEqual(shop.values!.components)
    expect(snapshot.sourceFiles).toEqual(shop.values!.sourceFiles)
    expect(snapshot.components['cart']).toMatchObject({ instability: 0.5, 'fan-in': 1 })
    expect(snapshot.components['catalog']).toMatchObject({ instability: 0, 'fan-in': 2 })
    // What part 13 measures is frozen with the rest: abstractness and distance of a Component,
    // propagation cost of a level — `/` the top level —, complexity of a function, LCOM4 of a class.
    expect(snapshot.components['catalog']).toMatchObject({
      abstractness: 1 / 3,
      distance: 0.666666666667,
      'propagation-cost': 0.5
    })
    expect(snapshot.components['/']).toEqual({ 'propagation-cost': 0.5 })
    const cart = 'cart/src/main/java/com/shop/cart/Cart.java'
    expect(snapshot.sourceFiles[cart]).toEqual({
      'Cart.add(Product)': { complexity: 1 },
      'Cart.total()': { complexity: 1 },
      'Cart.discount(long)': { complexity: 5 },
      Cart: { lcom4: 1 }
    })
    // Test files are left out, as from every metric.
    expect(Object.keys(snapshot.sourceFiles).filter((file) => file.includes('/test/'))).toEqual([])
    expect(await shop.fs.readText(snapshot.path)).toBe(
      snapshotText(
        ID,
        { commit: snapshot.commit!, date: snapshot.date!, values: shop.values! },
        '\n'
      )
    )

    expect(reading.risks.map((risk) => [risk.id, risk.state, risk.components])).toEqual([
      ['20261103-a-change-to-the-search-breaks-the-page', 'open', ['web', 'catalog']],
      ['20261103-a-large-cart-is-slow-at-the-peak', 'open', ['cart']],
      ['20261103-the-two-utils-get-mixed-up', 'accepted', ['cart', 'web']]
    ])
    expect(reading.risks[0]).toMatchObject({
      title: 'A change to the search breaks the page',
      owner: 'Lena Becker',
      date: '2026-11-03'
    })
    expect(reading.debtItems.map((item) => [item.id, item.state, item.changed])).toEqual([
      ['20261103-the-total-is-computed-on-every-call', 'scheduled', '2026-11-03'],
      ['20261103-two-classes-util-in-one-package', 'open', undefined]
    ])
    // Which Assessments name a Risk is computed, never stored.
    for (const risk of reading.risks) {
      expect(assessmentsNaming(reading.assessments, 'risk', risk.id)).toEqual([assessment])
    }
  })

  it('reports the Violation a Finding cites once the code no longer has it, and reads its Snapshot the same', async () => {
    const files = await inMemory(root)
    const before = await shopIn(files)
    const fanIn = (await openAssessments(before.fs)).assessments[0]!.findings[1]!.evidence[1]!

    // The page asks the cart, as ADR-0001 says: it no longer uses Search.
    const page = files[PAGE]!
    const changed = {
      ...files,
      [PAGE]: page
        .replace('import com.shop.catalog.Search;\n', '')
        .replace('  private final Search search;\n', '')
        .replace('Page(Search search)', 'Page()')
        .replace('    this.search = search;\n', '')
    }
    expect(changed[PAGE]).not.toContain('Search')
    const after = await shopIn(changed)
    expect(after.known.violations).toEqual([])
    const reading = await openAssessments(after.fs)
    const [assessment] = reading.assessments

    const problems = traceProblems(reading, after.known)
    expect(problems).toEqual([
      {
        kind: 'violation-gone',
        path: PATH,
        assessment: ID,
        finding: 'F1',
        line: 130,
        violation: { kind: 'dependency', rule: 'web-through-cart', from: 'web', to: 'catalog' }
      }
    ])
    expect(wordingOf(problems[0]!)).toBe(
      `${PATH}: F1 cites the Violation web-through-cart: web -> catalog, which the code no longer has. Look at the Finding again: it may be resolved.`
    )

    // The Snapshot is what it was, and so is what a Finding reads from it, though the code moved on.
    expect(assessment!.snapshot).toEqual(
      (await openAssessments(before.fs)).assessments[0]!.snapshot
    )
    expect(after.values!.components['catalog']!['fan-in']).toBe(1)
    const metric = fanIn as Extract<Evidence, { kind: 'metric' }>
    expect(metric).toMatchObject({ metric: 'fan-in', subject: { component: 'catalog' } })
    expect(metricValueOf(assessment!, metric, after.values)).toEqual({ value: 2, frozen: true })
    // Without the Snapshot, a draft reads the value of the code now.
    const unfrozen = { ...assessment!, snapshot: undefined }
    expect(metricValueOf(unfrozen, metric, after.values)).toEqual({ value: 1, frozen: false })
  })

  it('takes metric evidence by what its Snapshot holds, however the code moved on', async () => {
    const files = await inMemory(root)
    const snapshot = PATH.replace(/\.md$/, '.snapshot.yml')
    const unfrozen = Object.fromEntries(Object.entries(files).filter(([path]) => path !== snapshot))
    const catalog = { kind: 'metric', metric: 'files', subject: { component: 'catalog' } } as const
    const cost = {
      kind: 'metric',
      metric: 'propagation-cost',
      subject: { component: 'web' }
    } as const
    // The code now has no files of the catalog, and a propagation cost below the web.
    const now = { metrics: { components: { web: { 'propagation-cost': 0.4 } } } }
    const outcome = (plan: Plan): string => (plan.ok ? 'planned' : plan.reason)

    // The Snapshot holds the files of the catalog, and no propagation cost below the web.
    const fs = memoryFileSystem(files)
    const taken = await planEvidence(fs, ID, 'F3', catalog, now)
    expect(outcome(taken)).toBe('planned')
    expect(outcome(await planEvidence(fs, ID, 'F3', cost, now))).toBe(
      'the metric propagation-cost of web is not there, so a Finding cannot cite it.'
    )
    if (taken.ok) await applyChangeSet(fs, taken.changeSet)
    expect(traceProblems(await openAssessments(fs), now)).toEqual([])

    // Without the Snapshot, the values now are what a draft cites.
    const draft = memoryFileSystem(unfrozen)
    expect(outcome(await planEvidence(draft, ID, 'F3', catalog, now))).toBe(
      'the metric files of catalog is not there, so a Finding cannot cite it.'
    )
    expect(outcome(await planEvidence(draft, ID, 'F3', cost, now))).toBe('planned')

    // A Snapshot that cannot be read is a Problem of its own: nothing is checked against it.
    const broken = memoryFileSystem({ ...files, [snapshot]: 'components: [\n' })
    expect(outcome(await planEvidence(broken, ID, 'F3', cost, now))).toBe('planned')
  })

  it('reports nothing of the Violation once the Assessment is final: it is a record of its day', async () => {
    const files = await inMemory(root)
    const text = files[PATH]!.replace('status: draft', 'status: final')
    const after = await shopIn({
      ...files,
      [PATH]: text,
      [PAGE]: files[PAGE]!.replace('import com.shop.catalog.Search;\n', '')
    })
    expect(after.known.violations).toEqual([])
    const reading = await openAssessments(after.fs)
    expect(reading.problems).toEqual([])
    expect(traceProblems(reading, after.known)).toEqual([])
  })
})
