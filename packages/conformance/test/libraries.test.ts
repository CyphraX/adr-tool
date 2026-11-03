import { describe, expect, it } from 'vitest'
import { applyEdits } from '@adr-tool/kernel'
import { fingerprintText, libraryMatcher, readRules, sentenceAtUse, wordingOf } from '../src'
import { renameInRules } from '../src/rename'
import { checked, yaml } from './repository'

/** A shop whose persistence uses `pg`, as do a page of the web, a test and a script. */
const shop: Record<string, string> = {
  '.arch/components.yml': yaml(
    'components:',
    '  web:',
    '    paths: [src/web/**]',
    '  persistence:',
    '    paths: [src/persistence/**]',
    '    components:',
    '      pg:',
    '        paths: [src/persistence/pg/**]',
    '      cache:',
    '        paths: [src/persistence/cache/**]'
  ),
  'src/web/page.ts': yaml(
    "import { format } from 'date-fns'",
    "import type { Pool } from 'pg'",
    "import { Client } from 'pg'",
    "import { EditorState } from '@codemirror/state'"
  ),
  'src/web/page.test.ts': "import { Client } from 'pg'\n",
  'src/persistence/db.ts': "import { Pool } from 'pg'\n",
  'src/persistence/pg/pool.ts': "import { Pool } from 'pg'\nimport pgCursor from 'pg-cursor'\n",
  'src/persistence/cache/lru.ts': "import { Pool } from 'pg'\n",
  'scripts/seed.ts': "import { Client } from 'pg'\n"
}

const rules = (...lines: string[]): string =>
  yaml(
    'rules:',
    '  - id: only-persistence-uses-pg',
    '    why: The database is the business of persistence.',
    ...lines.map((line) => `    ${line}`)
  )

/** What each Violation is about, and the uses behind it. */
const found = (report: Awaited<ReturnType<typeof checked>>) =>
  report.violations.map((violation) => ({
    fingerprint: fingerprintText(violation.fingerprint),
    uses: violation.uses?.map((use) => `${use.file}:${use.lines.join(',')}`),
    ...(violation.exception && { accepted: true })
  }))

describe('library (docs/conformance-format.md, section 2)', () => {
  it('finds every Component but those allowed that uses a Library, at the lines of its imports', async () => {
    const report = await checked(
      shop,
      rules('kind: library', 'library: pg', 'only-in: [persistence]')
    )
    expect(report.problems).toEqual([])
    expect(found(report)).toEqual([
      // A file of no Component cannot have been allowed.
      {
        fingerprint: 'only-persistence-uses-pg: (unassigned) uses pg',
        uses: ['scripts/seed.ts:1']
      },
      { fingerprint: 'only-persistence-uses-pg: web uses pg', uses: ['src/web/page.ts:2,3'] }
    ])
    const [unassigned, web] = report.violations
    expect(sentenceAtUse(web!, web!.uses![0]!, 3)).toBe(
      'web uses pg, which only persistence may use: src/web/page.ts:3 imports pg.'
    )
    expect(sentenceAtUse(unassigned!, unassigned!.uses![0]!)).toBe(
      'Source Files that belong to no Component use pg, which only persistence may use: scripts/seed.ts:1 imports pg.'
    )
  })

  it('takes test files in, and leaves type-only uses out, where the Rule says so', async () => {
    const report = await checked(
      shop,
      rules(
        'kind: library',
        'library: pg',
        'only-in: persistence',
        'tests: included',
        'type-only: ignored'
      )
    )
    expect(found(report)).toEqual([
      {
        fingerprint: 'only-persistence-uses-pg: (unassigned) uses pg',
        uses: ['scripts/seed.ts:1']
      },
      {
        fingerprint: 'only-persistence-uses-pg: web uses pg',
        uses: ['src/web/page.test.ts:1', 'src/web/page.ts:3']
      }
    ])
  })

  it('stands at the Component below the allowed one where the chains part, or at the owner', async () => {
    const report = await checked(
      shop,
      rules('kind: library', 'library: pg', 'only-in: persistence/pg')
    )
    expect(found(report)).toEqual([
      {
        fingerprint: 'only-persistence-uses-pg: (unassigned) uses pg',
        uses: ['scripts/seed.ts:1']
      },
      // persistence holds the allowed child: the use in its own files stands at it.
      {
        fingerprint: 'only-persistence-uses-pg: persistence uses pg',
        uses: ['src/persistence/db.ts:1']
      },
      {
        fingerprint: 'only-persistence-uses-pg: persistence/cache uses pg',
        uses: ['src/persistence/cache/lru.ts:1']
      },
      { fingerprint: 'only-persistence-uses-pg: web uses pg', uses: ['src/web/page.ts:2,3'] }
    ])
  })

  it('forbids a Library to the Components named, with Library patterns, at the outermost one', async () => {
    const report = await checked(
      shop,
      rules('kind: library', "library: ['pg*', '@codemirror/*']", 'not-in: [web, persistence/**]')
    )
    expect(found(report)).toEqual([
      {
        fingerprint: 'only-persistence-uses-pg: persistence uses pg',
        uses: [
          'src/persistence/cache/lru.ts:1',
          'src/persistence/db.ts:1',
          'src/persistence/pg/pool.ts:1'
        ]
      },
      {
        fingerprint: 'only-persistence-uses-pg: persistence uses pg-cursor',
        uses: ['src/persistence/pg/pool.ts:2']
      },
      {
        fingerprint: 'only-persistence-uses-pg: web uses @codemirror/state',
        uses: ['src/web/page.ts:4']
      },
      { fingerprint: 'only-persistence-uses-pg: web uses pg', uses: ['src/web/page.ts:2,3'] }
    ])
    expect(sentenceAtUse(report.violations[2]!, report.violations[2]!.uses![0]!)).toBe(
      'web must not use @codemirror/state: src/web/page.ts:4 imports @codemirror/state.'
    )
  })

  it('accepts a Violation by an Exception that names its Component and Library', async () => {
    const report = await checked(
      shop,
      yaml(
        rules('kind: library', 'library: pg', 'only-in: persistence'),
        'exceptions:',
        '  - rule: only-persistence-uses-pg',
        '    component: web',
        '    library: pg',
        '    reason: The page shows the state of the pool until it has a port.',
        '  - rule: only-persistence-uses-pg',
        '    component: web',
        '    library: mysql',
        '    reason: Nothing.',
        '  - rule: only-persistence-uses-pg',
        '    from: web',
        '    to: persistence',
        '    reason: The wrong keys.'
      )
    )
    expect(found(report)).toEqual([
      {
        fingerprint: 'only-persistence-uses-pg: (unassigned) uses pg',
        uses: ['scripts/seed.ts:1']
      },
      {
        fingerprint: 'only-persistence-uses-pg: web uses pg',
        uses: ['src/web/page.ts:2,3'],
        accepted: true
      }
    ])
    expect(report.problems.map(wordingOf)).toEqual([
      'The Exception only-persistence-uses-pg: web uses mysql matches no Violation any more. Remove it, or name the Violation as it is now.',
      'An Exception from the Rule only-persistence-uses-pg cannot be read: an Exception from a Rule of the kind library names its Violation by "component" and "library".'
    ])
  })

  it('names what is wrong with the form of the Rule, and a Component it names that is not declared', async () => {
    const report = await checked(
      shop,
      yaml(
        'rules:',
        '  - id: no-library',
        '    why: W.',
        '    kind: library',
        '    only-in: web',
        '  - id: both',
        '    why: W.',
        '    kind: library',
        '    library: pg',
        '    only-in: web',
        '    not-in: persistence',
        '  - id: empty',
        '    why: W.',
        '    kind: library',
        '    library: []',
        '    not-in: web',
        '  - id: unknown',
        '    why: W.',
        '    kind: library',
        '    library: pg',
        '    only-in: [persistance]'
      )
    )
    expect(report.problems.map(wordingOf)).toEqual([
      'The Rule no-library cannot be checked: it has no "library".',
      'The Rule both cannot be checked: it must have either "only-in" or "not-in".',
      'The Rule empty cannot be checked: "library" must be the name of a Library as the code uses it, or a pattern, or a list of them.',
      'The Rule unknown names persistance in only-in, which is not a declared Component.'
    ])
  })

  it('is rewritten by a Rename where it names Components, never where it names a Library', () => {
    const text = yaml(
      'rules:',
      '  - id: only-persistence-uses-pg',
      '    why: W.',
      '    kind: library',
      '    library: [persistence, pg]',
      '    only-in: [persistence/**]',
      '  - id: not-in-web',
      '    why: W.',
      '    kind: library',
      '    library: persistence',
      "    not-in: 'persistence'",
      'exceptions:',
      '  - rule: only-persistence-uses-pg',
      '    component: persistence',
      '    library: persistence',
      '    reason: R.'
    )
    const renamed = applyEdits(text, renameInRules(text, 'persistence', 'storage'))
    expect(renamed).toBe(
      text
        .replace('only-in: [persistence/**]', 'only-in: [storage/**]')
        .replace("not-in: 'persistence'", "not-in: 'storage'")
        .replace('component: persistence', 'component: storage')
    )
    expect(readRules(renamed).problems).toEqual([])
  })
})

describe('Library patterns (docs/conformance-format.md, section 2, "library")', () => {
  it('match a name exactly, or segment by segment with * and **, where / and . separate', () => {
    const matches = libraryMatcher([
      'pg',
      '@codemirror/*',
      'org.apache.**',
      'github.com/aws/**',
      'lodash*'
    ])
    for (const name of [
      'pg',
      '@codemirror/state',
      'org.apache',
      'org.apache.commons.io',
      'github.com/aws/aws-sdk-go',
      'lodash',
      'lodash-es'
    ]) {
      expect(matches(name), name).toBe(true)
    }
    for (const name of [
      'pg-cursor',
      '@codemirror/state/x',
      'org.apachex',
      'github.com/awslabs/x',
      'xlodash'
    ]) {
      expect(matches(name), name).toBe(false)
    }
  })

  it('take no more time than the product of a pattern and a name, whatever the pattern', () => {
    const pattern = Array.from({ length: 40 }, () => '**/a*a*a*a*').join('/') + '/b'
    const name = Array.from({ length: 200 }, () => 'aaaaaaaaaaaaaaaaaaaa').join('/')
    const started = performance.now()
    expect(libraryMatcher([pattern])(name)).toBe(false)
    expect(performance.now() - started).toBeLessThan(1000)
  })
})
