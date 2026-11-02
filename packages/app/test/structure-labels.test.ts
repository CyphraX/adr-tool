import { describe, expect, it } from 'vitest'
import { commonDirectory } from '../src/renderer/src/lib/structure'

describe('the file list of a Component', () => {
  it('names the directory its files share once', () => {
    expect(
      commonDirectory(['packages/structure/src/a.ts', 'packages/structure/test/b.test.ts'])
    ).toBe('packages/structure/')
    expect(commonDirectory(['src/cart/cart.ts'])).toBe('src/cart/')
    // A shared start that is not a whole directory does not count.
    expect(commonDirectory(['src/cart/a.ts', 'src/cartography/b.ts'])).toBe('src/')
    expect(commonDirectory(['a.ts', 'src/b.ts'])).toBe('')
    expect(commonDirectory([])).toBe('')
  })
})
