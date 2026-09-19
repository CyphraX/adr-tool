import { describe, expect, it } from 'vitest'
import { metadataEditRequest } from '../src/main/requests'

const valid = {
  repositoryId: 'r1',
  logPath: 'docs/adr',
  adrId: '0001-a',
  decisionMakers: ['Kim Becker'],
  tags: [],
  relations: { supersedes: [], amends: [], 'depends-on': ['0002-b'], 'relates-to': [] }
}

describe('a Metadata edit as the renderer sends it', () => {
  it('goes on when it is exactly what the contract says', () => {
    expect(metadataEditRequest(valid)).toEqual(valid)
  })

  it('leaves behind whatever else it carries', () => {
    const request = {
      ...valid,
      path: '../../outside.md',
      relations: { ...valid.relations, 'superseded-by': ['0009-x'] }
    }
    expect(metadataEditRequest(request)).toEqual(valid)
  })

  it('is dropped when anything is missing or of the wrong type', () => {
    const without = (from: object, key: string): object =>
      Object.fromEntries(Object.entries(from).filter(([name]) => name !== key))
    const withoutTags = without(valid, 'tags')
    const threeTypes = without(valid.relations, 'relates-to')
    for (const request of [
      undefined,
      null,
      'text',
      [],
      withoutTags,
      { ...valid, adrId: 7 },
      { ...valid, tags: 'persistence' },
      { ...valid, decisionMakers: ['Kim Becker', 7] },
      { ...valid, relations: undefined },
      { ...valid, relations: threeTypes },
      { ...valid, relations: { ...valid.relations, amends: [{ id: '0002-b' }] } }
    ]) {
      expect(metadataEditRequest(request)).toBeUndefined()
    }
  })
})
