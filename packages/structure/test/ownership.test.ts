import { describe, expect, it } from 'vitest'
import { readDeclaration } from '../src/declaration'
import { assign } from '../src/ownership'
import { sourceFilesAmong } from '../src/source-files'

function ownership(declaration: string, files: string[]) {
  const read = readDeclaration(declaration)
  if (read.kind !== 'declared') throw new Error(`not declared: ${JSON.stringify(read)}`)
  const result = assign(read.components, sourceFilesAmong(files))
  return {
    owners: Object.fromEntries(result.sourceFiles.map((file) => [file.path, file.component])),
    tests: result.sourceFiles.filter((file) => file.test).map((file) => file.path),
    problems: result.problems
  }
}

const NESTED = `
components:
  core:
    paths: [packages/core/**]
    components:
      metadata:
        paths: [packages/core/src/metadata/**]
        components:
          write:
            paths: [packages/core/src/metadata/write.ts]
  app:
    paths: [packages/app/**]
`

describe('who owns a Source File (docs/structure-format.md, section 1)', () => {
  it('is the descendant, however deep, where a Component and its descendant both claim it', () => {
    const { owners, problems } = ownership(NESTED, [
      'packages/core/src/index.ts',
      'packages/core/src/metadata/read.ts',
      'packages/core/src/metadata/write.ts',
      'packages/app/src/main.ts',
      'scripts/release.mjs'
    ])
    expect(owners).toEqual({
      'packages/core/src/index.ts': 'core',
      'packages/core/src/metadata/read.ts': 'core/metadata',
      'packages/core/src/metadata/write.ts': 'core/metadata/write',
      'packages/app/src/main.ts': 'app',
      // No Component claims it: Unassigned, which is a state and not a Problem.
      'scripts/release.mjs': undefined
    })
    expect(problems).toEqual([])
  })

  it('does not need the parent to claim what its child claims', () => {
    const { owners, problems } = ownership(
      'components:\n  ui:\n    components:\n      views:\n        paths: [src/views/**]\n',
      ['src/views/a.ts', 'src/other.ts']
    )
    expect(owners).toEqual({ 'src/views/a.ts': 'ui/views', 'src/other.ts': undefined })
    expect(problems).toEqual([])
  })

  it('is nobody where two Components that are no ancestors of each other claim it, and that is a Problem', () => {
    const { owners, problems } = ownership(
      `
components:
  shop:
    paths: [src/**]
    components:
      cart:
        paths: [src/cart/**]
      pricing:
        paths: [src/cart/price*.ts, src/pricing/**]
  tools:
    paths: [src/cart/price-tool.ts, tools/**]
`,
      [
        'src/cart/cart.ts',
        'src/cart/price.ts',
        'src/cart/price-tool.ts',
        'src/pricing/a.ts',
        'tools/x.ts'
      ]
    )
    expect(owners).toMatchObject({
      'src/cart/cart.ts': 'shop/cart',
      'src/cart/price.ts': undefined,
      'src/cart/price-tool.ts': undefined,
      'src/pricing/a.ts': 'shop/pricing'
    })
    expect(problems).toEqual([
      {
        kind: 'overlapping-components',
        components: ['shop/cart', 'shop/pricing'],
        files: ['src/cart/price-tool.ts', 'src/cart/price.ts']
      },
      // `shop` claims the file too, but its descendants stand in for it.
      {
        kind: 'overlapping-components',
        components: ['shop/cart', 'tools'],
        files: ['src/cart/price-tool.ts']
      },
      {
        kind: 'overlapping-components',
        components: ['shop/pricing', 'tools'],
        files: ['src/cart/price-tool.ts']
      }
    ])
  })
})

describe('patterns that meet the files', () => {
  it('are a Problem when they match no Source File — but not the ones that begin with !', () => {
    const { problems } = ownership(
      `
components:
  core:
    paths: [src/**, lib/**, '!src/generated/**', docs/**]
    tests: [checks/**]
`,
      ['src/a.ts', 'docs/readme.md']
    )
    expect(problems).toEqual([
      { kind: 'dead-pattern', component: 'core', key: 'paths', pattern: 'lib/**' },
      // docs/ has files, but no Source File: a pattern cannot make one.
      { kind: 'dead-pattern', component: 'core', key: 'paths', pattern: 'docs/**' },
      { kind: 'dead-pattern', component: 'core', key: 'tests', pattern: 'checks/**' }
    ])
  })

  it('are a Problem when they are absolute or leave the repository, and match nothing', () => {
    const { owners, problems } = ownership(
      "components:\n  core:\n    paths: ['../other/**', /abs/**, src/**]\n",
      ['src/a.ts']
    )
    expect(owners).toEqual({ 'src/a.ts': 'core' })
    expect(problems).toEqual([
      {
        kind: 'pattern-outside-repository',
        component: 'core',
        key: 'paths',
        pattern: '../other/**'
      },
      { kind: 'pattern-outside-repository', component: 'core', key: 'paths', pattern: '/abs/**' }
    ])
  })
})

describe('the tests key', () => {
  it('marks Source Files that the Component contains, and claims none', () => {
    const { owners, tests } = ownership(
      `
components:
  core:
    paths: [src/**]
    tests: [src/checks/**, elsewhere/checks/**]
    components:
      io:
        paths: [src/io/**]
  other:
    paths: [elsewhere/**]
`,
      [
        'src/a.ts',
        'src/checks/a.ts',
        'src/io/checks.ts',
        'src/io/a.test.ts',
        'elsewhere/checks/b.ts'
      ]
    )
    // Marked: by the pattern of the Component that contains it, and by convention.
    expect(tests).toEqual(['src/checks/a.ts', 'src/io/a.test.ts'])
    // `elsewhere/checks/b.ts` is matched by core's pattern but contained in `other`.
    expect(owners['elsewhere/checks/b.ts']).toBe('other')
  })

  it('of an ancestor marks what a descendant owns', () => {
    const { tests } = ownership(
      'components:\n  core:\n    paths: [src/**]\n    tests: [src/io/checks/**]\n    components:\n      io:\n        paths: [src/io/**]\n',
      ['src/io/checks/a.ts']
    )
    expect(tests).toEqual(['src/io/checks/a.ts'])
  })
})
