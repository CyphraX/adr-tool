import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { memoryFileSystem } from '@adr-tool/kernel'
import { prepareResolver } from '../../src/typescript/resolution'
import { nodeFileSystem, repositoryFiles } from '../repository-files'

const root = fileURLToPath(new URL('../../../../', import.meta.url))

/** A repository in memory: every file given is one git knows. */
const inMemory = (files: Record<string, string>) =>
  prepareResolver(memoryFileSystem(files), Object.keys(files))

describe('this repository, read through the file-system port', async () => {
  const resolver = await prepareResolver(nodeFileSystem(root), repositoryFiles(root))

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
    'package.json': '{ "name": "root", "private": true, "workspaces": ["libs/*"] }',
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
    const resolver = await inMemory(files)
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
    const resolver = await inMemory(files)
    expect(resolver.resolve('@acme/shared', 'apps/shop/src/main.ts')).toEqual({
      kind: 'not-resolved'
    })
  })

  it('ignores what is not a Source File, and does not resolve what is not there', async () => {
    const resolver = await inMemory(files)
    const from = 'apps/shop/src/main.ts'
    expect(resolver.resolve('./style.css', from)).toEqual({ kind: 'ignored' })
    expect(resolver.resolve('./gone', from)).toEqual({ kind: 'not-resolved' })
    expect(resolver.resolve('lodash/fp', from)).toEqual({ kind: 'library', name: 'lodash' })
  })

  it('goes on without the settings of an extends that is not there', async () => {
    const resolver = await inMemory({
      'tsconfig.json': '{ "extends": "@tsconfig/node20/tsconfig.json", "include": ["src"] }',
      'src/a.ts': '',
      'src/b.ts': ''
    })
    expect(resolver.configOf('src/a.ts')).toBe('tsconfig.json')
    expect(resolver.resolve('./b', 'src/a.ts')).toEqual({ kind: 'source-file', path: 'src/b.ts' })
  })

  it('works without any configuration file', async () => {
    const bare = { 'a/tool.mjs': '', 'a/helper.mjs': '' }
    const resolver = await inMemory(bare)
    expect(resolver.configOf('a/tool.mjs')).toBeUndefined()
    expect(resolver.resolve('./helper.mjs', 'a/tool.mjs')).toEqual({
      kind: 'source-file',
      path: 'a/helper.mjs'
    })
  })
})

describe('what resolution reads, and what it leaves alone', () => {
  it('follows extends into a generated file that git ignores, and resolves components through its aliases', async () => {
    // SvelteKit writes .svelte-kit/tsconfig.json and the project's own tsconfig extends it.
    const disk = {
      'tsconfig.json': '{ "extends": "./.svelte-kit/tsconfig.json" }',
      '.svelte-kit/tsconfig.json': JSON.stringify({
        compilerOptions: { paths: { $lib: ['../src/lib'], '$lib/*': ['../src/lib/*'] } },
        include: ['../src/**/*.ts', '../src/**/*.svelte']
      }),
      'src/routes/page.ts': '',
      'src/lib/money.ts': '',
      'src/lib/Row.svelte': '',
      // A module of runes beside a component of the same name is a file of its own.
      'src/lib/counter.svelte': '',
      'src/lib/counter.svelte.ts': ''
    }
    const listed = Object.keys(disk).filter((path) => !path.startsWith('.svelte-kit/'))
    const resolver = await prepareResolver(memoryFileSystem(disk), listed)
    expect(resolver.resolve('$lib/money', 'src/routes/page.ts')).toEqual({
      kind: 'source-file',
      path: 'src/lib/money.ts'
    })
    // A component through an alias, which TypeScript alone does not find.
    expect(resolver.resolve('$lib/Row.svelte', 'src/routes/page.ts')).toEqual({
      kind: 'source-file',
      path: 'src/lib/Row.svelte'
    })
    expect(resolver.resolve('$lib/counter.svelte', 'src/routes/page.ts')).toEqual({
      kind: 'source-file',
      path: 'src/lib/counter.svelte.ts'
    })
    expect(resolver.resolve('$lib/Gone.svelte', 'src/routes/page.ts')).toEqual({
      kind: 'not-resolved'
    })
  })

  it('never lands on a file git does not list, such as build output that happens to be there', async () => {
    const disk = {
      'package.json': '{ "name": "root", "workspaces": ["libs/*"] }',
      'libs/shared/package.json': '{ "name": "@acme/shared", "main": "dist/index.js" }',
      'libs/shared/src/index.ts': '',
      'libs/shared/dist/index.js': '',
      'apps/shop/main.ts': ''
    }
    const listed = Object.keys(disk).filter((path) => !path.includes('/dist/'))
    const resolver = await prepareResolver(memoryFileSystem(disk), listed)
    expect(resolver.resolve('@acme/shared', 'apps/shop/main.ts')).toEqual({ kind: 'not-resolved' })
  })

  it('takes the packages the workspace declares, and the repository itself, as workspace packages', async () => {
    const resolver = await inMemory({
      'package.json':
        '{ "name": "@acme/root", "workspaces": ["libs/*"], "exports": "./tools/index.ts" }',
      'tools/index.ts': '',
      'libs/shared/package.json': '{ "name": "@acme/shared", "exports": "./index.ts" }',
      'libs/shared/index.ts': '',
      // A fixture that happens to carry the name of a real package is not part of the workspace.
      'test/fixtures/fake/package.json': '{ "name": "lodash", "main": "index.js" }',
      'test/fixtures/fake/index.js': '',
      'apps/shop/main.ts': ''
    })
    const from = 'apps/shop/main.ts'
    expect(resolver.resolve('@acme/shared', from)).toEqual({
      kind: 'source-file',
      path: 'libs/shared/index.ts'
    })
    expect(resolver.resolve('@acme/root', from)).toEqual({
      kind: 'source-file',
      path: 'tools/index.ts'
    })
    expect(resolver.resolve('lodash', from)).toEqual({ kind: 'library', name: 'lodash' })
  })

  it('resolves a path with a query that only a bundler understands to the file it names', async () => {
    const resolver = await inMemory({ 'src/a.ts': '', 'src/worker.ts': '', 'src/icon.svg': '' })
    expect(resolver.resolve('./worker?nodeWorker', 'src/a.ts')).toEqual({
      kind: 'source-file',
      path: 'src/worker.ts'
    })
    expect(resolver.resolve('./icon.svg?raw', 'src/a.ts')).toEqual({ kind: 'ignored' })
    expect(resolver.resolve('lodash?x', 'src/a.ts')).toEqual({ kind: 'library', name: 'lodash' })
  })

  it('does not call a Library what is no package name', async () => {
    const resolver = await inMemory({ 'src/a.ts': '' })
    const from = 'src/a.ts'
    for (const specifier of ['#internal/thing', 'virtual:pwa', 'https://esm.sh/x', '/abs/path']) {
      expect(resolver.resolve(specifier, from)).toEqual({ kind: 'not-resolved' })
    }
    expect(resolver.resolve('fs/promises', from)).toEqual({ kind: 'built-in' })
    expect(resolver.resolve('node:test', from)).toEqual({ kind: 'built-in' })
  })

  it('reads nothing outside of the repository, wherever a configuration points', async () => {
    const asked: string[] = []
    const files = {
      'tsconfig.json': '{ "extends": "../../outside/tsconfig.json" }',
      'src/a.ts': '',
      'src/b.ts': ''
    }
    const memory = memoryFileSystem(files)
    const resolver = await prepareResolver(
      {
        readText: (path) => {
          asked.push(path)
          return memory.readText(path)
        },
        list: memory.list
      },
      Object.keys(files)
    )
    expect(resolver.resolve('./b', 'src/a.ts')).toEqual({ kind: 'source-file', path: 'src/b.ts' })
    expect(asked.every((path) => !path.startsWith('..') && !path.startsWith('/'))).toBe(true)
  })
})
