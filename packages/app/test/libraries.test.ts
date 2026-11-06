import { describe, expect, it } from 'vitest'
import type { Licence, LibraryUser } from '@adr-tool/structure/model'
import {
  compareLicences,
  fileCountOf,
  licenceLabel,
  shownUsers,
  withoutOuterParentheses
} from '../src/renderer/src/lib/libraries'

// The Library inventory in the window (docs/structure-format.md, section 3).

describe('a licence in the window', () => {
  it('says an SPDX expression without the parentheses around the whole of it', () => {
    expect(withoutOuterParentheses('(MPL-2.0 OR Apache-2.0)')).toBe('MPL-2.0 OR Apache-2.0')
    expect(withoutOuterParentheses('((MIT))')).toBe('MIT')
    expect(withoutOuterParentheses('(MIT OR Apache-2.0) AND BSD-3-Clause')).toBe(
      '(MIT OR Apache-2.0) AND BSD-3-Clause'
    )
    expect(withoutOuterParentheses('(MIT) OR (ISC)')).toBe('(MIT) OR (ISC)')
    expect(
      licenceLabel({
        kind: 'declared',
        licence: '(MPL-2.0 OR Apache-2.0)',
        field: 'license',
        source: 'node_modules/dompurify/package.json'
      })
    ).toBe('MPL-2.0 OR Apache-2.0')
  })

  it('sorts what cannot be told last, up and down', () => {
    const declared = (licence: string): Licence => ({
      kind: 'declared',
      licence,
      field: 'license',
      source: 'package.json'
    })
    const licences: Licence[] = [
      { kind: 'unknown', reason: 'not-installed' },
      declared('MIT'),
      { kind: 'file', source: 'vendor/x/LICENSE' },
      declared('Apache-2.0')
    ]
    const sorted = (descending: boolean): string[] =>
      [...licences]
        .sort((a, b) => compareLicences(a, b, descending))
        .map((one) => licenceLabel(one))
    expect(sorted(false)).toEqual([
      'Apache-2.0',
      'MIT',
      'LICENSE file present',
      'cannot be told: not installed in the repository'
    ])
    expect(sorted(true)).toEqual([
      'LICENSE file present',
      'MIT',
      'Apache-2.0',
      'cannot be told: not installed in the repository'
    ])
  })
})

describe('the users of a Library, with test files or without', () => {
  const users: LibraryUser[] = [
    {
      component: 'core',
      files: ['src/cart.ts', 'test/cart.test.ts'],
      lines: { 'src/cart.ts': [3], 'test/cart.test.ts': [1, 2] },
      tests: ['test/cart.test.ts'],
      testOnly: false,
      undeclared: ['test/cart.test.ts']
    },
    {
      component: 'web',
      files: ['web/app.test.ts'],
      lines: { 'web/app.test.ts': [1] },
      tests: ['web/app.test.ts'],
      testOnly: true,
      undeclared: []
    }
  ]

  it('counts the test files only where they are included', () => {
    expect(fileCountOf(shownUsers(users, true))).toBe(3)
    const without = shownUsers(users, false)
    expect(fileCountOf(without)).toBe(1)
    // A Component that uses it in tests alone is not shown.
    expect(without).toEqual([
      {
        component: 'core',
        files: ['src/cart.ts'],
        lines: { 'src/cart.ts': [3] },
        tests: [],
        testOnly: false,
        undeclared: []
      }
    ])
  })
})
