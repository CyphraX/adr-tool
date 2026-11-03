import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { memoryFileSystem } from '@adr-tool/kernel'
import {
  analyseDependencies,
  extractorOf,
  openStructure,
  prepareGo,
  prepareJava,
  preparePython
} from '../src'
import type { LibraryUse } from '../src/dependencies'
import { librariesIn, libraryInventory } from '../src/libraries/inventory'
import { manifestLibraries } from '../src/manifests'
import type { OwnedSourceFile } from '../src/ownership'
import { languageOf, isTestByConvention } from '../src/source-files'
import { nodeFileSystem, repositoryFiles } from './repository-files'

/** A repository in memory: its files, who owns which Source File, and what each one uses. */
async function inventoryOf(
  files: Record<string, string>,
  owners: Record<string, string | undefined>,
  uses: Record<string, string[] | [string, number[]][]>
) {
  const fs = memoryFileSystem(files)
  const sourceFiles: OwnedSourceFile[] = Object.entries(owners).map(([path, component]) => ({
    path,
    language: languageOf(path)!,
    test: isTestByConvention(path),
    component
  }))
  const libraries: LibraryUse[] = Object.entries(uses).flatMap(([file, used]) =>
    used.map((library) =>
      typeof library === 'string'
        ? { file, library, lines: [1], typeOnly: false }
        : { file, library: library[0], lines: library[1], typeOnly: false }
    )
  )
  const manifests = await manifestLibraries(fs, Object.keys(files))
  return (await libraryInventory(fs, Object.keys(files), { sourceFiles }, { libraries, manifests }))
    .libraries
}

/** A row of the inventory as a person reads it. */
const row = (library: Awaited<ReturnType<typeof inventoryOf>>[number]) => ({
  name: library.name,
  versions: library.declared.map(
    (declaration) => `${declaration.manifest}:${declaration.version ?? ''}`
  ),
  mapping: library.mapping,
  usedBy: library.usedBy.map(
    (user) =>
      `${user.component ?? '(unassigned)'} ${user.files.length}${user.testOnly ? ' tests' : ''}${user.undeclared.length > 0 ? ` undeclared ${user.undeclared.length}` : ''}`
  ),
  licence:
    library.licence.kind === 'declared'
      ? `${library.licence.licence} (${library.licence.field})`
      : library.licence.kind === 'file'
        ? `file ${library.licence.source}`
        : library.licence.reason
})

describe('the Library inventory (docs/structure-format.md, section 3, "The Library inventory")', () => {
  it('joins npm packages declared and used per Component, with versions and installed licences', async () => {
    const libraries = await inventoryOf(
      {
        'package.json': JSON.stringify({
          name: 'shop',
          workspaces: ['packages/*'],
          devDependencies: { vitest: '^5', '@types/react': '^19' }
        }),
        'packages/web/package.json': JSON.stringify({
          name: '@shop/web',
          dependencies: {
            react: '^19.0.0',
            lodash: '^4.17.21',
            'left-pad': '^1',
            '@shop/core': 'workspace:*'
          }
        }),
        'packages/core/package.json': JSON.stringify({ name: '@shop/core' }),
        'node_modules/react/package.json': JSON.stringify({ version: '19.1.0', license: 'MIT' }),
        'node_modules/vitest/package.json': JSON.stringify({ version: '5.0.1' }),
        'packages/web/node_modules/lodash/package.json': JSON.stringify({
          version: '4.17.21',
          licenses: [{ type: 'MIT' }]
        }),
        'node_modules/@types/react/package.json': JSON.stringify({ license: 'MIT' }),
        'node_modules/zod/package.json': '{ "license": ',
        'packages/web/src/app.tsx': '',
        'packages/core/src/cart.ts': '',
        'packages/core/test/cart.test.ts': '',
        'scripts/build.mjs': ''
      },
      {
        'packages/web/src/app.tsx': 'web',
        'packages/core/src/cart.ts': 'core',
        'packages/core/test/cart.test.ts': 'core',
        'scripts/build.mjs': undefined
      },
      {
        'packages/web/src/app.tsx': ['react', 'lodash', 'zod'],
        'packages/core/src/cart.ts': ['lodash'],
        'packages/core/test/cart.test.ts': ['vitest'],
        'scripts/build.mjs': ['zod']
      }
    )
    expect(libraries.map(row)).toEqual([
      {
        name: '@types/react',
        versions: ['package.json:^19'],
        mapping: 'same',
        usedBy: ['web 1'],
        licence: 'MIT (license)'
      },
      {
        name: 'left-pad',
        versions: ['packages/web/package.json:^1'],
        mapping: 'same',
        usedBy: [],
        licence: 'not-installed'
      },
      {
        name: 'lodash',
        versions: ['packages/web/package.json:^4.17.21'],
        mapping: 'same',
        // core uses it, and nothing above core declares it: it is found through the workspace.
        usedBy: ['core 1 undeclared 1', 'web 1'],
        licence: 'MIT (licenses)'
      },
      {
        name: 'react',
        versions: ['packages/web/package.json:^19.0.0'],
        mapping: 'same',
        usedBy: ['web 1'],
        licence: 'MIT (license)'
      },
      {
        name: 'vitest',
        versions: ['package.json:^5'],
        mapping: 'same',
        usedBy: ['core 1 tests'],
        licence: 'not-declared'
      },
      {
        name: 'zod',
        versions: [],
        mapping: undefined,
        usedBy: ['web 1 undeclared 1', '(unassigned) 1 undeclared 1'],
        licence: 'unreadable'
      }
    ])
    // The manifest of a package belongs to the Component that holds its code; the root's to none.
    const declaration = (name: string) =>
      libraries.find((library) => library.name === name)!.declared[0]
    expect(declaration('react')).toMatchObject({ component: 'web', line: 1 })
    expect(declaration('vitest')).not.toHaveProperty('component')
    expect(libraries.find((library) => library.name === 'react')!.installed).toEqual({
      path: 'node_modules/react',
      version: '19.1.0'
    })

    // Seen from the repository, from a Component, and from a Component that declares nothing.
    const scoped = (component?: string) =>
      librariesIn({ libraries }, component).map(
        (one) =>
          `${one.library.name} ${one.status} ${one.versions.join(',')} ${one.declared.length}/${one.usedBy.length}`
      )
    expect(scoped()).toEqual([
      '@types/react used ^19 1/1',
      'left-pad unused ^1 1/0',
      'lodash undeclared ^4.17.21 1/2',
      'react used ^19.0.0 1/1',
      'vitest used ^5 1/1',
      'zod undeclared  0/2'
    ])
    expect(scoped('web')).toEqual([
      '@types/react used ^19 0/1',
      'left-pad unused ^1 1/0',
      'lodash used ^4.17.21 1/1',
      'react used ^19.0.0 1/1',
      'zod undeclared  0/1'
    ])
    expect(scoped('core')).toEqual(['lodash undeclared ^4.17.21 0/1', 'vitest used ^5 0/1'])
  })

  it('maps Python distributions by what a virtual environment of the repository installs, the table, or the normalised name', async () => {
    const site = '.venv/lib/python3.12/site-packages'
    const libraries = await inventoryOf(
      {
        'pyproject.toml': [
          '[project]',
          'dependencies = ["PyYAML>=6", "requests", "beautifulsoup4", "typing-extensions", "bar.baz"]'
        ].join('\n'),
        [`${site}/PyYAML-6.0.2.dist-info/METADATA`]:
          'Metadata-Version: 2.1\nName: PyYAML\nVersion: 6.0.2\nLicense: MIT\n\nThe long description.\nLicense: no header\n',
        [`${site}/PyYAML-6.0.2.dist-info/top_level.txt`]: '_yaml\nyaml\n',
        [`${site}/requests-2.32.3.dist-info/METADATA`]:
          'Name: requests\nVersion: 2.32.3\nLicense-Expression: Apache-2.0\nClassifier: License :: OSI Approved :: Apache Software License\n',
        [`${site}/requests-2.32.3.dist-info/RECORD`]:
          'requests/__init__.py,sha256=x,100\nrequests-2.32.3.dist-info/METADATA,,\n../../bin/x,,\n',
        [`${site}/numpy-2.1.0.dist-info/METADATA`]:
          'Name: numpy\nVersion: 2.1.0\nLicense: UNKNOWN\nClassifier: License :: OSI Approved :: BSD License\n',
        [`${site}/numpy-2.1.0.dist-info/RECORD`]: 'numpy/__init__.py,,\n',
        [`${site}/six-1.16.0.dist-info/METADATA`]: 'Name: six\nVersion: 1.16.0\n',
        [`${site}/six-1.16.0.dist-info/LICENSE`]: 'Copyright …',
        [`${site}/six-1.16.0.dist-info/RECORD`]: 'six.py,,\n',
        'src/shop/app.py': '',
        'src/shop/util.py': ''
      },
      { 'src/shop/app.py': 'shop', 'src/shop/util.py': 'shop' },
      {
        'src/shop/app.py': ['yaml', 'requests', 'bs4', 'typing_extensions', 'numpy'],
        'src/shop/util.py': ['six']
      }
    )
    expect(libraries.map(row)).toEqual([
      // Declared, mapped by its normalised name, and not found under it: it may be used as another.
      {
        name: 'bar.baz',
        versions: ['pyproject.toml:'],
        mapping: 'normalised',
        usedBy: [],
        licence: 'not-installed'
      },
      {
        name: 'beautifulsoup4',
        versions: ['pyproject.toml:'],
        mapping: 'known',
        usedBy: ['shop 1'],
        licence: 'not-installed'
      },
      {
        name: 'numpy',
        versions: [],
        mapping: undefined,
        usedBy: ['shop 1 undeclared 1'],
        licence: 'BSD License (Classifier)'
      },
      {
        name: 'PyYAML',
        versions: ['pyproject.toml:>=6'],
        mapping: 'installed',
        usedBy: ['shop 1'],
        licence: 'MIT (License)'
      },
      {
        name: 'requests',
        versions: ['pyproject.toml:'],
        mapping: 'installed',
        usedBy: ['shop 1'],
        licence: 'Apache-2.0 (License-Expression)'
      },
      {
        name: 'six',
        versions: [],
        mapping: undefined,
        usedBy: ['shop 1 undeclared 1'],
        licence: `file ${site}/six-1.16.0.dist-info/LICENSE`
      },
      {
        name: 'typing-extensions',
        versions: ['pyproject.toml:'],
        mapping: 'normalised',
        usedBy: ['shop 1'],
        licence: 'not-installed'
      }
    ])
    expect(libraries.find((library) => library.name === 'PyYAML')!.imports).toEqual([
      '_yaml',
      'yaml'
    ])
  })

  it('maps Maven artefacts by the table, or by their group ID marked as such; their licences lie outside', async () => {
    const libraries = await inventoryOf(
      {
        'pom.xml': [
          '<project><groupId>com.shop</groupId><artifactId>shop</artifactId><dependencies>',
          '<dependency><groupId>org.slf4j</groupId><artifactId>slf4j-api</artifactId><version>2.0.16</version></dependency>',
          '<dependency><groupId>com.google.guava</groupId><artifactId>guava</artifactId><version>33.3.1-jre</version></dependency>',
          '<dependency><groupId>org.junit.jupiter</groupId><artifactId>junit-jupiter-api</artifactId><scope>test</scope></dependency>',
          '<dependency><groupId>org.junit.jupiter</groupId><artifactId>junit-jupiter-engine</artifactId><scope>test</scope></dependency>',
          '</dependencies></project>'
        ].join('\n'),
        'src/main/java/com/shop/Cart.java': '',
        'src/test/java/com/shop/CartTest.java': ''
      },
      {
        'src/main/java/com/shop/Cart.java': 'cart',
        'src/test/java/com/shop/CartTest.java': 'cart'
      },
      {
        'src/main/java/com/shop/Cart.java': [
          'org.slf4j',
          'com.google.common.collect',
          'org.springframework.web'
        ],
        'src/test/java/com/shop/CartTest.java': ['org.junit.jupiter.api']
      }
    )
    expect(libraries.map(row)).toEqual([
      {
        name: 'com.google.guava:guava',
        versions: ['pom.xml:33.3.1-jre'],
        mapping: 'known',
        usedBy: ['cart 1'],
        licence: 'outside'
      },
      {
        name: 'org.junit.jupiter:junit-jupiter-api',
        versions: ['pom.xml:'],
        mapping: 'known',
        usedBy: ['cart 1 tests'],
        licence: 'outside'
      },
      // By its group ID, which every artefact of the group shares.
      {
        name: 'org.junit.jupiter:junit-jupiter-engine',
        versions: ['pom.xml:'],
        mapping: 'group',
        usedBy: [],
        licence: 'outside'
      },
      {
        name: 'org.slf4j:slf4j-api',
        versions: ['pom.xml:2.0.16'],
        mapping: 'group',
        usedBy: ['cart 1'],
        licence: 'outside'
      },
      {
        name: 'org.springframework.web',
        versions: [],
        mapping: undefined,
        usedBy: ['cart 1 undeclared 1'],
        licence: 'outside'
      }
    ])
  })

  it('maps Go modules by the prefix of the import path, declared only by the go.mod of the module, and reads vendor', async () => {
    const libraries = await inventoryOf(
      {
        'go.mod':
          'module example.com/shop\nrequire (\n\tgithub.com/google/uuid v1.6.0\n\tgolang.org/x/text v0.21.0 // indirect\n)\n',
        'tools/go.mod': 'module example.com/shop/tools\n',
        'vendor/github.com/google/uuid/LICENSE': 'Copyright …',
        'vendor/github.com/google/uuid/uuid.go': '',
        'cart/line.go': '',
        'tools/gen.go': ''
      },
      { 'cart/line.go': 'cart', 'tools/gen.go': 'tools' },
      {
        'cart/line.go': ['github.com/google/uuid', 'golang.org/x/text/language'],
        'tools/gen.go': ['github.com/google/uuid']
      }
    )
    expect(libraries.map(row)).toEqual([
      {
        name: 'github.com/google/uuid',
        versions: ['go.mod:v1.6.0'],
        mapping: 'same',
        usedBy: ['cart 1', 'tools 1 undeclared 1'],
        licence: 'file vendor/github.com/google/uuid/LICENSE'
      },
      {
        name: 'golang.org/x/text',
        versions: ['go.mod:v0.21.0'],
        mapping: 'same',
        usedBy: ['cart 1'],
        licence: 'not-installed'
      }
    ])
  })
})

// The done-when of part 15 of docs/plan-vision.md, as far as `structure` goes: the inventory
// of this repository, its node_modules installed.
describe('the Library inventory of this repository', () => {
  it('lists the Libraries of each package with the Components that use them, and their licences', async () => {
    const root = fileURLToPath(new URL('../../../', import.meta.url))
    const require = createRequire(import.meta.url)
    const runtime = await readFile(require.resolve('web-tree-sitter/web-tree-sitter.wasm'))
    const grammar = (name: string) =>
      readFile(require.resolve(`tree-sitter-${name}/tree-sitter-${name}.wasm`))
    const extract = extractorOf({
      java: await prepareJava({ runtime, grammar: await grammar('java') }),
      python: await preparePython({ runtime, grammar: await grammar('python') }),
      go: await prepareGo({ runtime, grammar: await grammar('go') })
    })
    const fs = nodeFileSystem(root)
    const files = repositoryFiles(root)
    const structure = await openStructure(fs, files)
    const dependencies = await analyseDependencies(fs, files, structure.sourceFiles, extract)
    const { libraries } = await libraryInventory(fs, files, structure, dependencies)
    const named = (name: string, ecosystem = 'npm') =>
      libraries.find((library) => library.name === name && library.ecosystem === ecosystem)!

    // Only the window uses Electron: its main process and its preload script.
    const electron = named('electron')
    expect(
      electron.declared.map(({ manifest, group, component }) => [manifest, group, component])
    ).toEqual([['packages/app/package.json', 'dev', 'app']])
    expect(electron.usedBy.map((user) => user.component)).toEqual(['app/main', 'app/preload'])
    expect(electron.licence).toEqual({
      kind: 'declared',
      licence: 'MIT',
      field: 'license',
      source: 'packages/app/node_modules/electron/package.json'
    })

    // Every workspace package declares its Libraries in its own package.json, which is its.
    for (const library of libraries) {
      for (const declaration of library.declared) {
        const owner = /^packages\/([^/]+)\/package\.json$/.exec(declaration.manifest)?.[1]
        if (owner !== undefined) expect(declaration.component).toBe(owner)
      }
    }
    // The packages of the workspace are no Libraries.
    expect(libraries.some((library) => library.name.startsWith('@adr-tool/'))).toBe(false)
    expect(named('yaml').usedBy.map((user) => user.component)).toEqual(
      expect.arrayContaining(['conformance', 'kernel', 'structure'])
    )

    // An installed package declares its licence, or is marked as declaring none; what is not
    // installed — the Libraries of the fixtures — is marked as such, and a Java Library's lies
    // outside the repository.
    for (const library of libraries.filter((library) => library.installed !== undefined)) {
      expect(library.licence.kind === 'declared' || library.licence).toBe(true)
    }
    expect(named('PyYAML', 'python')).toMatchObject({
      mapping: 'known',
      imports: ['yaml', '_yaml'],
      licence: { kind: 'unknown', reason: 'not-installed' }
    })
    expect(named('PyYAML', 'python').usedBy.map((user) => user.component)).toEqual(['structure'])
    expect(named('github.com/google/uuid', 'go').licence).toEqual({
      kind: 'unknown',
      reason: 'not-installed'
    })
    expect(named('org.slf4j', 'maven')).toMatchObject({
      declared: [],
      licence: { kind: 'unknown', reason: 'outside' }
    })
  }, 60_000)
})
