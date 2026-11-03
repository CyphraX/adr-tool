import { describe, expect, it } from 'vitest'
import {
  applyChangeSet,
  memoryFileSystem,
  memoryGit,
  type Plan,
  type WritableFileSystem
} from '@adr-tool/kernel'
import {
  openAssessments,
  planAssessment,
  planAssessmentFromLast,
  planDebtItem,
  planEvidence,
  planFinding,
  planFinish,
  planRating,
  planRisk,
  planScenario,
  planSnapshot,
  planState,
  readAssessment,
  type NewScenario
} from '../src'

const DIR = 'docs/architecture/assessments'
const PATH = `${DIR}/20261103-the-shop.md`
const sha = (n: number): string => n.toString(16).padStart(40, '0')

/** An Assessment as a person writes one: entries at level 4, prose around them, a key of others. */
const SHOP = [
  '---',
  'date: 2026-11-03 # the day we met',
  "authors: ['Aylin Demir']",
  'nav_order: 2',
  '---',
  '',
  '# The shop',
  '',
  'What we looked at.',
  '',
  '### Szenarien',
  '',
  '#### Fast totals',
  '',
  '```yaml',
  'scenario: S1',
  'attribute: performance-efficiency',
  'stimulus: adds a product',
  'response: the total',
  'measure: within 100 ms # at the peak',
  'importance: H',
  '```',
  '',
  'Why it is rated so.',
  '',
  '### Befunde',
  '',
  '#### The web reaches past the cart',
  '',
  '```yaml',
  'finding: F1',
  'scenarios: [S1]',
  'evidence:',
  '  - annotation: 20261102-there',
  '```',
  '',
  'The page searches the catalog itself.',
  '',
  '## Appendix',
  '',
  'Notes.',
  ''
].join('\n')

async function applied(fs: WritableFileSystem, plan: Plan): Promise<WritableFileSystem> {
  if (!plan.ok) throw new Error(plan.reason)
  await applyChangeSet(fs, plan.changeSet)
  return fs
}

/** The text after a plan, with what stands between `before` and its end the same. */
async function textAfter(plan: Plan, path = PATH): Promise<string> {
  if (!plan.ok) throw new Error(plan.reason)
  const file = plan.changeSet.files.find((one) => one.path === path)
  if (!file) throw new Error(`${path} is not changed`)
  return file.after
}

/**
 * What a plan inserts into a text right after `anchor`, where nothing else changes: every byte
 * before and after the insertion is the same (ADR-0002).
 */
function inserted(before: string, after: string, anchor: string): string {
  expect(before.split(anchor)).toHaveLength(2)
  const at = before.indexOf(anchor) + anchor.length
  expect(after.startsWith(before.slice(0, at))).toBe(true)
  expect(after.endsWith(before.slice(at))).toBe(true)
  return after.slice(at, after.length - (before.length - at))
}

const refused = (plan: Plan): string => {
  if (plan.ok) throw new Error('was planned')
  return plan.reason
}

const SCENARIO: NewScenario = {
  title: 'The catalog changes how it searches',
  attribute: 'maintainability/modifiability',
  source: 'The team of the catalog',
  stimulus: 'changes how Search finds a product',
  response: 'the change is made in the catalog alone',
  measure: 'no file outside catalog/ changes',
  importance: 'H',
  difficulty: 'L',
  text: 'Page uses Search itself.'
}

describe('a new Assessment', () => {
  it('is a file of its own, its ID the day and a slug of its title', async () => {
    const fs = memoryFileSystem({})
    const plan = await planAssessment(
      fs,
      {
        title: 'The shop before the checkout rewrite',
        date: '2026-11-03',
        authors: ['Aylin Demir', ' ', 'Lena Becker'],
        scope: ['cart', 'web']
      },
      ['cart', 'catalog', 'web']
    )
    expect(plan).toMatchObject({ ok: true, id: '20261103-the-shop-before-the-checkout-rewrite' })
    expect(await textAfter(plan, `${DIR}/20261103-the-shop-before-the-checkout-rewrite.md`)).toBe(
      [
        '---',
        'date: 2026-11-03',
        'status: draft',
        'authors: [Aylin Demir, Lena Becker]',
        'scope: [cart, web]',
        '---',
        '',
        '# The shop before the checkout rewrite',
        ''
      ].join('\n')
    )
  })

  it('takes a free ID, and the line ending most files of its directory have', async () => {
    const fs = memoryFileSystem({
      [`${DIR}/20261103-the-shop.md`]: '---\r\ndate: 2026-11-03\r\n---\r\n',
      [`${DIR}/20261103-the-shop-2.snapshot.yml`]: 'components: {}\r\n'
    })
    const plan = await planAssessment(fs, {
      title: 'The shop',
      date: '2026-11-03',
      authors: ['Aylin'],
      previous: '20261103-the-shop'
    })
    expect(plan).toMatchObject({ ok: true, id: '20261103-the-shop-3' })
    expect(await textAfter(plan, `${DIR}/20261103-the-shop-3.md`)).toBe(
      '---\r\ndate: 2026-11-03\r\nstatus: draft\r\nauthors: [Aylin]\r\nprevious: 20261103-the-shop\r\n---\r\n\r\n# The shop\r\n'
    )
  })

  it('is refused without what it needs', async () => {
    const fs = memoryFileSystem({})
    const plan = (
      title: string,
      date: string,
      authors: string[],
      scope?: string[],
      declared?: string[]
    ) =>
      planAssessment(fs, { title, date, authors, ...(scope && { scope }) }, declared).then(refused)
    expect(await plan('!!!', '2026-11-03', ['A'])).toBe(
      'The title "!!!" leaves no name for the file: it needs a letter or a digit.'
    )
    expect(await plan('A', '3 November', ['A'])).toBe(
      '"3 November" is not a date of the form YYYY-MM-DD.'
    )
    expect(await plan('A', '2026-11-03', [' '])).toBe('An Assessment needs the name of an author.')
    expect(await plan('A', '2026-11-03', ['A'], ['cart'])).toBe(
      "Components can be named only once they are declared: the Draft's IDs are no names to write down."
    )
    expect(await plan('A', '2026-11-03', ['A'], ['order'], ['cart'])).toBe(
      'order is not a declared Component.'
    )
    expect(
      refused(
        await planAssessment(fs, { title: 'A', date: '2026-11-03', authors: ['A'], previous: 'x' })
      )
    ).toBe('There is no Assessment x.')
  })

  it('from the last one follows it, with its scope and its Scenarios unrated', async () => {
    const last = SHOP.replace('nav_order: 2', 'scope: [cart, web]').replace(
      'importance: H\n',
      'importance: H\nrating: met # for now\n'
    )
    const fs = memoryFileSystem({
      [PATH]: last,
      [`${DIR}/20260512-earlier.md`]: '---\ndate: 2026-05-12\n---\n',
      [`${DIR}/undated.md`]: '# No date\n'
    })
    const plan = await planAssessmentFromLast(fs, {
      title: 'The shop again',
      date: '2027-05-03',
      authors: ['Lena Becker']
    })
    expect(plan).toMatchObject({
      ok: true,
      id: '20270503-the-shop-again',
      previous: '20261103-the-shop'
    })
    expect(await textAfter(plan, `${DIR}/20270503-the-shop-again.md`)).toBe(
      [
        '---',
        'date: 2027-05-03',
        'status: draft',
        'authors: [Lena Becker]',
        'scope: [cart, web]',
        'previous: 20261103-the-shop',
        '---',
        '',
        '# The shop again',
        '',
        '## Quality Scenarios',
        '',
        '### Fast totals',
        '',
        '```yaml',
        'scenario: S1',
        'attribute: performance-efficiency',
        'stimulus: adds a product',
        'response: the total',
        'measure: within 100 ms # at the peak',
        'importance: H',
        '```',
        ''
      ].join('\n')
    )
    expect(
      refused(
        await planAssessmentFromLast(memoryFileSystem({ [`${DIR}/x.md`]: '# x\n' }), {
          title: 'A',
          date: '2026-11-03',
          authors: ['A']
        })
      )
    ).toBe('There is no Assessment with a date that a new one could follow.')
  })
})

describe('the entries of an Assessment', () => {
  it('take a new Scenario after the last one, at its level, with its text', async () => {
    const fs = memoryFileSystem({ [PATH]: SHOP })
    const plan = await planScenario(fs, '20261103-the-shop', SCENARIO)
    expect(plan).toMatchObject({ ok: true, id: 'S2' })
    expect(inserted(SHOP, await textAfter(plan), 'Why it is rated so.\n')).toBe(
      [
        '',
        '#### The catalog changes how it searches',
        '',
        '```yaml',
        'scenario: S2',
        'attribute: maintainability/modifiability',
        'source: The team of the catalog',
        'stimulus: changes how Search finds a product',
        'response: the change is made in the catalog alone',
        'measure: no file outside catalog/ changes',
        'importance: H',
        'difficulty: L',
        '```',
        '',
        'Page uses Search itself.',
        ''
      ].join('\n')
    )
    const read = readAssessment('20261103-the-shop', PATH, await textAfter(plan))
    expect(read.problems).toEqual([])
    expect(read.assessment.scenarios.map((scenario) => scenario.id)).toEqual(['S1', 'S2'])
  })

  it('take the first Scenario before the section of the Findings, and the first Finding at the end', async () => {
    const text = [
      '---',
      'date: 2026-11-03',
      '---',
      '',
      '# A',
      '',
      '## Findings',
      '',
      '### One',
      '',
      '```yaml',
      'finding: F1',
      '```',
      ''
    ].join('\n')
    const scenario = await planScenario(memoryFileSystem({ [PATH]: text }), '20261103-the-shop', {
      ...SCENARIO,
      id: 'checkout-latency',
      text: ''
    })
    expect(inserted(text, await textAfter(scenario), '# A\n\n')).toBe(
      [
        '## Quality Scenarios',
        '',
        '### The catalog changes how it searches',
        '',
        '```yaml',
        'scenario: checkout-latency',
        'attribute: maintainability/modifiability',
        'source: The team of the catalog',
        'stimulus: changes how Search finds a product',
        'response: the change is made in the catalog alone',
        'measure: no file outside catalog/ changes',
        'importance: H',
        'difficulty: L',
        '```',
        '',
        ''
      ].join('\n')
    )
    const bare = '---\ndate: 2026-11-03\n---\n\n# A\n\nNothing yet.'
    const finding = await planFinding(memoryFileSystem({ [PATH]: bare }), '20261103-the-shop', {
      title: 'The web reaches past the cart #',
      evidence: [{ kind: 'adr', id: '0001-x' }]
    })
    expect(finding).toMatchObject({ ok: true, id: 'F1' })
    expect(await textAfter(finding)).toBe(
      `${bare}\n\n## Findings\n\n### The web reaches past the cart # #\n\n\`\`\`yaml\nfinding: F1\nevidence:\n  - adr: 0001-x\n\`\`\`\n`
    )
    const read = readAssessment('x', PATH, await textAfter(finding))
    expect(read.assessment.findings[0]!.title).toBe('The web reaches past the cart #')
  })

  it('take the first Scenario before the outermost section of the Findings, never inside it', async () => {
    const text = [
      '---',
      'date: 2026-11-03',
      '---',
      '',
      '# A',
      '',
      '## Findings',
      '',
      '### About the web',
      '',
      '#### F one',
      '',
      '```yaml',
      'finding: F1',
      '```',
      ''
    ].join('\n')
    const plan = await planScenario(memoryFileSystem({ [PATH]: text }), '20261103-the-shop', {
      ...SCENARIO,
      text: ''
    })
    const added = inserted(text, await textAfter(plan), '# A\n\n')
    expect(
      added.startsWith('## Quality Scenarios\n\n### The catalog changes how it searches\n')
    ).toBe(true)
    const read = readAssessment('x', PATH, await textAfter(plan))
    expect(read.assessment.scenarios.map((one) => one.id)).toEqual(['S1'])
    expect(read.assessment.findings.map((one) => one.id)).toEqual(['F1'])
  })

  it('take a blank line after a frontmatter that is all there is', async () => {
    const text = '---\ndate: 2026-11-03\n---\n'
    const plan = await planScenario(memoryFileSystem({ [PATH]: text }), '20261103-the-shop', {
      ...SCENARIO,
      text: ''
    })
    expect((await textAfter(plan)).startsWith(`${text}\n## Quality Scenarios\n\n### `)).toBe(true)
  })

  it('take a new Finding after the last one, with its Scenarios and its evidence', async () => {
    const fs = memoryFileSystem({
      [PATH]: SHOP,
      'docs/architecture/risks/r.md': '# R\n'
    })
    const plan = await planFinding(
      fs,
      '20261103-the-shop',
      {
        title: 'Two Utils',
        scenarios: ['S1'],
        evidence: [
          {
            kind: 'violation',
            violation: { kind: 'dependency', rule: 'r', from: 'web', to: 'catalog' }
          },
          { kind: 'metric', metric: 'propagation-cost', subject: { component: '*' } },
          { kind: 'risk', id: 'r' }
        ],
        text: 'Nothing tells\r\nthem apart.'
      },
      { violations: [{ kind: 'dependency', rule: 'r', from: 'web', to: 'catalog' }] }
    )
    expect(plan).toMatchObject({ ok: true, id: 'F2' })
    expect(inserted(SHOP, await textAfter(plan), 'The page searches the catalog itself.\n')).toBe(
      [
        '',
        '#### Two Utils',
        '',
        '```yaml',
        'finding: F2',
        'scenarios: [S1]',
        'evidence:',
        '  - violation: r',
        '    from: web',
        '    to: catalog',
        '  - metric: propagation-cost',
        '    component: "*"',
        '  - risk: r',
        '```',
        '',
        'Nothing tells',
        'them apart.',
        ''
      ].join('\n')
    )
    const read = readAssessment('x', PATH, await textAfter(plan))
    expect(read.problems).toEqual([])
    expect(read.assessment.findings[1]!.evidence.map((one) => one.kind)).toEqual([
      'violation',
      'metric',
      'risk'
    ])
  })

  it('take a text and a title of any length in linear time', async () => {
    const fs = memoryFileSystem({ [PATH]: SHOP })
    const started = performance.now()
    const plan = await planScenario(fs, '20261103-the-shop', {
      ...SCENARIO,
      title: `${'#'.repeat(80_000)}x ##`,
      text: `a${'\n'.repeat(80_000)}b`
    })
    expect(performance.now() - started).toBeLessThan(2000)
    const added = inserted(SHOP, await textAfter(plan), 'Why it is rated so.\n')
    expect(added.startsWith(`\n#### ${'#'.repeat(80_000)}x ## #\n`)).toBe(true)
    expect(added.endsWith(`a${'\n'.repeat(80_000)}b\n`)).toBe(true)
  })

  it('are refused where they would not read back as given', async () => {
    const fs = memoryFileSystem({ [PATH]: SHOP })
    const scenario = (changes: Partial<NewScenario>) =>
      planScenario(fs, '20261103-the-shop', { ...SCENARIO, ...changes }).then(refused)
    expect(await scenario({ measure: ' ' })).toBe('A Quality Scenario needs a "measure".')
    expect(await scenario({ attribute: 'speed' })).toBe(
      '"speed" is no characteristic of ISO/IEC 25010, nor one of its sub-characteristics.'
    )
    expect(await scenario({ importance: 'X' as 'H' })).toBe('"X" is none of H, M and L.')
    expect(await scenario({ id: 'S1' })).toBe('20261103-the-shop has an entry S1 already.')
    expect(await scenario({ id: 'S 2' })).toBe(
      '"S 2" is no ID of an entry: letters, digits, ".", "_" and "-", beginning with a letter or a digit.'
    )
    expect(await scenario({ title: '  ' })).toBe('An entry needs a title, which is its heading.')

    const finding = (
      evidence: Parameters<typeof planFinding>[2]['evidence'],
      scenarios?: string[]
    ) =>
      planFinding(
        fs,
        '20261103-the-shop',
        { title: 'F', evidence, ...(scenarios && { scenarios }) },
        { annotations: ['20261102-there'], metrics: { components: { cart: { instability: 1 } } } }
      ).then(refused)
    expect(await finding([], ['S9'])).toBe('20261103-the-shop has no Quality Scenario S9.')
    expect(await finding([{ kind: 'annotation', id: '20261102-gone' }])).toBe(
      'the Annotation 20261102-gone is not there, so a Finding cannot cite it.'
    )
    expect(await finding([{ kind: 'risk', id: 'gone' }])).toBe(
      'the Risk gone is not there, so a Finding cannot cite it.'
    )
    expect(
      await finding([{ kind: 'metric', metric: 'instability', subject: { component: 'web' } }])
    ).toBe('the metric instability of web is not there, so a Finding cannot cite it.')
    expect(
      await finding([
        { kind: 'annotation', id: '20261102-there' },
        { kind: 'annotation', id: '20261102-there' }
      ])
    ).toBe('F2 cites the Annotation 20261102-there already.')
    expect(
      await finding([{ kind: 'violation', violation: { kind: 'cycle', rule: 'c', cycle: ['a'] } }])
    ).toBe('The evidence is not complete: the Violation needs every key its kind names.')

    expect(refused(await planScenario(fs, 'gone', SCENARIO))).toBe('There is no Assessment gone.')
    const final = memoryFileSystem({ [PATH]: SHOP.replace('nav_order: 2', 'status: final') })
    expect(refused(await planScenario(final, '20261103-the-shop', SCENARIO))).toBe(
      '20261103-the-shop is final: its record is complete. A person may still change it in an editor.'
    )
    const open = memoryFileSystem({ [PATH]: '---\ndate: 2026-11-03\n' })
    expect(refused(await planScenario(open, '20261103-the-shop', SCENARIO))).toBe(
      `${PATH} cannot be read. A person has to fix it before the suite writes into it.`
    )
  })
})

describe('a rating', () => {
  it('is written where it stands, inserted in the order of the format, or taken out', async () => {
    const fs = memoryFileSystem({ [PATH]: SHOP })
    const rated = await textAfter(await planRating(fs, '20261103-the-shop', 'S1', 'partly-met'))
    expect(inserted(SHOP, rated, 'importance: H\n')).toBe('rating: partly-met\n')
    expect(rated).toContain('importance: H\nrating: partly-met\n```')

    await applied(fs, await planRating(fs, '20261103-the-shop', 'S1', 'partly-met'))
    const again = await textAfter(await planRating(fs, '20261103-the-shop', 'S1', 'not-met'))
    expect(again).toBe(rated.replace('rating: partly-met', 'rating: not-met'))
    expect(await textAfter(await planRating(fs, '20261103-the-shop', 'S1', undefined))).toBe(SHOP)

    expect(refused(await planRating(fs, '20261103-the-shop', 'S1', 'partly-met'))).toBe(
      'S1 is rated so already: there is nothing to change.'
    )
    expect(refused(await planRating(fs, '20261103-the-shop', 'S9', 'met'))).toBe(
      '20261103-the-shop has no Quality Scenario S9.'
    )
    expect(refused(await planRating(fs, '20261103-the-shop', 'S1', 'good' as 'met'))).toBe(
      '"good" is none of met, partly-met and not-met.'
    )
  })

  it('is refused where the block is written in a way a splice cannot serve', async () => {
    const text = SHOP.replace(
      /scenario: S1\n[^`]*```/,
      '{scenario: S1, attribute: usability, stimulus: a, response: b, measure: c}\n```'
    )
    const fs = memoryFileSystem({ [PATH]: text })
    expect(refused(await planRating(fs, '20261103-the-shop', 'S1', 'met'))).toBe(
      `"rating" of ${PATH} is written in a way the suite cannot change where it stands. Change it in an editor.`
    )
  })
})

describe('evidence', () => {
  it('is appended to the Finding, in block style', async () => {
    const fs = memoryFileSystem({ [PATH]: SHOP })
    const plan = await planEvidence(fs, '20261103-the-shop', 'F1', {
      kind: 'violation',
      violation: { kind: 'cycle', rule: 'no-cycles', cycle: ['cart', 'web'] }
    })
    expect(inserted(SHOP, await textAfter(plan), '  - annotation: 20261102-there\n')).toBe(
      '  - violation: no-cycles\n    cycle: [cart, web]\n'
    )
    expect(
      refused(
        await planEvidence(fs, '20261103-the-shop', 'F1', {
          kind: 'annotation',
          id: '20261102-there'
        })
      )
    ).toBe('F1 cites the Annotation 20261102-there already.')
  })

  it('gets its key where the Finding has none', async () => {
    const text = SHOP.replace('evidence:\n  - annotation: 20261102-there\n', '')
    const fs = memoryFileSystem({ [PATH]: text })
    const plan = await planEvidence(fs, '20261103-the-shop', 'F1', {
      kind: 'metric',
      metric: 'complexity',
      subject: { file: 'cart/Cart.java', name: 'Cart.total()' }
    })
    expect(inserted(text, await textAfter(plan), 'scenarios: [S1]\n')).toBe(
      'evidence:\n  - metric: complexity\n    file: cart/Cart.java\n    name: Cart.total()\n'
    )
  })
})

describe('a Snapshot', () => {
  const values = {
    components: { web: { files: 3, instability: 1 }, cart: { instability: 0.5, files: 2 } }
  }

  it('is written beside the Assessment as a whole, with the commit HEAD points at', async () => {
    const fs = memoryFileSystem({ [PATH]: SHOP })
    const git = memoryGit({ commits: [{ commit: sha(7), files: {} }] })
    const plan = await planSnapshot(fs, git, '20261103-the-shop', { date: '2026-11-03', values })
    const text = [
      '# The Snapshot of 20261103-the-shop, taken by the suite: the metric values when it was taken.',
      `commit: ${sha(7)}`,
      'date: 2026-11-03',
      'components:',
      '  cart:',
      '    files: 2',
      '    instability: 0.5',
      '  web:',
      '    files: 3',
      '    instability: 1',
      ''
    ].join('\n')
    expect(await textAfter(plan, `${DIR}/20261103-the-shop.snapshot.yml`)).toBe(text)
    await applied(fs, plan)
    const reading = await openAssessments(fs)
    expect(reading.problems).toEqual([])
    expect(reading.assessments[0]!.snapshot?.components).toEqual(values.components)

    // Taken again, it is written anew.
    const none = memoryGit({ commits: [] })
    const again = await planSnapshot(fs, none, '20261103-the-shop', {
      date: '2026-11-04',
      values: { components: { cart: { files: 3 } } }
    })
    expect(await textAfter(again, `${DIR}/20261103-the-shop.snapshot.yml`)).toBe(
      [
        '# The Snapshot of 20261103-the-shop, taken by the suite: the metric values when it was taken.',
        'date: 2026-11-04',
        'components:',
        '  cart:',
        '    files: 3',
        ''
      ].join('\n')
    )
  })

  it('is refused on a Draft and in a final Assessment', async () => {
    const git = memoryGit({ commits: [] })
    const fs = memoryFileSystem({ [PATH]: SHOP })
    expect(
      refused(
        await planSnapshot(fs, git, '20261103-the-shop', { date: '2026-11-03', values: undefined })
      )
    ).toBe(
      'There are no metric values to freeze: the Components have to be declared, and to hold Source Files.'
    )
    const final = memoryFileSystem({ [PATH]: SHOP.replace('nav_order: 2', 'status: final') })
    expect(
      refused(await planSnapshot(final, git, '20261103-the-shop', { date: '2026-11-03', values }))
    ).toBe(
      '20261103-the-shop is final: its record is complete. A person may still change it in an editor.'
    )
  })
})

describe('Finish', () => {
  it('writes status: final in the order of the format, and only once', async () => {
    const fs = memoryFileSystem({ [PATH]: SHOP })
    const plan = await planFinish(fs, '20261103-the-shop')
    expect(inserted(SHOP, await textAfter(plan), '# the day we met\n')).toBe('status: final\n')
    expect(await textAfter(plan)).toContain('date: 2026-11-03 # the day we met\nstatus: final\n')
    await applied(fs, plan)
    expect(refused(await planFinish(fs, '20261103-the-shop'))).toBe(
      '20261103-the-shop is final already.'
    )

    const draft = memoryFileSystem({ [PATH]: SHOP.replace('nav_order: 2', "status: 'draft'") })
    expect(await textAfter(await planFinish(draft, '20261103-the-shop'))).toContain(
      "status: 'final'"
    )
    const bare = memoryFileSystem({ [PATH]: '# A\n' })
    expect(await textAfter(await planFinish(bare, '20261103-the-shop'))).toBe(
      '---\nstatus: final\n---\n\n# A\n'
    )
  })
})

describe('the registers', () => {
  it('take a Risk and a Technical Debt Item, each a file of its own', async () => {
    const fs = memoryFileSystem({})
    const risk = await planRisk(
      fs,
      {
        title: 'A change to the search breaks the page',
        date: '2026-11-03',
        owner: 'Lena Becker',
        components: ['web', 'catalog'],
        description: '`Page` uses `Search` itself.'
      },
      ['cart', 'catalog', 'web']
    )
    expect(risk).toMatchObject({ ok: true, id: '20261103-a-change-to-the-search-breaks-the-page' })
    expect(
      await textAfter(
        risk,
        'docs/architecture/risks/20261103-a-change-to-the-search-breaks-the-page.md'
      )
    ).toBe(
      [
        '---',
        'state: open',
        'date: 2026-11-03',
        'owner: Lena Becker',
        'components: [web, catalog]',
        '---',
        '',
        '# A change to the search breaks the page',
        '',
        '`Page` uses `Search` itself.',
        ''
      ].join('\n')
    )
    const item = await planDebtItem(fs, { title: 'Two classes Util', date: '2026-11-03' })
    expect(await textAfter(item, 'docs/architecture/debt/20261103-two-classes-util.md')).toBe(
      '---\nstate: open\ndate: 2026-11-03\n---\n\n# Two classes Util\n'
    )
  })

  it('change the state and the day it changed, where they stand', async () => {
    const path = 'docs/architecture/risks/r.md'
    const text = '---\nstate: open # for now\ndate: 2026-11-03\nowner: Lena\n---\n\n# R\n'
    const fs = memoryFileSystem({ [path]: text })
    const plan = await planState(fs, 'risks', 'r', 'mitigated', '2026-11-04')
    expect(await textAfter(plan, path)).toBe(
      '---\nstate: mitigated # for now\ndate: 2026-11-03\nchanged: 2026-11-04\nowner: Lena\n---\n\n# R\n'
    )
    await applied(fs, plan)
    expect(refused(await planState(fs, 'risks', 'r', 'mitigated', '2026-11-05'))).toBe(
      'r is mitigated already.'
    )
    expect(refused(await planState(fs, 'risks', 'r', 'paid-off', '2026-11-05'))).toBe(
      '"paid-off" is no state of a Risk: open, mitigated, accepted or closed.'
    )
    expect(refused(await planState(fs, 'debt', 'r', 'scheduled', '2026-11-05'))).toBe(
      'There is no Technical Debt Item r.'
    )
    const bare = memoryFileSystem({ 'docs/architecture/debt/d.md': '# D\n' })
    expect(
      await textAfter(
        await planState(bare, 'debt', 'd', 'paid-off', '2026-11-04'),
        'docs/architecture/debt/d.md'
      )
    ).toBe('---\nstate: paid-off\nchanged: 2026-11-04\n---\n\n# D\n')
  })

  it('are refused while their directory cannot be used', async () => {
    const fs = memoryFileSystem({ '.arch/config.yml': 'risks: true\n' })
    expect(refused(await planRisk(fs, { title: 'R', date: '2026-11-03' }))).toBe(
      'No Risk can be written: "risks" in .arch/config.yml must be a relative path inside the repository. No Risk is read until it is fixed.'
    )
  })
})
