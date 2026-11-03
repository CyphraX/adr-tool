import { describe, expect, it } from 'vitest'
import { sourceFilesAmong } from '../src/source-files'

describe('Source Files (docs/structure-format.md, section 2)', () => {
  it('are the files with the extensions of the languages, in the order of their paths', () => {
    const files = [
      'src/main.ts',
      'src/App.svelte',
      'src/view.tsx',
      'src/legacy.cjs',
      'src/module.mts',
      'src/types.d.ts',
      'src/main/java/com/example/Cart.java',
      'shop/cart.py',
      'shop/cart.pyc',
      'cart/cart.go',
      'go.mod',
      'README.md',
      'package.json',
      'src/style.css',
      'src/notes.ts.bak',
      'Makefile'
    ]
    expect(sourceFilesAmong(files).map((file) => [file.path, file.language])).toEqual([
      ['cart/cart.go', 'go'],
      ['shop/cart.py', 'python'],
      ['src/App.svelte', 'svelte'],
      ['src/legacy.cjs', 'typescript'],
      ['src/main.ts', 'typescript'],
      ['src/main/java/com/example/Cart.java', 'java'],
      ['src/module.mts', 'typescript'],
      ['src/types.d.ts', 'typescript'],
      ['src/view.tsx', 'typescript']
    ])
  })

  it('never come from node_modules, .git or .arch, at any depth, even when git tracks them', () => {
    const files = [
      'node_modules/yaml/index.js',
      'packages/app/node_modules/x/index.js',
      '.git/hooks/pre-commit.js',
      '.arch/generated.ts',
      'src/node_modules_like/a.ts'
    ]
    expect(sourceFilesAmong(files).map((file) => file.path)).toEqual(['src/node_modules_like/a.ts'])
  })

  it('are not left out for being called dist or build: that is for git to say', () => {
    expect(sourceFilesAmong(['src/build/plan.ts', 'dist/index.js'])).toHaveLength(2)
  })

  it.each([
    ['packages/core/test/decide.test.ts', true],
    ['packages/core/test/fixtures.ts', true],
    ['src/tests/helper.ts', true],
    ['src/__tests__/a.tsx', true],
    ['e2e/login.ts', true],
    ['src/cart.spec.ts', true],
    ['src/cart.test.svelte', true],
    ['shop/src/test/java/com/example/CartTest.java', true],
    ['src/main/java/com/example/CartTest.java', false],
    ['shop/test_cart.py', true],
    ['shop/cart_test.py', true],
    ['conftest.py', true],
    ['shop/testing.py', false],
    ['shop/latest_cart.py', false],
    ['cart/cart_test.go', true],
    ['cart/contest.go', false],
    ['src/testing.ts', false],
    ['src/latest/a.ts', false],
    ['src/contest.ts', false]
  ])('mark %s as a test: %s', (path, expected) => {
    expect(sourceFilesAmong([path])[0]!.test).toBe(expected)
  })

  it('count a path once, however often it is listed', () => {
    expect(sourceFilesAmong(['a.ts', 'a.ts'])).toHaveLength(1)
  })
})
