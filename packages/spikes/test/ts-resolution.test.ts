import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { memoryFileSystem } from '@adr-tool/kernel'
import { prepareResolver } from '../src/ts-resolution'
import { nodeFileSystem } from './node-file-system'

const root = fileURLToPath(new URL('../../..', import.meta.url))

describe('this repository, read through the file-system port', async () => {
  const resolver = await prepareResolver(nodeFileSystem(root))

  it('resolves a workspace package from the renderer, whose tsconfig.json is solution-style', () => {
    const from = 'packages/app/src/renderer/src/lib/graph-layout.ts'
    expect(resolver.configOf(from)).toBe('packages/app/tsconfig.web.json')
    expect(resolver.resolve('@adr-tool/core', from)).toEqual({
      kind: 'source-file',
      path: 'packages/core/src/index.ts'
    })
  })

  it('takes the other referenced project for the main process', () => {
    const from = 'packages/app/src/main/index.ts'
    expect(resolver.configOf(from)).toBe('packages/app/tsconfig.node.json')
    expect(resolver.resolve('./strings', from)).toEqual({
      kind: 'source-file',
      path: 'packages/app/src/main/strings.ts'
    })
  })

  it('resolves core to the kernel, one workspace package to another', () => {
    expect(resolver.resolve('@adr-tool/kernel', 'packages/core/src/index.ts')).toEqual({
      kind: 'source-file',
      path: 'packages/kernel/src/index.ts'
    })
  })

  it('resolves an import of a .svelte file as a path', () => {
    expect(resolver.resolve('./App.svelte', 'packages/app/src/renderer/src/main.ts')).toEqual({
      kind: 'source-file',
      path: 'packages/app/src/renderer/src/App.svelte'
    })
  })

  it('follows extends into node_modules, which it never walked, by loading what was missed', () => {
    // Only @electron-toolkit/tsconfig sets this; the repository's own base does not.
    const options = resolver.optionsOf('packages/app/src/renderer/src/main.ts')
    expect(options.noImplicitReturns).toBe(true)
    expect(options.strict).toBe(true)
  })

  it('tells a Library and a built-in module from a Dependency, without looking into node_modules', () => {
    const from = 'packages/app/src/main/index.ts'
    expect(resolver.resolve('electron', from)).toEqual({ kind: 'library', name: 'electron' })
    expect(resolver.resolve('@electron-toolkit/utils', from)).toEqual({
      kind: 'library',
      name: '@electron-toolkit/utils'
    })
    expect(resolver.resolve('node:path', from)).toEqual({ kind: 'built-in' })
  })
})

describe('a repository in memory', () => {
  const files = {
    'package.json': '{ "name": "root", "private": true }',
    'tsconfig.json': JSON.stringify({
      compilerOptions: { baseUrl: '.', paths: { '@lib/*': ['libs/shared/src/*'] } },
      include: ['apps', 'libs']
    }),
    'apps/shop/src/main.ts': '',
    'apps/shop/src/cart.tsx': '',
    'apps/shop/src/style.css': '',
    'libs/shared/package.json': '{ "name": "@acme/shared", "main": "dist/index.js" }',
    'libs/shared/src/money.ts': '',
    'libs/built/package.json': '{ "name": "@acme/built", "exports": { ".": "./src/index.ts" } }',
    'libs/built/src/index.ts': '',
    'scripts/no-config-above/tool.mjs': '',
    'scripts/no-config-above/helper.mjs': ''
  }

  it('honours paths aliases, and falls back to bundler resolution where nothing is configured', async () => {
    const resolver = await prepareResolver(memoryFileSystem(files))
    const from = 'apps/shop/src/main.ts'
    expect(resolver.resolve('@lib/money', from)).toEqual({
      kind: 'source-file',
      path: 'libs/shared/src/money.ts'
    })
    expect(resolver.resolve('./cart', from)).toEqual({
      kind: 'source-file',
      path: 'apps/shop/src/cart.tsx'
    })
    expect(resolver.resolve('@acme/built', from)).toEqual({
      kind: 'source-file',
      path: 'libs/built/src/index.ts'
    })
  })

  it('does not resolve a workspace package that points at build output, and never calls it a Library', async () => {
    const resolver = await prepareResolver(memoryFileSystem(files))
    expect(resolver.resolve('@acme/shared', 'apps/shop/src/main.ts')).toEqual({
      kind: 'not-resolved'
    })
  })

  it('ignores what is not a Source File, and does not resolve what is not there', async () => {
    const resolver = await prepareResolver(memoryFileSystem(files))
    const from = 'apps/shop/src/main.ts'
    expect(resolver.resolve('./style.css', from)).toEqual({ kind: 'ignored' })
    expect(resolver.resolve('./gone', from)).toEqual({ kind: 'not-resolved' })
    expect(resolver.resolve('lodash/fp', from)).toEqual({ kind: 'library', name: 'lodash' })
  })

  it('goes on without the settings of an extends that is not there', async () => {
    const resolver = await prepareResolver(
      memoryFileSystem({
        'tsconfig.json': '{ "extends": "@tsconfig/node20/tsconfig.json", "include": ["src"] }',
        'src/a.ts': '',
        'src/b.ts': ''
      })
    )
    expect(resolver.configOf('src/a.ts')).toBe('tsconfig.json')
    expect(resolver.resolve('./b', 'src/a.ts')).toEqual({ kind: 'source-file', path: 'src/b.ts' })
  })

  it('works without any configuration file', async () => {
    const bare = { 'a/tool.mjs': '', 'a/helper.mjs': '' }
    const resolver = await prepareResolver(memoryFileSystem(bare))
    expect(resolver.configOf('a/tool.mjs')).toBeUndefined()
    expect(resolver.resolve('./helper.mjs', 'a/tool.mjs')).toEqual({
      kind: 'source-file',
      path: 'a/helper.mjs'
    })
  })
})
