import { describe, expect, it } from 'vitest'
import { distanceOf } from '@adr-tool/structure/model'
import { sentenceAt } from '../src'
import { checked, found, shop, yaml } from './repository'

const rule = (id: string, ...lines: string[]): string[] => [
  `  - id: ${id}`,
  '    why: Because the architect says so.',
  ...lines.map((line) => `    ${line}`)
]
const rules = (...items: string[][]): string => yaml('rules:', ...items.flat())

describe('type-only (docs/conformance-format.md, section 1)', () => {
  // The review's probe: a type-only import and a value import of one file, on lines of their own.
  const files = {
    '.arch/components.yml':
      'components:\n  a:\n    paths: [src/a/**]\n  b:\n    paths: [src/b/**]\n',
    'src/a/a.ts': [
      '// header',
      "import type { T } from '../b/b'",
      'import {',
      '  b,',
      "} from '../b/b'",
      "export { c } from '../b/c'",
      ''
    ].join('\n'),
    'src/b/b.ts': 'export const b = 1; export type T = number\n',
    'src/b/c.ts': 'export const c = 1\n'
  }
  const lines = (report: Awaited<ReturnType<typeof checked>>) =>
    report.violations.flatMap((violation) =>
      violation.dependencies.map((one) => `${one.from}:${one.lines} ${one.to}`)
    )

  it('counts the lines of type-only uses by default', async () => {
    const report = await checked(
      files,
      rules(rule('a-not-b', 'kind: must-not-depend', 'from: a', 'to: b'))
    )
    expect(lines(report)).toEqual(['src/a/a.ts:2,3 src/b/b.ts', 'src/a/a.ts:6 src/b/c.ts'])
  })

  it('leaves out the lines of type-only uses where the Rule ignores them', async () => {
    const report = await checked(
      files,
      rules(rule('a-not-b', 'kind: must-not-depend', 'type-only: ignored', 'from: a', 'to: b'))
    )
    expect(lines(report)).toEqual(['src/a/a.ts:3 src/b/b.ts', 'src/a/a.ts:6 src/b/c.ts'])
  })
})

describe('must-not-depend (docs/conformance-format.md, section 2)', () => {
  it('finds a Dependency from one Component to another, with the imports behind it', async () => {
    const report = await checked(
      shop,
      rules(rule('billing-not-web', 'kind: must-not-depend', 'from: billing', 'to: [web]'))
    )
    expect(report.problems).toEqual([])
    expect(found(report)).toEqual(['billing-not-web: billing -> web'])
    const [violation] = report.violations
    expect(violation!.dependencies).toEqual([
      { from: 'src/billing/invoice.ts', to: 'src/web/format.ts', typeOnly: false, lines: [2] }
    ])
    // What Jonas reads on his pull request.
    expect(sentenceAt(violation!, violation!.dependencies[0])).toBe(
      'billing must not depend on web: src/billing/invoice.ts:2 imports src/web/format.ts.'
    )
  })

  it('sees a Dependency at the outermost Component the Rule names, children included', async () => {
    const report = await checked(
      shop,
      rules(
        rule('no-persistence', 'kind: must-not-depend', "from: ['**']", 'to: persistence'),
        rule(
          'not-from-invoices',
          'kind: must-not-depend',
          'from: billing/invoices',
          'to: [persistence]'
        )
      )
    )
    // `billing/invoices` stands within `billing`: the first Rule sees `billing`, the second its child.
    expect(found(report)).toEqual([
      'no-persistence: billing -> persistence',
      'no-persistence: web -> persistence',
      'not-from-invoices: billing/invoices -> persistence'
    ])
  })

  it('forbids Components that both lists match to depend on each other, never on themselves', async () => {
    const report = await checked(
      shop,
      rules(
        rule('features-apart', 'kind: must-not-depend', 'from: features/*', 'to: features/*'),
        rule(
          'web-and-billing-apart',
          'kind: must-not-depend',
          'from: [web, billing]',
          'to: [web, billing]'
        )
      )
    )
    expect(found(report)).toEqual([
      'features-apart: features/a -> features/b',
      'features-apart: features/b -> features/a',
      'web-and-billing-apart: billing -> web',
      'web-and-billing-apart: web -> billing'
    ])
  })

  it('leaves out test files and, when asked, type-only Dependencies', async () => {
    const counted = await checked(
      shop,
      rules(
        rule('persistence-not-web', 'kind: must-not-depend', 'from: persistence', 'to: web'),
        rule('billing-not-persistence', 'kind: must-not-depend', 'from: billing', 'to: persistence')
      )
    )
    expect(found(counted)).toEqual([
      'persistence-not-web: persistence -> web',
      'billing-not-persistence: billing -> persistence'
    ])
    // The test of billing reaches into persistence too, but tests are left out by default.
    expect(counted.violations[1]!.dependencies.map((one) => one.from)).toEqual([
      'src/billing/invoices/list.ts'
    ])

    const asked = await checked(
      shop,
      rules(
        rule(
          'persistence-not-web',
          'kind: must-not-depend',
          'from: persistence',
          'to: web',
          'type-only: ignored'
        ),
        rule(
          'billing-not-persistence',
          'kind: must-not-depend',
          'from: billing',
          'to: persistence',
          'tests: included'
        )
      )
    )
    expect(found(asked)).toEqual(['billing-not-persistence: billing -> persistence'])
    expect(asked.violations[0]!.dependencies.map((one) => one.from)).toEqual([
      'src/billing/invoice.test.ts',
      'src/billing/invoices/list.ts'
    ])
  })

  it('never sees an Unassigned file', async () => {
    const report = await checked(
      shop,
      rules(rule('nothing-on-persistence', 'kind: must-not-depend', "from: ['**']", "to: ['**']"))
    )
    expect(found(report)).not.toContainEqual(expect.stringContaining('unassigned'))
  })
})

describe('may-only-depend', () => {
  it('forbids what it does not allow, an Unassigned file included', async () => {
    const report = await checked(
      shop,
      rules(
        rule(
          'billing-uses-persistence',
          'kind: may-only-depend',
          'from: billing',
          'to: [persistence]'
        )
      )
    )
    expect(found(report)).toEqual([
      'billing-uses-persistence: billing -> (unassigned)',
      'billing-uses-persistence: billing -> web'
    ])
    expect(sentenceAt(report.violations[1]!, report.violations[1]!.dependencies[0])).toBe(
      'billing may only depend on persistence, and depends on web: src/billing/invoice.ts:2 imports src/web/format.ts.'
    )
  })

  it('allows nothing with an empty list, and names the Component where the chains part', async () => {
    const report = await checked(
      shop,
      rules(rule('invoices-alone', 'kind: may-only-depend', 'from: billing/invoices', 'to: []'))
    )
    // `list.ts` uses the files of its parent, `billing`, and `persistence`.
    expect(found(report)).toEqual([
      'invoices-alone: billing/invoices -> billing',
      'invoices-alone: billing/invoices -> persistence'
    ])
    expect(sentenceAt(report.violations[0]!, report.violations[0]!.dependencies[0])).toBe(
      'billing/invoices may depend on no other Component, and depends on billing: src/billing/invoices/list.ts:2 imports src/billing/invoice.ts.'
    )
  })

  it('allows everything inside a Component it names, its parent included', async () => {
    const report = await checked(
      shop,
      rules(
        rule(
          'invoices-in-billing',
          'kind: may-only-depend',
          'from: billing/invoices',
          'to: [billing, persistence]'
        )
      )
    )
    expect(found(report)).toEqual([])
  })
})

describe('layers', () => {
  const layered = (mode?: string) =>
    rules(
      rule(
        'layered',
        'kind: layers',
        ...(mode ? [`mode: ${mode}`] : []),
        'layers: [web, [billing, features/*], persistence]'
      )
    )

  it('relaxed: a layer may use every layer below it, never one above', async () => {
    const report = await checked(shop, layered())
    expect(found(report)).toEqual(['layered: billing -> web', 'layered: persistence -> web'])
    expect(report.violations.map((violation) => violation.said)).toContainEqual({
      code: 'layers',
      values: { from: 'billing', to: 'web', where: 'above' }
    })
  })

  it('strict: only the layer right below it', async () => {
    const report = await checked(shop, layered('strict'))
    expect(found(report)).toEqual([
      'layered: billing -> web',
      'layered: persistence -> web',
      'layered: web -> persistence'
    ])
    const skip = report.violations[2]!
    expect(sentenceAt(skip, skip.dependencies[0])).toBe(
      'web must not depend on persistence, which lies more than one layer below it: src/web/page.ts:2 imports src/persistence/db.ts.'
    )
  })

  it('lets Components of one layer use each other, and leaves those outside every layer alone', async () => {
    const report = await checked(
      shop,
      rules(rule('two', 'kind: layers', 'layers: [[features/*], web]'))
    )
    expect(found(report)).toEqual([])
  })
})

describe('no-cycles', () => {
  it('finds a Cycle among the Components a pattern matches, with its weakest Dependency', async () => {
    const report = await checked(
      shop,
      rules(
        rule('top', 'kind: no-cycles', "among: '*'"),
        rule('features', 'kind: no-cycles', 'among: features/*')
      )
    )
    expect(found(report)).toEqual([
      'top: billing persistence web',
      'features: features/a features/b'
    ])
    const [top] = report.violations
    expect(sentenceAt(top!, top!.dependencies[0])).toBe(
      'billing, persistence and web depend on each other in a Cycle, for example billing -> web -> billing, with billing -> web as its weakest Dependency: src/billing/invoice.ts:2 imports src/web/format.ts.'
    )
    expect(top!.cycle).toEqual({
      members: ['billing', 'persistence', 'web'],
      roundTrip: ['billing', 'web'],
      weakest: { from: 'billing', to: 'web' },
      typeOnly: false
    })
    // Every Dependency among the members lies on the Cycle, and each import is annotated:
    // the one that closed it may be any of them.
    expect(top!.dependencies.map((one) => `${one.from}:${one.lines} ${one.to}`)).toEqual([
      'src/billing/invoice.ts:2 src/web/format.ts',
      'src/billing/invoices/list.ts:1 src/persistence/db.ts',
      'src/persistence/db.ts:1 src/web/page.ts',
      'src/web/page.ts:1 src/billing/invoice.ts',
      'src/web/page.ts:2 src/persistence/db.ts'
    ])
    expect(report.violations[1]!.said).toEqual({
      code: 'no-cycles',
      values: {
        members: ['features/a', 'features/b'],
        roundTrip: ['features/a', 'features/b'],
        weakest: ['features/a', 'features/b']
      }
    })
    expect(sentenceAt(report.violations[1]!, report.violations[1]!.dependencies[0])).toBe(
      'features/a and features/b depend on each other in a Cycle, with features/a -> features/b as its weakest Dependency: src/features/a/x.ts:1 imports src/features/b/y.ts.'
    )
  })

  it('finds a Cycle among the Source Files inside a Component, once, for the innermost', async () => {
    const report = await checked(shop, rules(rule('inside', 'kind: no-cycles', "inside: ['**']")))
    expect(found(report)).toEqual([
      'inside: src/billing/invoice.ts src/billing/invoices/list.ts',
      'inside: src/features/a/x.ts src/features/b/y.ts'
    ])
    // The round trip's Dependencies are behind it.
    expect(report.violations[1]!.dependencies.map((one) => `${one.from} ${one.lines}`)).toEqual([
      'src/features/a/x.ts 1',
      'src/features/b/y.ts 1'
    ])
  })

  it('puts every import on a Cycle behind it, not only those of its weakest Dependency', async () => {
    // The review's probe: a uses b once, b uses a twice; b2.ts is Jonas's new import.
    const report = await checked(
      {
        '.arch/components.yml':
          'components:\n  a:\n    paths: [src/a/**]\n  b:\n    paths: [src/b/**]\n',
        'src/a/a1.ts': "import { b } from '../b/b'\n",
        'src/b/b.ts': 'export const b = 1\n',
        'src/b/b1.ts': "import { a } from '../a/a1'\n",
        'src/b/b2.ts': "// new\nimport { a } from '../a/a1'\n"
      },
      rules(rule('no-cycles', 'kind: no-cycles', "among: '*'"))
    )
    const [cycle] = report.violations
    expect(cycle!.cycle!.weakest).toEqual({ from: 'a', to: 'b' })
    expect(cycle!.dependencies.map((one) => `${one.from}:${one.lines}`)).toEqual([
      'src/a/a1.ts:1',
      'src/b/b1.ts:1',
      'src/b/b2.ts:2'
    ])
  })

  it('says a long Cycle of Source Files in short, and puts each of its imports behind it', async () => {
    // Seven files in a ring, and one shortcut across it that lies on a Cycle too.
    const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    const files: Record<string, string> = {
      '.arch/components.yml': 'components:\n  ring:\n    paths: [src/**]\n'
    }
    names.forEach((name, index) => {
      const next = names[(index + 1) % names.length]
      files[`src/${name}.ts`] =
        `import { ${next} } from './${next}'\n${name === 'c' ? "import { f } from './f'\n" : ''}`
    })
    const report = await checked(files, rules(rule('ring', 'kind: no-cycles', 'inside: ring')))
    const [ring] = report.violations
    expect(ring!.dependencies).toHaveLength(8)
    expect(sentenceAt(ring!, ring!.dependencies[0])).toBe(
      'src/a.ts, src/b.ts, src/c.ts, src/d.ts, src/e.ts and 2 more depend on each other in a Cycle, for example src/a.ts -> src/b.ts -> src/c.ts -> src/f.ts -> src/g.ts -> src/a.ts: src/a.ts:1 imports src/b.ts.'
    )
  })

  it('leaves out a Cycle that is type-only when asked', async () => {
    const report = await checked(
      shop,
      rules(rule('inside', 'kind: no-cycles', 'inside: billing', 'type-only: ignored'))
    )
    expect(found(report)).toEqual([])
  })
})

describe('threshold', () => {
  it('checks a metric of Structure against its maximum and minimum', async () => {
    const report = await checked(
      shop,
      rules(
        rule('small', 'kind: threshold', 'metric: files', 'max: 2', "of: ['*']"),
        rule('stable', 'kind: threshold', 'metric: instability', 'min: 0.5', 'of: persistence')
      )
    )
    expect(found(report)).toEqual(['small: billing', 'stable: persistence'])
    expect(report.violations[0]!.value).toBe(3)
    expect(sentenceAt(report.violations[0]!)).toBe(
      'The metric files of billing is 3, above the maximum of 2.'
    )
    expect(sentenceAt(report.violations[1]!)).toBe(
      'The metric instability of persistence is 0.25, below the minimum of 0.5.'
    )
    expect(report.violations[1]!.dependencies).toEqual([])
  })

  it('counts test files when asked, and skips a metric that is undefined', async () => {
    const report = await checked(
      shop,
      rules(
        rule(
          'small',
          'kind: threshold',
          'metric: files',
          'max: 3',
          'of: billing',
          'tests: included'
        ),
        rule('share', 'kind: threshold', 'metric: internal-share', 'max: 0', "of: ['**']")
      )
    )
    expect(found(report)).toEqual(['small: billing', 'share: billing', 'share: features'])
  })
})

describe('threshold on what is measured inside the code (part 13)', () => {
  // cart uses pricing; pricing declares an interface, an abstract class and a function.
  const measured = {
    '.arch/components.yml':
      'components:\n  cart:\n    paths: [src/cart/**]\n  pricing:\n    paths: [src/pricing/**]\n',
    'src/cart/cart.ts': [
      "import { price, type Priced } from '../pricing/price'", // 1
      'export class Cart {', // 2
      '  private lines: Priced[] = []',
      "  private note = ''",
      '  add(line: Priced): void { this.lines.push(line) }',
      '  total(): number { return this.lines.reduce((sum, line) => sum + price(line), 0) }',
      '  remark(text: string): void { this.note = text }',
      '}',
      'export function discount(total: number, code?: string): number {', // 9
      '  if (code === undefined) return total',
      "  if (code === 'HALF') return total / 2",
      '  return total > 100 ? total - 10 : total',
      '}',
      ''
    ].join('\n'),
    'src/cart/cart.test.ts':
      'export const odd = (x: number): boolean => (x > 0 && x < 10) || x === 99 || x === 7\n',
    'src/pricing/price.ts': [
      'export interface Priced { cents: number }',
      'export abstract class Base implements Priced { abstract cents: number }',
      'export function price(line: Priced): number { return line.cents }',
      ''
    ].join('\n')
  }

  it('checks the complexity of each function in the matched Components, at its line', async () => {
    const report = await checked(
      measured,
      rules(
        rule('simple', 'kind: threshold', 'metric: complexity', 'max: 3', "of: '*'"),
        rule(
          'simple-tests',
          'kind: threshold',
          'metric: complexity',
          'max: 3',
          'of: cart',
          'tests: included'
        )
      )
    )
    expect(report.problems).toEqual([])
    expect(found(report)).toEqual([
      'simple: discount in src/cart/cart.ts',
      'simple-tests: odd in src/cart/cart.test.ts',
      'simple-tests: discount in src/cart/cart.ts'
    ])
    const [discount] = report.violations
    expect(discount).toMatchObject({
      file: 'src/cart/cart.ts',
      line: 9,
      name: 'discount',
      value: 4
    })
    expect(discount!.fingerprint).toEqual({
      kind: 'function',
      rule: 'simple',
      file: 'src/cart/cart.ts',
      name: 'discount'
    })
    expect(discount!.dependencies).toEqual([])
    expect(sentenceAt(discount!)).toBe(
      'The metric complexity of the function discount at src/cart/cart.ts:9 is 4, above the maximum of 3.'
    )
  })

  it('checks the LCOM4 of each class, and passes over a class without methods', async () => {
    const report = await checked(
      measured,
      rules(rule('cohesive', 'kind: threshold', 'metric: lcom4', 'max: 1', "of: ['**']"))
    )
    expect(found(report)).toEqual(['cohesive: Cart in src/cart/cart.ts'])
    expect(sentenceAt(report.violations[0]!)).toBe(
      'The metric lcom4 of the class Cart at src/cart/cart.ts:2 is 2, above the maximum of 1.'
    )
  })

  it('checks abstractness and distance per Component', async () => {
    const report = await checked(
      measured,
      rules(
        rule('concrete', 'kind: threshold', 'metric: abstractness', 'max: 0.5', "of: '*'"),
        rule('on-the-sequence', 'kind: threshold', 'metric: distance', 'max: 0.2', "of: '*'")
      )
    )
    expect(found(report)).toEqual(['concrete: pricing', 'on-the-sequence: pricing'])
    // pricing: two of three declarations abstract, used and using nothing: D = |2/3 + 0 - 1|,
    // rounded where Structure rounds it.
    expect(report.violations.map((violation) => violation.value)).toEqual([
      2 / 3,
      distanceOf(2 / 3, 0)
    ])
    expect(sentenceAt(report.violations[1]!)).toBe(
      'The metric distance of pricing is 0.33, above the maximum of 0.2.'
    )
  })

  it('checks the propagation cost of the top level, named *, and of the level below a Component', async () => {
    const report = await checked(
      measured,
      rules(
        rule('loose', 'kind: threshold', 'metric: propagation-cost', 'max: 0.4', "of: ['*', cart]"),
        rule(
          'loose-tests',
          'kind: threshold',
          'metric: propagation-cost',
          'max: 0',
          'of: cart',
          'tests: included'
        )
      )
    )
    // cart reaches pricing: one of the two pairs. Below cart there is one file, and so no
    // propagation cost; with its test, two that do not use each other.
    expect(found(report)).toEqual(['loose: *'])
    expect(report.violations[0]).toMatchObject({ component: '*', value: 0.5 })
    expect(sentenceAt(report.violations[0]!)).toBe(
      'The metric propagation-cost of the top level is 0.5, above the maximum of 0.4.'
    )
    const below = await checked(
      measured,
      rules(
        rule(
          'tight',
          'kind: threshold',
          'metric: propagation-cost',
          'min: 0.5',
          'of: cart',
          'tests: included'
        )
      )
    )
    expect(found(below)).toEqual(['tight: cart'])
    expect(sentenceAt(below.violations[0]!)).toBe(
      'The metric propagation-cost of the level below cart is 0, below the minimum of 0.5.'
    )
  })
})
