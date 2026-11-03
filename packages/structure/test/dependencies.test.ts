import { describe, expect, it } from 'vitest'
import { memoryFileSystem } from '@adr-tool/kernel'
import { analyseDependencies } from '../src/dependencies'
import type { Extract } from '../src/extraction'
import { sourceFilesAmong } from '../src/source-files'
import { extractUses } from '../src/typescript/extract'

async function analyse(repository: Record<string, string>, extract?: Extract) {
  const files = Object.keys(repository)
  return analyseDependencies(memoryFileSystem(repository), files, sourceFilesAmong(files), extract)
}

describe('Dependencies between Source Files (docs/structure-format.md, section 3)', () => {
  it('make several uses between the same two files one Dependency, with every line', async () => {
    const { dependencies } = await analyse({
      'src/a.ts': [
        "import type { T } from './b'",
        "import { b } from './b'",
        '',
        "const lazy = () => import('./b')"
      ].join('\n'),
      'src/b.ts': ''
    })
    // Line 1 uses b for its types alone: a Rule that ignores those leaves it out.
    expect(dependencies).toEqual([
      { from: 'src/a.ts', to: 'src/b.ts', typeOnly: false, lines: [1, 2, 4], typeOnlyLines: [1] }
    ])
  })

  it('mark a line type-only only where every use that begins on it is', async () => {
    const { dependencies } = await analyse({
      'src/a.ts': [
        "import type { T } from './b'; import { b } from './b'",
        "import type { U } from './b'",
        "export type { V } from './b'"
      ].join('\n'),
      'src/b.ts': ''
    })
    expect(dependencies[0]!.typeOnlyLines).toEqual([2, 3])
  })

  it('are type-only only where every use is, or where the file used is a declaration file', async () => {
    const { dependencies } = await analyse({
      'src/a.ts':
        "import type { T } from './b'\nimport type { U } from './b'\nimport { g } from './globals'\n",
      'src/b.ts': '',
      'src/globals.d.ts': ''
    })
    expect(dependencies.map((dependency) => [dependency.to, dependency.typeOnly])).toEqual([
      ['src/b.ts', true],
      ['src/globals.d.ts', true]
    ])
  })

  it('never make a file depend on itself', async () => {
    const { dependencies } = await analyse({ 'src/a.ts': "import { a } from './a'\n" })
    expect(dependencies).toEqual([])
  })

  it('record a Library once per file, and leave built-in modules and other files out', async () => {
    const result = await analyse({
      'src/a.ts': [
        "import fp from 'lodash/fp'",
        "import { map } from 'lodash'",
        "import { readFile } from 'node:fs/promises'",
        "import path from 'path'",
        "import './style.css'",
        "import '@fontsource/ibm-plex-sans/400.css'"
      ].join('\n'),
      'src/style.css': ''
    })
    expect(result.dependencies).toEqual([])
    expect(result.libraries).toEqual([
      { file: 'src/a.ts', library: 'lodash' },
      { file: 'src/a.ts', library: '@fontsource/ibm-plex-sans' }
    ])
    expect(result.notResolved).toEqual([])
  })

  it('list what cannot be resolved, with its line, and never guess', async () => {
    const { notResolved, dependencies } = await analyse({
      'src/a.ts': "import { b } from './b'\nimport { gone } from './gone'\n",
      'src/b.ts': ''
    })
    expect(dependencies.map((dependency) => dependency.to)).toEqual(['src/b.ts'])
    expect(notResolved).toEqual([{ file: 'src/a.ts', specifier: './gone', line: 2 }])
  })

  it('give a file that cannot be parsed no Dependencies of its own, while others may still use it', async () => {
    const result = await analyse({
      'src/a.ts': "import { b } from './b'\n",
      'src/b.ts': "import { a } from './a'\nfunction (\n"
    })
    expect(result.dependencies).toEqual([
      { from: 'src/a.ts', to: 'src/b.ts', typeOnly: false, lines: [1] }
    ])
    expect(result.notAnalysed).toEqual([{ file: 'src/b.ts', line: 2, message: expect.any(String) }])
  })

  it('reads a Svelte component and resolves its imports, components included', async () => {
    const { dependencies } = await analyse({
      'src/App.svelte':
        "<script lang=\"ts\">\n  import Row from './Row.svelte'\n  import { load } from './load'\n</script>\n<Row />\n",
      'src/Row.svelte': '<p>row</p>\n',
      'src/load.ts': "import App from './App.svelte'\n"
    })
    expect(dependencies.map((dependency) => `${dependency.from} > ${dependency.to}`)).toEqual([
      'src/App.svelte > src/Row.svelte',
      'src/App.svelte > src/load.ts',
      'src/load.ts > src/App.svelte'
    ])
  })

  it('do not read Java, Python or Go without a reader for it, which needs the WebAssembly of tree-sitter', async () => {
    const result = await analyse({
      'src/main/java/a/A.java': 'package a; import b.B;',
      'shop/cart.py': 'import requests\nfrom . import line\n',
      'shop/line.py': '',
      'cart/cart.go': 'package cart\n\nimport "github.com/google/uuid"\n'
    })
    expect(result).toEqual({
      dependencies: [],
      notResolved: [],
      libraries: [],
      manifests: [],
      notAnalysed: [],
      // Their lines are counted all the same; nothing inside them is measured.
      lineCounts: new Map([
        ['cart/cart.go', 3],
        ['shop/cart.py', 2],
        ['shop/line.py', 0],
        ['src/main/java/a/A.java', 1]
      ]),
      measures: new Map()
    })
  })

  it('count the lines of every Source File that can be read, for the size of section 5', async () => {
    const repository = {
      'empty.ts': '',
      'one.ts': 'export {}',
      'ended.ts': 'export {}\n',
      'windows.ts': 'export {}\r\nexport {}\r\n',
      'gaps.ts': '\n\nexport {}',
      // Java is counted even where it is not parsed.
      'One.java': 'class One {}\n'
    }
    const files = [...Object.keys(repository), 'gone.ts']
    const { lineCounts } = await analyseDependencies(
      memoryFileSystem(repository),
      files,
      sourceFilesAmong(files)
    )
    expect(lineCounts).toEqual(
      new Map([
        ['empty.ts', 0],
        ['one.ts', 1],
        ['ended.ts', 1],
        ['windows.ts', 2],
        ['gaps.ts', 3],
        ['One.java', 1]
      ])
    )
  })

  it('extract each file through the function handed in, where the app puts its cache', async () => {
    const seen: string[] = []
    const extract: Extract = (path, text) => {
      seen.push(path)
      return extractUses(path, text)
    }
    await analyse({ 'src/a.ts': "import './b'\n", 'src/b.ts': '' }, extract)
    expect(seen.sort()).toEqual(['src/a.ts', 'src/b.ts'])
  })
})
