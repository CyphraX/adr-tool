import { describe, expect, it } from 'vitest'
import { memoryFileSystem } from '@adr-tool/kernel'
import { openStructure } from '@adr-tool/structure'
import { annotationsOf, componentOf, sourceFileOf, type Annotation, type Found } from '../src'

const CODE = {
  'src/cart/cart.ts': '',
  'src/cart/pricing/tax.ts': '',
  'src/shipping/parcel.ts': '',
  'scripts/release.sh': ''
}
const DECLARATION = [
  'components:',
  '  cart:',
  '    paths: [src/cart/**]',
  '    components:',
  '      pricing:',
  '        paths: [src/cart/pricing/**]',
  '  shipping:',
  '    paths: [src/shipping/**]',
  ''
].join('\n')

const on = (id: string, path: string): Annotation => ({
  id,
  path: `docs/architecture/annotations/${id}.md`,
  type: 'note',
  state: 'open',
  anchor: { path, start: 1, end: 1, quote: [''] },
  cites: [],
  text: '',
  replies: [],
  writable: true
})

describe('the Component of an Annotation', () => {
  it('is the Component that owns its Source File, where the Anchor is found now', async () => {
    const fs = memoryFileSystem({ ...CODE, '.arch/components.yml': DECLARATION })
    const structure = await openStructure(fs, [...Object.keys(CODE), '.arch/components.yml'])
    const tax = on('tax', 'src/cart/pricing/tax.ts')
    expect(componentOf(tax, structure)).toBe('cart/pricing')
    expect(componentOf(on('release', 'scripts/release.sh'), structure)).toBeUndefined()
    expect(componentOf({ ...tax, anchor: undefined }, structure)).toBeUndefined()

    // Found again in a file that moved to another Component: it is that Component's now.
    const moved: Found = {
      kind: 'moved',
      anchor: { path: 'src/shipping/parcel.ts', start: 1, end: 1, quote: [''] },
      similarity: 1,
      renamedFrom: 'src/cart/pricing/tax.ts'
    }
    expect(sourceFileOf(tax, moved)).toBe('src/shipping/parcel.ts')
    expect(componentOf(tax, structure, moved)).toBe('shipping')
    expect(componentOf(tax, structure, { kind: 'orphaned', file: 'gone' })).toBe('cart/pricing')

    const annotations = [
      tax,
      on('cart', 'src/cart/cart.ts'),
      on('parcel', 'src/shipping/parcel.ts')
    ]
    const ids = (list: Annotation[]) => list.map((annotation) => annotation.id)
    expect(ids(annotationsOf('cart', annotations, structure))).toEqual(['tax', 'cart'])
    expect(ids(annotationsOf('cart/pricing', annotations, structure))).toEqual(['tax'])
    expect(ids(annotationsOf('cart', annotations, structure, new Map([['tax', moved]])))).toEqual([
      'cart'
    ])
    expect(ids(annotationsOf('car', annotations, structure))).toEqual([])
  })
})
