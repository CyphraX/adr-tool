import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { run } from '../src/run'

const repository = fileURLToPath(new URL('../../../', import.meta.url))
const shop = fileURLToPath(
  new URL('../../conformance/test/fixtures/layered-shop/', import.meta.url)
)
const mavenShop = fileURLToPath(
  new URL('../../structure/test/fixtures/maven-shop/', import.meta.url)
)
const assessedShop = fileURLToPath(
  new URL('../../assessment/test/fixtures/maven-shop/', import.meta.url)
)
const pythonShop = fileURLToPath(
  new URL('../../structure/test/fixtures/python-shop/', import.meta.url)
)
const goShop = fileURLToPath(new URL('../../structure/test/fixtures/go-shop/', import.meta.url))
const fixtureShop = fileURLToPath(new URL('../../structure/test/fixtures/shop/', import.meta.url))

/** Runs the command in `cwd` as a shell would, and keeps what it prints. */
async function adrIn(
  cwd: string,
  ...args: string[]
): Promise<{ code: number; out: string; err: string }> {
  let out = ''
  let err = ''
  const code = await run(args, {
    out: (text) => void (out += text),
    err: (text) => void (err += text),
    cwd
  })
  return { code, out, err }
}

const adr = (...args: string[]): ReturnType<typeof adrIn> => adrIn(repository, ...args)

const scratch: string[] = []
afterAll(() => scratch.forEach((dir) => rmSync(dir, { recursive: true, force: true })))

/** A copy of `from` on disk, with `files` (path → text) written over it. */
function copyOf(from: string | undefined, files: Record<string, string> = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'adr-check-'))
  scratch.push(root)
  if (from) cpSync(from, root, { recursive: true })
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  return root
}

/** The layered shop, with `text` added to its `.arch/rules.yml`. */
function shopWith(text: string, files: Record<string, string> = {}): string {
  const rules = readFileSync(join(shop, '.arch/rules.yml'), 'utf8')
  return copyOf(shop, { '.arch/rules.yml': `${rules}${text}`, ...files })
}

const BILLING_NOT_WEB =
  'billing must not depend on web: src/billing/invoice.ts:3 imports src/web/format.ts. Billing is the domain; the web is how it is shown, and may change without it.'
const LAYERED =
  'billing must not depend on web, which lies in a layer above it: src/billing/invoice.ts:3 imports src/web/format.ts. The web uses billing, which uses persistence.'

const EXCEPTIONS = `
exceptions:
  - rule: billing-not-web
    from: billing
    to: web
    reason: The invoice formats its date like the web until it has a format of its own.
    justified-by: docs/adr/0001-invoices-format-dates-like-the-web
  - rule: layered
    from: billing
    to: web
    reason: The same import, seen from the layers.
`

const lines = (out: string): string[] => out.trimEnd().split('\n')

describe('adr check (docs/cli.md)', () => {
  it('finds nothing in this repository, and ends with 0', async () => {
    const { code, out, err } = await adr('check')
    expect([code, err]).toEqual([0, ''])
    expect(out).toMatch(/^No Problems in 1 Decision Log\.\n\d+ Rules hold\.\n$/)
    // The whole repository, measured and parsed in every language: a few seconds alone.
  }, 30_000)

  it('prints each Violation at the line of its import, and ends with 1', async () => {
    const { code, out, err } = await adrIn(shop, 'check')
    expect([code, err]).toEqual([1, ''])
    expect(lines(out)).toEqual([
      `src/billing/invoice.ts:3: billing-not-web: ${BILLING_NOT_WEB}`,
      `src/billing/invoice.ts:3: layered: ${LAYERED}`,
      '',
      'No Problems in 1 Decision Log.',
      '2 Violations of 2 Rules.'
    ])
  })

  it('prints workflow commands of GitHub, the files named from where it runs', async () => {
    const { code, out } = await adr(
      'check',
      'packages/conformance/test/fixtures/layered-shop',
      '--format',
      'github'
    )
    expect(code).toBe(1)
    const file = 'packages/conformance/test/fixtures/layered-shop/src/billing/invoice.ts'
    expect(lines(out)).toEqual([
      `::error file=${file},line=3,title=billing-not-web::${BILLING_NOT_WEB}`,
      `::error file=${file},line=3,title=layered::${LAYERED}`,
      'No Problems in 1 Decision Log.',
      '2 Violations of 2 Rules.'
    ])
    expect(lines((await adrIn(shop, 'check', '--format=github')).out)[0]).toMatch(
      /^::error file=src\/billing\/invoice\.ts,line=3,title=billing-not-web::/
    )
  })

  it('prints one JSON document with --format json', async () => {
    const { code, out } = await adrIn(shop, 'check', '--format', 'json')
    expect(code).toBe(1)
    const report = JSON.parse(out)
    expect(report.logs).toEqual(['docs/adr'])
    expect(report.problems).toEqual([])
    expect(report.rules).toEqual([
      {
        id: 'billing-not-web',
        kind: 'must-not-depend',
        why: 'Billing is the domain; the web is how it is shown, and may change without it.',
        path: '.arch/rules.yml',
        line: 3
      },
      {
        id: 'layered',
        kind: 'layers',
        why: 'The web uses billing, which uses persistence.',
        path: '.arch/rules.yml',
        line: 9
      }
    ])
    expect(report.violations).toHaveLength(2)
    expect(report.violations[0]).toEqual({
      code: 'must-not-depend',
      rule: 'billing-not-web',
      message: 'billing must not depend on web.',
      why: 'Billing is the domain; the web is how it is shown, and may change without it.',
      fingerprint: { kind: 'dependency', rule: 'billing-not-web', from: 'billing', to: 'web' },
      fingerprintText: 'billing-not-web: billing -> web',
      path: 'src/billing/invoice.ts',
      line: 3,
      dependencies: [
        { from: 'src/billing/invoice.ts', to: 'src/web/format.ts', typeOnly: false, lines: [3] }
      ]
    })
  })

  it('passes once each Violation has an Exception, and lists them as accepted', async () => {
    const root = shopWith(EXCEPTIONS)
    const { code, out, err } = await adrIn(root, 'check')
    expect([code, err]).toEqual([0, ''])
    expect(out).toBe(
      'No Problems in 1 Decision Log.\n2 Rules hold, but for 2 Violations accepted as Exceptions.\n'
    )
    const report = JSON.parse((await adrIn(root, 'check', '--format', 'json')).out)
    expect(report.violations[0].exception).toEqual({
      reason: 'The invoice formats its date like the web until it has a format of its own.',
      'justified-by': 'docs/adr/0001-invoices-format-dates-like-the-web',
      path: '.arch/rules.yml',
      line: 15
    })
    expect(report.violations[1].exception).not.toHaveProperty('justified-by')
  })

  it('fails on the Violation an Exception does not name', async () => {
    const one = EXCEPTIONS.slice(0, EXCEPTIONS.indexOf('  - rule: layered'))
    const { code, out } = await adrIn(shopWith(one), 'check')
    expect(code).toBe(1)
    expect(lines(out)).toEqual([
      `src/billing/invoice.ts:3: layered: ${LAYERED}`,
      '',
      'No Problems in 1 Decision Log.',
      '1 Violation of 2 Rules, and 1 accepted as an Exception.'
    ])
  })

  it('keeps an Exception matching when the import moves to another line', async () => {
    const invoice = readFileSync(join(shop, 'src/billing/invoice.ts'), 'utf8')
    const moved = invoice.replace('// An invoice', '// Moved down.\n\n// An invoice')
    const root = shopWith(EXCEPTIONS, { 'src/billing/invoice.ts': moved })
    expect((await adrIn(root, 'check')).code).toBe(0)
    const report = JSON.parse((await adrIn(root, 'check', '--format', 'json')).out)
    expect(report.violations[0].line).toBe(5)
  })

  it('names an Exception that matches nothing any more as a Problem', async () => {
    const invoice = readFileSync(join(shop, 'src/billing/invoice.ts'), 'utf8')
    const fixed = invoice
      .replace("import { formatDate } from '../web/format'\n", '')
      .replace('${formatDate(new Date())}', 'today')
    const { code, out } = await adrIn(
      shopWith(EXCEPTIONS, { 'src/billing/invoice.ts': fixed }),
      'check'
    )
    expect(code).toBe(1)
    expect(lines(out)).toEqual([
      '.arch/rules.yml:15: unmatched-exception: The Exception billing-not-web: billing -> web matches no Violation any more. Remove it, or name the Violation as it is now.',
      '.arch/rules.yml:20: unmatched-exception: The Exception layered: billing -> web matches no Violation any more. Remove it, or name the Violation as it is now.',
      '',
      'No Problems in 1 Decision Log.',
      '2 Rules hold; 2 Problems in .arch/rules.yml.'
    ])
  })

  it('passes on a Cycle that shrank under its Exception, and notes that it can be narrowed', async () => {
    const root = copyOf(undefined, {
      '.arch/components.yml':
        'components:\n  a:\n    paths: [src/a/**]\n  b:\n    paths: [src/b/**]\n  c:\n    paths: [src/c/**]\n',
      '.arch/rules.yml': [
        'rules:',
        '  - id: no-cycles',
        '    why: Cycles hurt.',
        '    kind: no-cycles',
        "    among: '*'",
        'exceptions:',
        '  - rule: no-cycles',
        '    cycle: [a, b, c]',
        '    reason: Legacy, being untangled.',
        ''
      ].join('\n'),
      'src/a/a.ts': "import { b } from '../b/b'\n",
      'src/b/b.ts': "import { c } from '../c/c'\nimport { a } from '../a/a'\n",
      'src/c/c.ts': 'export const c = 1\n'
    })
    const note =
      'The Exception no-cycles: a, b, c accepts a Cycle of a and b only now, and can be narrowed to them.'
    expect(await adrIn(root, 'check')).toEqual({
      code: 0,
      out: `.arch/rules.yml:7: exception-can-shrink: ${note}\n\nNo Decision Log.\n1 Rule holds, but for 1 Violation accepted as an Exception.\n`,
      err: ''
    })
    const github = await adrIn(root, 'check', '--format', 'github')
    expect([github.code, lines(github.out)[0]]).toEqual([
      0,
      `::notice file=.arch/rules.yml,line=7,title=exception-can-shrink::${note}`
    ])
    const report = JSON.parse((await adrIn(root, 'check', '--format', 'json')).out)
    expect(report.notes).toMatchObject([
      { module: 'conformance', code: 'exception-can-shrink', line: 7 }
    ])
  })

  it('names an ADR that justifies an Exception and does not exist as a Problem', async () => {
    const missing = EXCEPTIONS.replace(
      'docs/adr/0001-invoices-format-dates-like-the-web',
      'docs/adr/0099-never-written'
    )
    const { code, out } = await adrIn(shopWith(missing), 'check', '--format', 'github')
    expect(code).toBe(1)
    expect(lines(out)).toEqual([
      '::error file=.arch/rules.yml,line=19,title=unknown-justification::The Exception billing-not-web: billing -> web is justified by docs/adr/0099-never-written, which is not an ADR of this repository. An ADR is named by the directory of its Decision Log and its ID: docs/adr/0001-example.',
      'No Problems in 1 Decision Log.',
      '2 Rules hold, but for 2 Violations accepted as Exceptions; 1 Problem in .arch/rules.yml.'
    ])
  })

  it('reports the Problems of the file of Rules at their line, and checks the Rules it can read', async () => {
    // The item lands in the list of Rules, which the file ends with. It is not counted as a Rule.
    const root = shopWith('\n  - id: no-kind\n    why: It says nothing.\n')
    const { code, out } = await adrIn(root, 'check')
    expect(code).toBe(1)
    expect(lines(out)).toContain(
      ".arch/rules.yml:14: unknown-rule-kind: The Rule no-kind has no kind. A Rule's kind is one of must-not-depend, may-only-depend, layers, no-cycles, threshold, library."
    )
    expect(lines(out).at(-1)).toBe('2 Violations of 2 Rules; 1 Problem in .arch/rules.yml.')
  })

  it('fails on a Problem of .arch/components.yml', async () => {
    const components = readFileSync(join(shop, '.arch/components.yml'), 'utf8')
    const root = shopWith(EXCEPTIONS, {
      '.arch/components.yml': `${components}  shipping:\n    paths: [src/shipping/**]\n`
    })
    const { code, out } = await adrIn(root, 'check')
    expect(code).toBe(1)
    expect(lines(out)[0]).toMatch(/^\.arch\/components\.yml: dead-pattern: /)
    expect(lines(out).slice(-2)).toEqual([
      '1 Problem in .arch/components.yml.',
      '2 Rules hold, but for 2 Violations accepted as Exceptions.'
    ])
  })

  it('names a declaration that is not YAML at the line the parser stopped at, on one line', async () => {
    const root = shopWith('', { '.arch/components.yml': 'components: [\n' })
    const { code, out } = await adrIn(root, 'check')
    expect(code).toBe(1)
    expect(lines(out)[0]).toBe(
      '.arch/components.yml:2: unreadable-declaration: .arch/components.yml cannot be read: it is not valid YAML: Flow sequence in block collection must be sufficiently indented and end with a ] at line 2, column 1'
    )
  })

  it('evaluates no Rule on a Draft', async () => {
    const root = shopWith('')
    rmSync(join(root, '.arch/components.yml'))
    const { code, out } = await adrIn(root, 'check')
    expect(code).toBe(1)
    expect(lines(out)[0]).toMatch(/^\.arch\/rules\.yml:2: rules-without-declaration: /)
    expect(lines(out).at(-1)).toBe('2 Rules, not checked; 1 Problem in .arch/rules.yml.')
  })

  it('checks a repository without a Decision Log, and one without Rules', async () => {
    const root = shopWith('')
    rmSync(join(root, 'docs'), { recursive: true })
    const { code, out } = await adrIn(root, 'check')
    expect(code).toBe(1)
    expect(lines(out).slice(-2)).toEqual(['No Decision Log.', '2 Violations of 2 Rules.'])
    rmSync(join(root, '.arch/rules.yml'))
    expect(await adrIn(root, 'check')).toEqual({
      code: 0,
      out: 'No Decision Log.\nNo Rules: .arch/rules.yml is not there.\n',
      err: ''
    })
  })

  it('checks Rules of its own on Java, read with the grammar it carries', async () => {
    const root = copyOf(mavenShop, {
      '.arch/components.yml':
        'components:\n  cart:\n    paths: [cart/**]\n  catalog:\n    paths: [catalog/**]\n  web:\n    paths: [web/**]\n',
      '.arch/rules.yml': [
        'rules:',
        '  - id: web-on-top',
        '    why: The web shows the shop; it goes through the cart.',
        '    kind: layers',
        '    mode: strict',
        '    layers: [web, cart, catalog]',
        '  - id: cart-in-order',
        '    why: Cart and Line should be readable one after the other.',
        '    kind: no-cycles',
        '    inside: [cart]',
        ''
      ].join('\n')
    })
    const { code, out, err } = await adrIn(root, 'check')
    expect([code, err]).toEqual([1, ''])
    expect(lines(out)).toEqual([
      'web/src/main/java/com/shop/web/Page.java:4: web-on-top: web must not depend on catalog, which lies more than one layer below it: web/src/main/java/com/shop/web/Page.java:4 imports catalog/src/main/java/com/shop/catalog/Search.java. The web shows the shop; it goes through the cart.',
      'cart/src/main/java/com/shop/cart/Cart.java:8: cart-in-order: cart/src/main/java/com/shop/cart/Cart.java and cart/src/main/java/com/shop/cart/Line.java depend on each other in a Cycle: cart/src/main/java/com/shop/cart/Cart.java:8 imports cart/src/main/java/com/shop/cart/Line.java. Cart and Line should be readable one after the other.',
      'cart/src/main/java/com/shop/cart/Line.java:6: cart-in-order: cart/src/main/java/com/shop/cart/Cart.java and cart/src/main/java/com/shop/cart/Line.java depend on each other in a Cycle: cart/src/main/java/com/shop/cart/Line.java:6 imports cart/src/main/java/com/shop/cart/Cart.java. Cart and Line should be readable one after the other.',
      '',
      'No Decision Log.',
      '2 Violations of 2 Rules.'
    ])
  })

  // The Assessment of the Java shop (packages/assessment/test/fixtures) cites the Violation of
  // its Rule by this fingerprint; its test derives the same one from the Dependencies.
  it('finds the Violation that the Assessment of the Java shop cites, and nothing else', async () => {
    const { code, out } = await adrIn(assessedShop, 'check', '--format', 'json')
    expect(code).toBe(1)
    const report = JSON.parse(out)
    expect(report.logs).toEqual(['docs/adr'])
    expect(report.problems).toEqual([])
    expect(
      report.violations.map((violation: { fingerprint: unknown; fingerprintText: string }) => [
        violation.fingerprint,
        violation.fingerprintText
      ])
    ).toEqual([
      [
        { kind: 'dependency', rule: 'web-through-cart', from: 'web', to: 'catalog' },
        'web-through-cart: web -> catalog'
      ]
    ])
  })

  it('fails at a function whose complexity is above its threshold, on Java', async () => {
    const root = copyOf(mavenShop, {
      '.arch/components.yml':
        'components:\n  cart:\n    paths: [cart/**]\n  catalog:\n    paths: [catalog/**]\n  web:\n    paths: [web/**]\n',
      '.arch/rules.yml': [
        'rules:',
        '  - id: functions-stay-simple',
        '    why: A function with more ways through it than that cannot be tested path by path.',
        '    kind: threshold',
        '    metric: complexity',
        '    max: 4',
        "    of: '*'",
        ''
      ].join('\n')
    })
    const text = await adrIn(root, 'check')
    expect([text.code, text.err]).toEqual([1, ''])
    const at = 'cart/src/main/java/com/shop/cart/Cart.java:19'
    expect(lines(text.out)).toEqual([
      `${at}: functions-stay-simple: The metric complexity of the function Cart.discount(long) at ${at} is 5, above the maximum of 4. A function with more ways through it than that cannot be tested path by path.`,
      '',
      'No Decision Log.',
      '1 Violation of 1 Rule.'
    ])
    const github = await adrIn(root, 'check', '--format', 'github')
    expect(lines(github.out)[0]).toMatch(
      /^::error file=cart\/src\/main\/java\/com\/shop\/cart\/Cart\.java,line=19,title=functions-stay-simple::/
    )
    const json = JSON.parse((await adrIn(root, 'check', '--format', 'json')).out)
    expect(json.violations).toEqual([
      expect.objectContaining({
        code: 'threshold',
        fingerprint: {
          kind: 'function',
          rule: 'functions-stay-simple',
          file: 'cart/src/main/java/com/shop/cart/Cart.java',
          name: 'Cart.discount(long)'
        },
        fingerprintText:
          'functions-stay-simple: Cart.discount(long) in cart/src/main/java/com/shop/cart/Cart.java',
        path: 'cart/src/main/java/com/shop/cart/Cart.java',
        line: 19,
        value: 5,
        dependencies: []
      })
    ])
    // Accepted by its file and name, it fails nothing.
    const accepted = copyOf(root, {
      '.arch/rules.yml': `${readFileSync(join(root, '.arch/rules.yml'), 'utf8')}exceptions:
  - rule: functions-stay-simple
    file: cart/src/main/java/com/shop/cart/Cart.java
    name: Cart.discount(long)
    reason: The discount tiers are one table, read top to bottom.
`
    })
    expect(lines((await adrIn(accepted, 'check')).out).at(-1)).toBe(
      '1 Rule holds, but for 1 Violation accepted as an Exception.'
    )
  })

  it('notes an Exception that names a function by its position among those of its name', async () => {
    const root = copyOf(fixtureShop, {
      'src/cart/both.ts':
        'export function both(list: number[]): number[] {\n  return list.map((x) => (x > 1 ? x : 0)).concat(list.map((x) => (x > 2 ? x : 0)))\n}\n',
      '.arch/rules.yml': [
        'rules:',
        '  - id: functions-stay-simple',
        '    why: A function with more ways through it than that cannot be tested path by path.',
        '    kind: threshold',
        '    metric: complexity',
        '    max: 2',
        '    of: [cart]',
        'exceptions:',
        '  - rule: functions-stay-simple',
        '    file: src/cart/both.ts',
        "    name: 'both.list.map()#2'",
        '    reason: The second filter is the first one again.',
        ''
      ].join('\n')
    })
    const { code, out, err } = await adrIn(root, 'check')
    // The callbacks are named by their call, the second by its position: both are within the
    // maximum, and the Exception matches nothing.
    expect(code).toBe(1)
    expect(out).toContain(
      'The Exception functions-stay-simple: both.list.map()#2 in src/cart/both.ts matches no Violation any more.'
    )
    expect(err).toBe(
      'adr check: .arch/rules.yml:9: The Exception of functions-stay-simple names both.list.map()#2 by its position among the functions of that name in src/cart/both.ts: it moves to another one when a function of that name is added or removed before it.\n'
    )
  })

  it('checks Rules of its own on Python and Go, read with the grammars it carries', async () => {
    const python = copyOf(pythonShop, {
      '.arch/components.yml':
        'components:\n  cart:\n    paths: [src/shop/cart/**]\n  catalog:\n    paths: [src/shop/catalog/**]\n  pricing:\n    paths: [src/shop/pricing/**]\n',
      '.arch/rules.yml': [
        'rules:',
        '  - id: pricing-not-cart',
        '    why: Pricing is asked by the cart, and knows nothing of it.',
        '    kind: must-not-depend',
        '    from: pricing',
        '    to: [cart]',
        ''
      ].join('\n')
    })
    const fromPython = await adrIn(python, 'check')
    expect([fromPython.code, fromPython.err]).toEqual([1, ''])
    expect(lines(fromPython.out)).toEqual([
      'src/shop/pricing/rules.py:6: pricing-not-cart: pricing must not depend on cart: src/shop/pricing/rules.py:6 imports src/shop/cart/line.py. Pricing is asked by the cart, and knows nothing of it.',
      '',
      'No Decision Log.',
      '1 Violation of 1 Rule.'
    ])

    const go = copyOf(goShop, {
      '.arch/components.yml':
        'components:\n  billing:\n    paths: [billing/**]\n  cart:\n    paths: [cart/**]\n  catalog:\n    paths: [catalog/**]\n  cmd:\n    paths: [cmd/**]\n  web:\n    paths: [web/**]\n',
      '.arch/rules.yml': [
        'rules:',
        '  - id: cart-in-order',
        '    why: Cart and Line should be readable one after the other.',
        '    kind: no-cycles',
        '    inside: [cart]',
        ''
      ].join('\n')
    })
    const fromGo = await adrIn(go, 'check')
    expect([fromGo.code, fromGo.err]).toEqual([1, ''])
    // A name of its own package is a use without an import, as in Java.
    expect(lines(fromGo.out)).toEqual([
      'cart/cart.go:8: cart-in-order: cart/cart.go and cart/line.go depend on each other in a Cycle: cart/cart.go:8 imports cart/line.go. Cart and Line should be readable one after the other.',
      'cart/cart.go:18: cart-in-order: cart/cart.go and cart/line.go depend on each other in a Cycle: cart/cart.go:18 imports cart/line.go. Cart and Line should be readable one after the other.',
      'cart/line.go:21: cart-in-order: cart/cart.go and cart/line.go depend on each other in a Cycle: cart/line.go:21 imports cart/cart.go. Cart and Line should be readable one after the other.',
      '',
      'No Decision Log.',
      '1 Violation of 1 Rule.'
    ])
  })

  it('leaves adr lint as it was: it reads no Rules', async () => {
    expect(await adrIn(shop, 'lint')).toEqual({
      code: 0,
      out: 'No Problems in 1 Decision Log.\n',
      err: ''
    })
  })

  it('ends with 2 when nothing can be checked, and says why on standard error', async () => {
    const empty = copyOf(undefined, { 'README.md': '# Nothing here\n' })
    for (const [args, said] of [
      [['check', empty], /Nothing to check in .*: no Decision Log is found there/],
      [['check', join(empty, 'missing')], /is not a directory/],
      [['check', '--format', 'xml'], /--format/],
      [['check', '--out', empty], /--out and --log are options of adr export/],
      [['check', 'a', 'b'], /one path/]
    ] as const) {
      const { code, out, err } = await adr(...args)
      expect([args, code, out]).toEqual([args, 2, ''])
      expect(err).toMatch(said)
    }
  })

  it('says how it is used with --help', async () => {
    const { code, out } = await adr('check', '--help')
    expect(code).toBe(0)
    expect(out).toContain('adr check [path] [--format text|json|github]')
  })
})

describe('adr check on Rules about Libraries (docs/cli.md)', () => {
  it('prints a Violation of a Rule about a Library at each line that imports it', async () => {
    const page = readFileSync(join(shop, 'src/web/page.ts'), 'utf8')
    const root = shopWith(
      [
        '',
        '  - id: only-persistence-uses-pg',
        '    why: The database is the business of persistence.',
        '    kind: library',
        '    library: pg',
        '    only-in: persistence',
        EXCEPTIONS
      ].join('\n'),
      {
        'src/web/page.ts': page.replace(
          "from '../billing/invoice'\n",
          "from '../billing/invoice'\nimport type { Pool } from 'pg'\nimport { Client } from 'pg'\n"
        ),
        'src/persistence/store.ts': "import { Pool } from 'pg'\n\nexport const pool = new Pool()\n"
      }
    )
    const said = (line: number): string =>
      `web uses pg, which only persistence may use: src/web/page.ts:${line} imports pg. The database is the business of persistence.`
    const { code, out } = await adrIn(root, 'check')
    expect(code).toBe(1)
    expect(lines(out)).toEqual([
      `src/web/page.ts:2: only-persistence-uses-pg: ${said(2)}`,
      `src/web/page.ts:3: only-persistence-uses-pg: ${said(3)}`,
      '',
      'No Problems in 1 Decision Log.',
      '1 Violation of 3 Rules, and 2 accepted as Exceptions.'
    ])
    expect(lines((await adrIn(root, 'check', '--format', 'github')).out)[1]).toBe(
      `::error file=src/web/page.ts,line=3,title=only-persistence-uses-pg::${said(3)}`
    )
    const report = JSON.parse((await adrIn(root, 'check', '--format', 'json')).out)
    expect(
      report.violations.find((violation: { code: string }) => violation.code === 'library')
    ).toEqual({
      code: 'library',
      rule: 'only-persistence-uses-pg',
      message: 'web uses pg, which only persistence may use.',
      why: 'The database is the business of persistence.',
      fingerprint: {
        kind: 'library',
        rule: 'only-persistence-uses-pg',
        component: 'web',
        library: 'pg'
      },
      fingerprintText: 'only-persistence-uses-pg: web uses pg',
      path: 'src/web/page.ts',
      line: 2,
      dependencies: [],
      uses: [
        {
          file: 'src/web/page.ts',
          library: 'pg',
          lines: [2, 3],
          typeOnly: false,
          typeOnlyLines: [2]
        }
      ]
    })
  })

  it('fails on a copy of this repository whose core imports Electron, at the import', async () => {
    const root = copyOf(undefined)
    for (const path of ['.arch', 'package.json', 'pnpm-workspace.yaml', 'tsconfig.base.json']) {
      cpSync(join(repository, path), join(root, path), { recursive: true })
    }
    cpSync(join(repository, 'packages'), join(root, 'packages'), {
      recursive: true,
      filter: (path) => !/[/\\](?:node_modules|dist|out|\.vite)$/.test(path)
    })
    writeFileSync(join(root, 'packages/core/src/window.ts'), "import { app } from 'electron'\n")
    const { code, out, err } = await adrIn(root, 'check', '--format', 'github')
    expect([code, err]).toEqual([1, ''])
    expect(lines(out)[0]).toBe(
      '::error file=packages/core/src/window.ts,line=1,title=only-the-window-uses-electron::core uses electron, which only app may use: packages/core/src/window.ts:1 imports electron. Only the window runs in Electron; the cores, the command line and the MCP server run in Node.js alone, wherever they are copied to.'
    )
    expect(lines(out).at(-1)).toMatch(/^1 Violation of \d+ Rules\.$/)
  }, 30_000)
})
