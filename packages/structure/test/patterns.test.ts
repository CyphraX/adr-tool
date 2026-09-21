import { describe, expect, it } from 'vitest'
import { compilePattern, matcherOf } from '../src/patterns'

const matches = (pattern: string, path: string): boolean =>
  compilePattern(pattern)?.matches(path) ?? false

describe('a pattern (docs/structure-format.md, section 1)', () => {
  it.each([
    // `*` stays within one path segment
    ['src/*.ts', 'src/a.ts', true],
    ['src/*.ts', 'src/deep/a.ts', false],
    ['src/*', 'src/.hidden.ts', true],
    // `**` goes across segments, none included
    ['src/**/*.ts', 'src/a.ts', true],
    ['src/**/*.ts', 'src/one/two/a.ts', true],
    ['src/**', 'src/one/two/a.ts', true],
    ['**/*.test.ts', 'a.test.ts', true],
    ['**/*.test.ts', 'packages/core/test/a.test.ts', true],
    ['**/test/**', 'packages/core/test/deep/a.ts', true],
    // `?` is one character, never a slash
    ['src/?.ts', 'src/a.ts', true],
    ['src/?.ts', 'src/ab.ts', false],
    ['src?a.ts', 'src/a.ts', false],
    // there is no matching at any depth: a pattern is the whole path from the root
    ['*.test.ts', 'a.test.ts', true],
    ['*.test.ts', 'src/a.test.ts', false],
    ['metadata/**', 'packages/core/src/metadata/read.ts', false],
    // a pattern that names a directory claims everything beneath it
    ['packages/core/src', 'packages/core/src/index.ts', true],
    ['packages/core/src', 'packages/core/src/metadata/read.ts', true],
    ['packages/core/src/', 'packages/core/src/index.ts', true],
    ['packages/core/src', 'packages/core/src-old/index.ts', false],
    ['packages/*', 'packages/core/src/index.ts', true],
    // a file named exactly
    ['src/main.ts', 'src/main.ts', true],
    ['src/main.ts', 'src/main.tsx', false],
    // what means something in a regular expression means nothing here
    ['src/a+b(1)/[x].ts', 'src/a+b(1)/[x].ts', true],
    ['src/a.ts', 'src/abts', false],
    // written the Windows way, or with a leading ./
    ['packages\\core\\**', 'packages/core/src/index.ts', true],
    ['./src/**', 'src/a.ts', true],
    // upper and lower case are different
    ['SRC/**', 'src/a.ts', false],
    // the whole repository
    ['**', 'a.ts', true],
    ['.', 'src/a.ts', true]
  ])('%s against %s → %s', (pattern, path, expected) => {
    expect(matches(pattern, path)).toBe(expected)
  })

  it.each(['/etc/**', 'C:\\Users\\x\\**', 'c:/x', '../elsewhere/**', 'src/../../x', '!../x'])(
    'is refused when it is absolute or leaves the repository: %s',
    (pattern) => {
      expect(compilePattern(pattern)).toBeUndefined()
    }
  )

  it('matches nothing when it is empty', () => {
    expect(matches('', 'a.ts')).toBe(false)
    expect(matches('  ', 'a.ts')).toBe(false)
  })
})

describe('a list of patterns', () => {
  it('takes out with ! what an earlier pattern of the list matched', () => {
    const claims = matcherOf(['packages/core/**', '!packages/core/test/fixtures/**'])
    expect(claims('packages/core/src/index.ts')).toBe(true)
    expect(claims('packages/core/test/fixtures/a/b.ts')).toBe(false)
  })

  it('goes by the order of the list: a later pattern can bring back what ! took out', () => {
    const claims = matcherOf(['src/**', '!src/gen/**', 'src/gen/kept.ts'])
    expect(claims('src/gen/dropped.ts')).toBe(false)
    expect(claims('src/gen/kept.ts')).toBe(true)
    // A ! before anything matched takes nothing out.
    expect(matcherOf(['!src/gen/**', 'src/**'])('src/gen/dropped.ts')).toBe(true)
  })

  it('skips a pattern that leaves the repository; it is reported, not matched', () => {
    expect(matcherOf(['../x/**', 'src/**'])('src/a.ts')).toBe(true)
  })
})
