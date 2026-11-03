import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { devNull, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { run } from '../src/run'

const repository = fileURLToPath(new URL('../../../', import.meta.url))
const shop = fileURLToPath(
  new URL('../../conformance/test/fixtures/layered-shop/', import.meta.url)
)
const mavenShop = fileURLToPath(
  new URL('../../structure/test/fixtures/maven-shop/', import.meta.url)
)
const pythonShop = fileURLToPath(
  new URL('../../structure/test/fixtures/python-shop/', import.meta.url)
)
const goShop = fileURLToPath(new URL('../../structure/test/fixtures/go-shop/', import.meta.url))

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

  it('checks .arch/config.yml once: a file that cannot be read fails', async () => {
    const root = shopWith(EXCEPTIONS, { '.arch/config.yml': '- annotations\n' })
    const { code, out } = await adrIn(root, 'check')
    expect(code).toBe(1)
    expect(lines(out)).toEqual([
      '.arch/config.yml:1: unreadable-config: .arch/config.yml cannot be read: its top level must be a map. What its settings decide is not done until it is fixed.',
      '',
      'No Problems in 1 Decision Log.',
      '1 Problem in .arch/config.yml.',
      '2 Rules hold, but for 2 Violations accepted as Exceptions.'
    ])
  })

  it('says how it is used with --help', async () => {
    const { code, out } = await adr('check', '--help')
    expect(code).toBe(0)
    expect(out).toContain('adr check [path] [--format text|json|github]')
  })
})

describe('adr check of the Annotations (docs/cli.md; docs/plan-vision.md, part 9)', () => {
  // No configuration of the machine's: neither the helpers' git nor the command's sees any.
  beforeAll(() => {
    vi.stubEnv('GIT_CONFIG_GLOBAL', devNull)
    vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1')
  })
  afterAll(() => vi.unstubAllEnvs())

  const CART = [
    'export class Cart {',
    '  private lines: Line[] = []',
    '',
    '  add(line: Line): void {',
    '    this.lines.push(line)',
    '  }',
    '',
    '  total(): number {',
    '    return this.lines.reduce((sum, line) => sum + line.price * line.quantity, 0)',
    '  }',
    '',
    '  count(): number {',
    '    return this.lines.length',
    '  }',
    '}'
  ]
  const ADR =
    '---\nstatus: accepted\ncreated: 2026-11-02\ndecided: 2026-11-02\n---\n\n# Keep the cart in memory\n'
  const DIRECTORY = 'docs/architecture/annotations'

  /** An Annotation on lines `from` to `to` of `src/cart.ts`, quoting them, at `commit`. */
  const annotation = (from: number, to: number, cites: string[], commit: string): string =>
    [
      '---',
      'type: concern',
      'state: open',
      'author: Aylin Demir',
      'date: 2026-11-02',
      'anchor:',
      '  path: src/cart.ts',
      `  lines: ${from}-${to}`,
      `  commit: ${commit}`,
      ...(cites.length > 0 ? ['cites:', ...cites.map((adr) => `  - ${adr}`)] : []),
      '---',
      '',
      '```ts',
      ...CART.slice(from - 1, to),
      '```',
      '',
      'Is this the place for it?',
      ''
    ].join('\n')

  /** A git repository of an example person: the cart, an ADR, and what `files` adds. */
  function repository(files: Record<string, string> = {}): {
    root: string
    git: (...args: string[]) => string
  } {
    const root = copyOf(undefined, {
      'src/cart.ts': `${CART.join('\n')}\n`,
      'docs/adr/0001-keep-the-cart-in-memory.md': ADR,
      ...files
    })
    const git = (...args: string[]): string =>
      execFileSync('git', args, {
        cwd: root,
        encoding: 'utf8',
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: 'Aylin Demir',
          GIT_AUTHOR_EMAIL: 'aylin@example.com',
          GIT_COMMITTER_NAME: 'Aylin Demir',
          GIT_COMMITTER_EMAIL: 'aylin@example.com'
        }
      }).trim()
    git('init', '-q', '-b', 'trunk')
    git('config', 'commit.gpgsign', 'false')
    git('add', '-A')
    git('commit', '-q', '-m', 'The cart')
    return { root, git }
  }

  it('notes an orphaned Annotation, and fails on a Trace to no ADR and on a file it cannot read', async () => {
    const { root, git } = repository()
    const head = git('rev-parse', 'HEAD')
    const write = (name: string, text: string): void =>
      writeFileSync(join(root, DIRECTORY, name), text)
    mkdirSync(join(root, DIRECTORY), { recursive: true })
    write('20261102-the-total.md', annotation(8, 10, ['0001-keep-the-cart-in-memory'], head))
    write('20261102-the-count.md', annotation(12, 14, ['0009-count-lazily'], head))
    write('20261102-broken.md', 'No frontmatter.\n')
    // The total goes: its Annotation is orphaned.
    writeFileSync(
      join(root, 'src/cart.ts'),
      `${[...CART.slice(0, 7), ...CART.slice(11)].join('\n')}\n`
    )
    git('commit', '-q', '-am', 'No total in the cart')

    const at = (name: string): string => `${DIRECTORY}/${name}`
    const { code, out, err } = await adrIn(root, 'check')
    expect([code, err]).toEqual([1, ''])
    expect(lines(out)).toEqual([
      `${at('20261102-broken.md')}: unreadable-annotation: ${at('20261102-broken.md')} cannot be read: it has no frontmatter.`,
      `${at('20261102-the-count.md')}: unknown-adr: ${at('20261102-the-count.md')} cites 0009-count-lazily, which is no ADR of this repository.`,
      `${at('20261102-the-total.md')}: orphaned: 20261102-the-total is orphaned: the quoted lines 8-10 of src/cart.ts are no longer found in it. Attach it again to the lines it is about.`,
      '',
      'No Problems in 1 Decision Log.',
      'No Rules: .arch/rules.yml is not there.',
      '3 Annotations: 2 Problems, 1 orphaned.'
    ])

    const github = lines((await adrIn(root, 'check', '--format', 'github')).out)
    expect(github.slice(0, 3).map((line) => line.split(' ')[0])).toEqual([
      '::error',
      '::error',
      '::notice'
    ])
    expect(github[2]).toMatch(
      /^::notice file=docs\/architecture\/annotations\/20261102-the-total\.md,title=orphaned::/
    )

    const report = JSON.parse((await adrIn(root, 'check', '--format', 'json')).out)
    expect(report.annotations).toEqual({ directory: DIRECTORY, count: 3 })
    expect(
      report.problems.map((one: { module: string; code: string }) => [one.module, one.code])
    ).toEqual([
      ['review', 'unreadable-annotation'],
      ['review', 'unknown-adr']
    ])
    expect(report.notes).toEqual([
      expect.objectContaining({
        module: 'review',
        code: 'orphaned',
        path: at('20261102-the-total.md'),
        note: expect.objectContaining({ annotation: '20261102-the-total', file: 'there' })
      })
    ])

    // Once the Problems are repaired, the orphaned Annotation alone fails nothing.
    rmSync(join(root, DIRECTORY, '20261102-broken.md'))
    write('20261102-the-count.md', annotation(12, 14, [], head))
    expect(await adrIn(root, 'check')).toEqual({
      code: 0,
      out: [
        `${at('20261102-the-total.md')}: orphaned: 20261102-the-total is orphaned: the quoted lines 8-10 of src/cart.ts are no longer found in it. Attach it again to the lines it is about.`,
        '',
        'No Problems in 1 Decision Log.',
        'No Rules: .arch/rules.yml is not there.',
        '2 Annotations: no Problem, 1 orphaned.',
        ''
      ].join('\n'),
      err: ''
    })
  })

  it('finds a moved Annotation, which is no Problem, and checks a repository of Annotations alone', async () => {
    const { root, git } = repository()
    const head = git('rev-parse', 'HEAD')
    rmSync(join(root, 'docs/adr'), { recursive: true })
    mkdirSync(join(root, DIRECTORY), { recursive: true })
    writeFileSync(join(root, DIRECTORY, '20261102-the-count.md'), annotation(12, 14, [], head))
    // Two lines above the count: it moves to 14-16.
    writeFileSync(
      join(root, 'src/cart.ts'),
      `${['// The cart of a session.', '', ...CART].join('\n')}\n`
    )
    git('commit', '-q', '-am', 'Say what the cart is')
    expect(await adrIn(root, 'check')).toEqual({
      code: 0,
      out: 'No Decision Log.\nNo Rules: .arch/rules.yml is not there.\n1 Annotation: no Problem, none orphaned.\n',
      err: ''
    })
  })

  it('reads no Annotation while "annotations" is no directory inside the repository', async () => {
    const { root } = repository({ '.arch/config.yml': 'annotations: ../elsewhere\n' })
    const { code, out } = await adrIn(root, 'check')
    expect(code).toBe(1)
    expect(lines(out)[0]).toMatch(/^\.arch\/config\.yml:1: invalid-annotations-directory: /)
    expect(lines(out).at(-1)).toBe('No Annotation is read: 1 Problem in .arch/config.yml.')
  })
})
