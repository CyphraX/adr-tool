import { describe, expect, it } from 'vitest'
import { memoryFileSystem, type Plan } from '@adr-tool/kernel'
import { openAssessments, planRenameInAssessments, planRepair, traceProblems } from '../src'

const DIR = 'docs/architecture/assessments'
const PATH = `${DIR}/a.md`
const SNAPSHOT = `${DIR}/a.snapshot.yml`
const RISK = 'docs/architecture/risks/r.md'

const ASSESSMENT = [
  '---',
  'date: 2026-11-03',
  "scope: [cart, 'cart/lines', web]",
  '---',
  '',
  '# About the cart',
  '',
  'The cart is what we looked at.',
  '',
  '## S1',
  '',
  '```yaml',
  'scenario: S1',
  'attribute: maintainability',
  'stimulus: a change',
  'artifact: cart',
  'response: made',
  'measure: in a day',
  '```',
  '',
  '## F1',
  '',
  '```yaml',
  'finding: F1',
  'scenarios: [S1, S7]',
  'evidence:',
  '  - violation: web-through-cart',
  '    from: web',
  '    to: "cart"',
  '  - violation: no-cycles',
  '    cycle: [cart/lines, cart/src/Cart.java, web]',
  '  - metric: instability',
  '    component: cart # the one',
  '  - annotation: 20261102-gone',
  '  - risk: cart',
  '```',
  ''
].join('\n')

const FILES = {
  [PATH]: ASSESSMENT,
  [SNAPSHOT]: "components:\n  cart:\n    files: 3\n  'cart/lines':\n    files: 1\n  cartography:\n    files: 2\n",
  [RISK]: '---\ncomponents:\n  - catalog\n  - cart\n---\n\n# The cart\n'
}

const changed = (plan: Plan): Record<string, string> => {
  if (!plan.ok) throw new Error(plan.reason)
  return Object.fromEntries(plan.changeSet.files.map((file) => [file.path, file.after]))
}

describe('a Rename of a Component in the Assessments', () => {
  it('rewrites every Trace that names it, or one below it, where it stands', async () => {
    const plan = await planRenameInAssessments(memoryFileSystem(FILES), 'cart', 'basket')
    const after = changed(plan)
    expect(Object.keys(after).sort()).toEqual([SNAPSHOT, PATH, RISK].sort())
    expect(after[PATH]).toBe(
      ASSESSMENT.replace("scope: [cart, 'cart/lines', web]", "scope: [basket, 'basket/lines', web]")
        .replace('to: "cart"', 'to: "basket"')
        .replace('cycle: [cart/lines,', 'cycle: [basket/lines,')
        .replace('component: cart # the one', 'component: basket # the one')
    )
    // A path to a Source File is no Component ID; the text, the artifact and a Risk's ID are the author's.
    expect(after[PATH]).toContain('cart/src/Cart.java')
    expect(after[PATH]).toContain('The cart is what we looked at.')
    expect(after[PATH]).toContain('artifact: cart\n')
    expect(after[PATH]).toContain('risk: cart\n')
    expect(after[SNAPSHOT]).toBe(
      "components:\n  basket:\n    files: 3\n  'basket/lines':\n    files: 1\n  cartography:\n    files: 2\n"
    )
    expect(after[RISK]).toBe('---\ncomponents:\n  - catalog\n  - basket\n---\n\n# The cart\n')
  })

  it('changes nothing where nothing names it', async () => {
    const plan = await planRenameInAssessments(memoryFileSystem(FILES), 'order', 'basket')
    expect(plan).toMatchObject({ ok: true, changeSet: { files: [] } })
  })

  it('is refused where a file that names it cannot be read', async () => {
    const refused = async (files: Record<string, string>) => {
      const plan = await planRenameInAssessments(memoryFileSystem(files), 'cart', 'basket')
      if (plan.ok) throw new Error('was planned')
      return plan.reason
    }
    expect(await refused({ [PATH]: '---\nscope: [cart]\n' })).toBe(
      `${PATH} may name cart where the suite cannot rewrite it: it cannot be read, or the ID is written in a way a splice cannot serve. Change it in an editor first.`
    )
    expect(
      await refused({
        [PATH]: '---\ndate: 2026-11-03\n---\n\n## F1\n\n```yaml\nfinding: F1\nfinding: F2\nevidence: [{metric: files, component: cart}]\n```\n'
      })
    ).toContain(`${PATH} may name cart`)
    expect(await refused({ [PATH]: '# A\n', [SNAPSHOT]: 'components:\n  cart: [\n' })).toContain(
      `${SNAPSHOT} may name cart`
    )
    expect(await refused({ [RISK]: '---\ncomponents: [cart\n---\n' })).toContain(`${RISK} may name cart`)
    // Where a Trace is an alias, the suite cannot tell what else the rewrite would change.
    expect(await refused({ [PATH]: '---\nx: &s [cart]\nscope: *s\n---\n' })).toContain(
      `${PATH} may name cart`
    )
  })

  it('leaves a file alone that cannot be read but names something else', async () => {
    const plan = await planRenameInAssessments(
      memoryFileSystem({ [PATH]: '---\nscope: [web]\n', [RISK]: '---\ncomponents: [web' }),
      'cart',
      'basket'
    )
    expect(plan).toMatchObject({ ok: true, changeSet: { files: [] } })
  })
})

describe('a Repair', () => {
  it('takes out the item of a Trace to what is not there, where it stands', async () => {
    const fs = memoryFileSystem(FILES)
    const reading = await openAssessments(fs)
    const problems = traceProblems(reading, { components: ['cart', 'web'], annotations: [] })
    expect(problems.map((problem) => problem.kind)).toEqual([
      'names-no-component',
      'finding-unknown-scenario',
      'metric-not-in-snapshot',
      'finding-unknown-annotation',
      'finding-unknown-risk',
      'names-no-component'
    ])
    const repaired = await Promise.all(problems.map((problem) => planRepair(fs, problem)))
    const texts = repaired.map((plan) => Object.values(changed(plan))[0]!)
    expect(texts[0]).toBe(ASSESSMENT.replace("scope: [cart, 'cart/lines', web]", 'scope: [cart, web]'))
    expect(texts[1]).toBe(ASSESSMENT.replace('scenarios: [S1, S7]', 'scenarios: [S1]'))
    expect(texts[2]).toBe(ASSESSMENT.replace('  - metric: instability\n    component: cart # the one\n', ''))
    expect(texts[3]).toBe(ASSESSMENT.replace('  - annotation: 20261102-gone\n', ''))
    expect(texts[4]).toBe(ASSESSMENT.replace('  - risk: cart\n', ''))
    expect(texts[5]).toBe('---\ncomponents:\n  - cart\n---\n\n# The cart\n')
  })

  it('is refused for a Problem without one, and for one that is gone', async () => {
    const fs = memoryFileSystem(FILES)
    const reason = async (plan: Promise<Plan>) => {
      const done = await plan
      return done.ok ? 'planned' : done.reason
    }
    expect(
      await reason(planRepair(fs, { kind: 'final-without-snapshot', path: PATH, assessment: 'a' }))
    ).toBe('This Problem has no Repair: the suite cannot know what was meant.')
    expect(
      await reason(
        planRepair(fs, {
          kind: 'finding-unknown-adr',
          path: PATH,
          assessment: 'a',
          finding: 'F1',
          line: 1,
          target: '0009-gone'
        })
      )
    ).toBe('The Problem is no longer there: there is nothing to repair.')
  })
})
