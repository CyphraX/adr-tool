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
  })

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
      '.arch/rules.yml:15: unmatched-exception: The Exception billing-not-web: billing -> web matches no Violation: the Violation is gone. Remove the Exception.',
      '.arch/rules.yml:20: unmatched-exception: The Exception layered: billing -> web matches no Violation: the Violation is gone. Remove the Exception.',
      '',
      'No Problems in 1 Decision Log.',
      '2 Rules hold; 2 Problems in .arch/rules.yml.'
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
      ".arch/rules.yml:14: unknown-rule-kind: The Rule no-kind has no kind. A Rule's kind is one of must-not-depend, may-only-depend, layers, no-cycles, threshold."
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
