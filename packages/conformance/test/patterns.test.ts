import { describe, expect, it } from 'vitest'
import { componentMatcher, hasWildcard } from '../src'
import { renamedPattern } from '../src/component-patterns'

const ids = [
  'ui',
  'ui/forms',
  'ui/forms/inputs',
  'api-public',
  'api-internal',
  'features',
  'features/a',
  'features/a/api',
  'features/b',
  'core/api'
]
const matched = (...patterns: string[]) => ids.filter(componentMatcher(patterns))

describe('Component patterns (docs/conformance-format.md, section 1)', () => {
  it('name a Component by its ID, without a wildcard', () => {
    expect(matched('ui')).toEqual(['ui'])
    expect(matched('features/a')).toEqual(['features/a'])
    expect(matched('feature')).toEqual([])
    expect(hasWildcard('ui')).toBe(false)
  })

  it('match within a segment with *, across segments with **, none included', () => {
    expect(matched('*')).toEqual(['ui', 'api-public', 'api-internal', 'features'])
    expect(matched('api-*')).toEqual(['api-public', 'api-internal'])
    expect(matched('features/*')).toEqual(['features/a', 'features/b'])
    expect(matched('ui/**')).toEqual(['ui', 'ui/forms', 'ui/forms/inputs'])
    expect(matched('**')).toEqual(ids)
    expect(matched('**/api')).toEqual(['features/a/api', 'core/api'])
    expect(matched('features/**/api')).toEqual(['features/a/api'])
    expect(matched('*/*/api')).toEqual(['features/a/api'])
    expect(matched('ui', 'features/*')).toEqual(['ui', 'features/a', 'features/b'])
    expect(hasWildcard('ui/**')).toBe(true)
  })

  it('read ** written twice in a row as one', () => {
    expect(matched('**/**')).toEqual(matched('**'))
    expect(matched('ui/**/**')).toEqual(matched('ui/**'))
    expect(matched('**/**/api')).toEqual(matched('**/api'))
    expect(matched('features/**/**/api')).toEqual(matched('features/**/api'))
  })

  it('follow a Rename where their leading segments name the Component', () => {
    expect(renamedPattern('core', 'core', 'domain')).toBe('domain')
    expect(renamedPattern('core/**', 'core', 'domain')).toBe('domain/**')
    expect(renamedPattern('core/adr', 'core', 'domain')).toBe('domain/adr')
    expect(renamedPattern('core-*', 'core', 'domain')).toBe('core-*')
    expect(renamedPattern('cor*', 'core', 'domain')).toBe('cor*')
    expect(renamedPattern('*', 'core', 'domain')).toBe('*')
    expect(renamedPattern('core/adr/**', 'core/adr', 'core/records')).toBe('core/records/**')
  })
})
