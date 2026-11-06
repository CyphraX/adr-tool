import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { libraryNotes, libraryTools } from '../src/libraries'
import { Refusal } from '../src/protocol'

// docs/mcp.md, "list_libraries"; docs/structure-format.md, section 3, "The Library inventory".

const repository = fileURLToPath(new URL('../../../', import.meta.url))

const scratch: string[] = []
afterAll(() => scratch.forEach((dir) => rmSync(dir, { recursive: true, force: true })))

/** A repository on disk of `files` (path → text). */
function repositoryOf(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'adr-mcp-libraries-'))
  scratch.push(root)
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  return root
}

const list = (root: string, input: Record<string, unknown> = {}) =>
  libraryTools({ root })
    .find((tool) => tool.name === 'list_libraries')!
    .run(input)

const shop = repositoryOf({
  '.arch/components.yml': [
    'components:',
    '  web:',
    '    paths: [packages/web/**]',
    '  core:',
    '    paths: [packages/core/**]',
    ''
  ].join('\n'),
  'package.json': JSON.stringify({ name: 'shop', private: true }),
  'packages/web/package.json': JSON.stringify(
    { name: '@shop/web', dependencies: { react: '^19.0.0', 'left-pad': '^1.3.0' } },
    null,
    2
  ),
  'packages/web/src/app.ts': "import { createElement } from 'react'\nimport { z } from 'zod'\n",
  'packages/core/package.json': JSON.stringify({ name: '@shop/core' }),
  'packages/core/src/cart.ts': "export const cart = 'cart'\n",
  'packages/web/node_modules/react/package.json': JSON.stringify({
    name: 'react',
    version: '19.1.0',
    license: 'MIT'
  }),
  'requirements.txt': 'requests==2.32.3\n',
  'tools/seed.py': 'import requests\n'
})

describe('list_libraries (docs/mcp.md)', () => {
  it('lists every Library of the repository with its status, versions, users and licence', async () => {
    const result = await list(shop)
    expect(result.origin).toBe('declared')
    expect(result.counts).toEqual({
      libraries: 4,
      used: 2,
      unused: 1,
      undeclared: 1,
      licenceUnknown: 3
    })
    expect(result.libraries).toEqual([
      {
        name: 'left-pad',
        ecosystem: 'npm',
        status: 'unused',
        versions: ['^1.3.0'],
        imports: ['left-pad'],
        mapping: 'same',
        declared: [
          {
            manifest: 'packages/web/package.json',
            line: 5,
            version: '^1.3.0',
            component: 'web'
          }
        ],
        usedBy: [],
        licence: { kind: 'unknown', reason: 'not-installed' }
      },
      {
        name: 'react',
        ecosystem: 'npm',
        status: 'used',
        versions: ['^19.0.0'],
        imports: ['react'],
        mapping: 'same',
        declared: [
          {
            manifest: 'packages/web/package.json',
            line: 4,
            version: '^19.0.0',
            component: 'web'
          }
        ],
        usedBy: [
          {
            component: 'web',
            files: ['packages/web/src/app.ts'],
            fileCount: 1,
            testOnly: false,
            undeclared: [],
            undeclaredCount: 0
          }
        ],
        installed: { path: 'packages/web/node_modules/react', version: '19.1.0' },
        licence: {
          kind: 'declared',
          licence: 'MIT',
          field: 'license',
          source: 'packages/web/node_modules/react/package.json'
        }
      },
      {
        name: 'requests',
        ecosystem: 'python',
        status: 'used',
        versions: ['==2.32.3'],
        imports: ['requests'],
        mapping: 'normalised',
        declared: [{ manifest: 'requirements.txt', line: 1, version: '==2.32.3' }],
        usedBy: [
          {
            component: '(unassigned)',
            files: ['tools/seed.py'],
            fileCount: 1,
            testOnly: false,
            undeclared: [],
            undeclaredCount: 0
          }
        ],
        licence: { kind: 'unknown', reason: 'not-installed' }
      },
      expect.objectContaining({
        name: 'zod',
        status: 'undeclared',
        versions: [],
        declared: [],
        usedBy: [
          expect.objectContaining({ component: 'web', undeclared: ['packages/web/src/app.ts'] })
        ]
      })
    ])
    // The name of requests is taken as its import name: said as a guess.
    expect(result.notes).toEqual([
      expect.stringMatching(/^A Library whose mapping is "normalised"/)
    ])
  })

  it('lists the Libraries of one Component, and refuses a Component that is not declared', async () => {
    const result = await list(shop, { component: 'web' })
    expect(result.component).toBe('web')
    expect((result.libraries as { name: string }[]).map((library) => library.name)).toEqual([
      'left-pad',
      'react',
      'zod'
    ])
    expect(await list(shop, { component: 'core' })).toMatchObject({ libraries: [] })
    await expect(list(shop, { component: 'billing' })).rejects.toThrow(
      new Refusal('There is no Component billing. list_components names the Components there are.')
    )
    await expect(list(shop, { component: '' })).rejects.toThrow(
      new Refusal(
        'component is empty. Leave it out for the whole repository, or name a Component that list_components lists.'
      )
    )
  })

  it('refuses a Component it does not know before it reads the code', async () => {
    // Code that takes seconds to read: refused at once all the same.
    const code = (at: number) =>
      Array.from(
        { length: 4000 },
        (_, n) =>
          `import { a${n} } from './f${(at + 1) % 20}'\nexport const g${n} = (x: number) => a${n}(x)\n`
      ).join('')
    const root = repositoryOf({
      '.arch/components.yml': 'components:\n  web:\n    paths: [src/**]\n',
      ...Object.fromEntries(Array.from({ length: 20 }, (_, at) => [`src/f${at}.ts`, code(at)]))
    })
    const started = Date.now()
    await expect(list(root, { component: 'billing' })).rejects.toThrow(
      new Refusal('There is no Component billing. list_components names the Components there are.')
    )
    expect(Date.now() - started).toBeLessThan(2000)
  })

  it('says which manifest it could not read', () => {
    expect(
      libraryNotes(
        [],
        [{ manifest: 'pom.xml', message: 'It is nested too deeply for its reader.' }]
      )
    ).toEqual([
      'pom.xml could not be read and declares nothing here: It is nested too deeply for its reader.'
    ])
  })

  it('reads every manifest the review found to stop the analysis (PR #60)', async () => {
    const root = repositoryOf({
      'package.json': JSON.stringify({ name: 'shop', dependencies: { react: '^19' } }),
      'pom.xml':
        '<project><groupId>&#x110000;</groupId><dependencies>' +
        '<a>'.repeat(50_000) +
        '</b>'.repeat(50_000) +
        '</dependencies></project>',
      'gradle/libs.versions.toml': '[versions]\na = { ref = "b" }\nb = { ref = "a" }\n',
      'build.gradle': "dependencies { implementation 'x:y:1' }\n",
      'src/app.ts': "import 'react'\n"
    })
    const result = await list(root)
    expect((result.libraries as { name: string }[]).map((library) => library.name)).toEqual([
      'react',
      'x:y'
    ])
  })

  it('reads no licence through a link out of the repository, which it names, nor one larger than its limit', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'adr-mcp-outside-'))
    scratch.push(outside)
    writeFileSync(
      join(outside, 'package.json'),
      JSON.stringify({ name: 'react', version: '19.1.0', license: 'MIT' })
    )
    const root = repositoryOf({
      'package.json': JSON.stringify({
        name: 'shop',
        dependencies: { react: '^19.0.0', big: '1' }
      }),
      'src/app.ts': "import 'react'\nimport 'big'\n",
      'node_modules/big/package.json': JSON.stringify({
        name: 'big',
        license: 'MIT',
        padding: 'x'.repeat(1024 * 1024)
      })
    })
    symlinkSync(outside, join(root, 'node_modules/react'))
    const libraries = (await list(root)).libraries as Record<string, unknown>[]
    // Installed through a link that leads out: there, and not read.
    const react = libraries.find((library) => library.name === 'react')!
    expect(react.installed).toEqual({ path: 'node_modules/react' })
    expect(react.licence).toEqual({ kind: 'unknown', reason: 'outside' })
    expect(libraries.find((library) => library.name === 'big')).toMatchObject({
      installed: { path: 'node_modules/big' },
      licence: { kind: 'unknown', reason: 'unreadable' }
    })
  })

  it('names the Libraries of this repository that only the window uses, and their licences', async () => {
    const result = await list(repository, { component: 'app' })
    const electron = (result.libraries as Record<string, unknown>[]).find(
      (library) => library.name === 'electron'
    )
    expect(electron).toMatchObject({
      status: 'used',
      usedBy: [{ component: 'app/main' }, { component: 'app/preload' }],
      licence: { kind: 'declared', licence: 'MIT' }
    })
  }, 60_000)
})
