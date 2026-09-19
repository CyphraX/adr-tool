import { describe, expect, it } from 'vitest'
import { metadataEditRequest, repairRequest } from '../src/main/requests'

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

describe('a repair as the renderer sends it', () => {
  const request = (repair: unknown): unknown => ({
    repositoryId: 'r1',
    logPath: 'docs/adr',
    repair
  })

  it('goes on when it is one of the repairs core knows, with nothing else on it', () => {
    const repairs = [
      { kind: 'lowercase-status', adr: '0001-a' },
      { kind: 'remove-item', adr: '0001-a', key: 'depends-on', item: '0009-gone' },
      { kind: 'add-back-reference', adr: '0001-a', key: 'amended-by', item: '0002-b' },
      { kind: 'set-status', adr: '0001-a', status: 'superseded' },
      { kind: 'renumber', adr: '0001-a' }
    ]
    for (const repair of repairs) {
      expect(repairRequest(request({ ...repair, path: '../outside.md' }))).toEqual(request(repair))
    }
  })

  it('is dropped when it is anything else', () => {
    for (const repair of [
      undefined,
      'renumber',
      { kind: 'renumber' },
      { kind: 'delete', adr: '0001-a' },
      { kind: 'remove-item', adr: '0001-a', key: 'title', item: 'x' },
      { kind: 'remove-item', adr: '0001-a', key: 'tags' },
      { kind: 'add-back-reference', adr: '0001-a', key: 'supersedes', item: '0002-b' },
      { kind: 'set-status', adr: '0001-a', status: 'rejected' }
    ]) {
      expect(repairRequest(request(repair))).toBeUndefined()
    }
    expect(
      repairRequest({ repositoryId: 'r1', repair: { kind: 'renumber', adr: 'a' } })
    ).toBeUndefined()
  })
})
