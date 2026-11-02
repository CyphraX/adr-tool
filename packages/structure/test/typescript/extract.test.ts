import { describe, expect, it } from 'vitest'
import { extractUses, type Extraction } from '../../src/typescript/extract'

const uses = (extraction: Extraction) => {
  if (!extraction.analysed) throw new Error('the file was not analysed')
  return extraction.uses.map(
    (use) => `${use.line} ${use.specifier}${use.typeOnly ? ' (type)' : ''}`
  )
}

describe('uses in TypeScript and JavaScript (docs/structure-format.md, section 3)', () => {
  it('finds every kind of import, with the line it starts on', () => {
    const text = [
      "import a from './a'",
      "import * as b from './b'",
      "import { c } from './c'",
      "import './side-effect'",
      "export { d } from './d'",
      "export * from './e'",
      "export * as f from './f'",
      "import g = require('./g')",
      "const h = require('./h')",
      "const i = await import('./i')",
      'const j = await import(`./j`)',
      'import {',
      '  k,',
      '  l',
      "} from './kl'"
    ].join('\n')
    expect(uses(extractUses('src/main.ts', text))).toEqual([
      '1 ./a',
      '2 ./b',
      '3 ./c',
      '4 ./side-effect',
      '5 ./d',
      '6 ./e',
      '7 ./f',
      '8 ./g',
      '9 ./h',
      '10 ./i',
      '11 ./j',
      '12 ./kl'
    ])
  })

  it('marks what exists for the compiler only as type-only', () => {
    const text = [
      "import type { A } from './a'",
      "import { type B, type C } from './bc'",
      "import { type D, e } from './de'",
      "export type { F } from './f'",
      "export { type G } from './g'",
      "export type * from './h'",
      "import type I = require('./i')",
      "let j: import('./j').J",
      "type K = typeof import('./k')",
      "import L, { type M } from './lm'",
      "import {} from './empty'"
    ].join('\n')
    expect(uses(extractUses('src/types.ts', text))).toEqual([
      '1 ./a (type)',
      '2 ./bc (type)',
      '3 ./de',
      '4 ./f (type)',
      '5 ./g (type)',
      '6 ./h (type)',
      '7 ./i (type)',
      '8 ./j (type)',
      '9 ./k (type)',
      '10 ./lm',
      // Nothing is imported, and nothing is marked: what is left is the import for its effect.
      '11 ./empty'
    ])
  })

  it('follows require and import() only with a string literal', () => {
    const text = [
      'const name = "./x"',
      'require(name)',
      'import(name)',
      "require('./a' + name)",
      'import(`./b/${name}`)',
      "require.resolve('./not-a-use')",
      "something.require('./not-either')",
      "new URL('./asset.png', import.meta.url)",
      "require('./real')"
    ].join('\n')
    expect(uses(extractUses('src/dynamic.js', text))).toEqual(['9 ./real'])
  })

  it('finds uses nested anywhere in the code, in JavaScript with JSX', () => {
    const text = [
      'export function load() {',
      "  if (process.env.X) return require('./x')",
      '  return <Lazy load={() => import("./view")} />',
      '}'
    ].join('\n')
    expect(uses(extractUses('src/component.jsx', text))).toEqual(['2 ./x', '3 ./view'])
  })

  it('reads JSX in a .js file, and type annotations in a .js file, as their tools do', () => {
    // Flow writes types into .js files. They are not JavaScript, but the imports are.
    const text = ["import type { T } from './t'", "import v from './v'", 'const x: T = <a />'].join(
      '\n'
    )
    expect(uses(extractUses('src/flow.js', text))).toEqual(['1 ./t (type)', '2 ./v'])
  })

  it('takes every use of a declaration file, and in a declared module, as type-only', () => {
    // Neither exists at run time, whatever the import looks like.
    const declarations = ["import { Base } from './base'", "export * from './more'"].join('\n')
    expect(uses(extractUses('src/env.d.ts', declarations))).toEqual([
      '1 ./base (type)',
      '2 ./more (type)'
    ])
    const ambient = [
      "import { real } from './real'",
      "declare module 'virtual:thing' {",
      "  import { inner } from './inner'",
      '}'
    ].join('\n')
    expect(uses(extractUses('src/shims.ts', ambient))).toEqual(['1 ./real', '3 ./inner (type)'])
  })

  it('does not analyse a file that cannot be parsed, and says why', () => {
    const extraction = extractUses('src/broken.ts', "import a from './a'\nfunction (")
    expect(extraction).toMatchObject({ analysed: false, line: 2 })
  })

  it('has nothing to say about an empty file', () => {
    expect(uses(extractUses('src/empty.ts', ''))).toEqual([])
  })
})

describe('uses in Svelte (docs/structure-format.md, section 3, "Svelte")', () => {
  it('reads the script blocks, instance and module, with the lines of the .svelte file', () => {
    const text = [
      '<script module lang="ts">',
      "  import type { Item } from './item'",
      '</script>',
      '',
      '<script lang="ts" generics="T extends Record<string, unknown>">',
      "  import Row from './Row.svelte'",
      "  import { format } from '$lib/format'",
      '  let { items }: { items: Item[] } = $props()',
      '</script>',
      '',
      '{#each items as item}',
      '  <Row {item} label={format(item)} />',
      '{/each}',
      '',
      '<style>',
      '  p { color: red }',
      '</style>'
    ].join('\n')
    expect(uses(extractUses('src/List.svelte', text))).toEqual([
      '2 ./item (type)',
      '6 ./Row.svelte',
      '7 $lib/format'
    ])
  })

  it('does not take markup for code: not a script in a comment, nor one for the document head', () => {
    const text = [
      "<!-- <script>import gone from './commented'</script> -->",
      '<svelte:head>',
      '  <script src="https://example.com/analytics.js"></script>',
      "  <script>window.dataLayer = []; import('./not-a-module')</script>",
      '</svelte:head>',
      "<script>import kept from './kept'</script>",
      '<p>{"<script>"}</p>'
    ].join('\n')
    expect(uses(extractUses('src/Page.svelte', text))).toEqual(['6 ./kept'])
  })

  it('reads a script as a module, in which the top level may await, also without imports', () => {
    const component = [
      '<script>',
      '  let { squared } = $derived(await {',
      '    squared: 4',
      '  })',
      "  const lazy = import('./lazy')",
      '</script>'
    ].join('\n')
    expect(uses(extractUses('src/Child.svelte', component))).toEqual(['5 ./lazy'])
    const module = "const config = await import('./config.mjs')\n// the last line, a comment"
    expect(uses(extractUses('tools/run.mjs', module))).toEqual(['1 ./config.mjs'])
  })

  it('has no uses without a script, and is analysed even then', () => {
    expect(uses(extractUses('src/Static.svelte', '<p>Hello</p>\n'))).toEqual([])
  })

  it('does not analyse a component whose script cannot be parsed', () => {
    const extraction = extractUses(
      'src/Broken.svelte',
      '<p>a</p>\n<script>\nfunction (\n</script>\n'
    )
    expect(extraction).toMatchObject({ analysed: false, line: 3 })
  })
})
