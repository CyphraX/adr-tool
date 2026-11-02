import { describe, expect, it } from 'vitest'
import {
  createRequest,
  diagramsRequest,
  metadataEditRequest,
  migrationRequest,
  renameRequest,
  repairRequest
} from '../src/main/requests'

const valid = {
  repositoryId: 'r1',
  logPath: 'docs/adr',
  adrId: '0001-a',
  decisionMakers: ['Kim Becker'],
  tags: [],
  relations: { supersedes: [], amends: [], 'depends-on': ['0002-b'], 'relates-to': [] },
  affects: ['core/metadata']
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
      { ...valid, relations: { ...valid.relations, amends: [{ id: '0002-b' }] } },
      without(valid, 'affects'),
      { ...valid, affects: 'core' }
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
      { kind: 'remove-item', adr: '0001-a', key: 'affects', item: 'core/storage' },
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

describe('a request for a Migration from the renderer', () => {
  it('names one ADR, or none for the whole Decision Log, and carries nothing else', () => {
    const request = { repositoryId: 'r1', logPath: 'doc/adr' }
    expect(migrationRequest({ ...request, adrId: '0001-a', path: '/etc/passwd' })).toEqual({
      ...request,
      adrId: '0001-a'
    })
    expect(migrationRequest(request)).toEqual(request)
  })

  it('is turned down when it is not what it should be', () => {
    for (const request of [
      undefined,
      'doc/adr',
      { logPath: 'doc/adr' },
      { repositoryId: 'r1' },
      { repositoryId: 'r1', logPath: 'doc/adr', adrId: 7 },
      { repositoryId: 'r1', logPath: 'doc/adr', adrId: null }
    ]) {
      expect(migrationRequest(request)).toBeUndefined()
    }
  })
})

describe('a Rename as the renderer sends it', () => {
  it('names a Component and a segment, and nothing else', () => {
    expect(renameRequest('r1', 'core/metadata', 'meta')).toEqual({
      repositoryId: 'r1',
      component: 'core/metadata',
      segment: 'meta'
    })
    for (const args of [
      [undefined, 'core', 'x'],
      ['r1', 7, 'x'],
      ['r1', 'core', ['x']],
      ['r1', 'core']
    ]) {
      expect(renameRequest(...(args as [unknown, unknown, unknown]))).toBeUndefined()
    }
  })
})

describe('a new ADR as the renderer asks for it', () => {
  const asked = { repositoryId: 'r1', logPath: 'docs/adr', title: 'Use X', template: 'minimal' }

  it('names the log, the title and the Template, a Relation if it has one, and nothing else', () => {
    expect(createRequest({ ...asked, extra: true })).toEqual(asked)
    const first = { repositoryId: 'r1', title: 'Use X', template: 'minimal' }
    expect(createRequest(first)).toEqual({ ...first, logPath: undefined })
    const relation = { type: 'supersedes', target: '0001-a' }
    expect(createRequest({ ...asked, relation: { ...relation, more: 1 } })).toEqual({
      ...asked,
      relation
    })
  })

  it('is turned down when it is not what it should be', () => {
    for (const request of [
      undefined,
      { ...asked, title: 7 },
      { ...asked, logPath: null },
      { ...asked, template: undefined },
      { ...asked, relation: null },
      { ...asked, relation: 'supersedes' },
      { ...asked, relation: { type: 'depends-on', target: '0001-a' } },
      { ...asked, relation: { type: 'amends' } }
    ]) {
      expect(createRequest(request)).toBeUndefined()
    }
  })
})

describe('the drawn Mermaid blocks an export is asked with', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><style>.a{fill:#fff}</style><g/></svg>'

  it('go on by their source when each is an SVG and nothing else', () => {
    expect(diagramsRequest([{ source: 'graph TD; a-->b', svg: `  ${svg}\n` }])).toEqual(
      new Map([['graph TD; a-->b', svg]])
    )
  })

  it('leave out a drawing that could run or fetch something, or is no SVG, and its block stays code', () => {
    const asked = [
      { source: 'script', svg: '<svg><script>alert(1)</script></svg>' },
      { source: 'handler', svg: '<svg><g onclick="alert(1)"/></svg>' },
      { source: 'html', svg: '<svg><foreignObject><div/></foreignObject></svg>' },
      { source: 'link', svg: '<svg><a href="javascript:alert(1)"/></svg>' },
      { source: 'page', svg: '<p>not a drawing</p>' },
      { source: 'trailing', svg: `${svg}<script>alert(1)</script>` },
      // Past a list of words to look for, as the review of part 2 found.
      {
        source: 'prefixed script',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" xmlns:s="http://www.w3.org/2000/svg"><s:script>alert(1)</s:script></svg>'
      },
      {
        source: 'prefixed html',
        svg: '<svg xmlns="http://www.w3.org/2000/svg"><h:img xmlns:h="http://www.w3.org/1999/xhtml" src="x" h:onerror="alert(1)"/></svg>'
      },
      {
        source: 'entity',
        svg: '<svg xmlns="http://www.w3.org/2000/svg"><a href="jav&#x61;script:alert(1)"><text>x</text></a></svg>'
      },
      {
        source: 'escape',
        svg: '<svg xmlns="http://www.w3.org/2000/svg"><g style="filter:u\\72l(https://attacker.example/t.svg#f)"/></svg>'
      },
      {
        source: 'escaped sheet',
        svg: '<svg xmlns="http://www.w3.org/2000/svg"><style>.a{filter:u\\72l(https://attacker.example/t.svg#f)}</style></svg>'
      },
      { source: 42, svg },
      { source: 'none' },
      'graph TD'
    ]
    expect(diagramsRequest(asked)).toEqual(new Map())
    expect(diagramsRequest(undefined)).toEqual(new Map())
    expect(diagramsRequest({ source: 'a', svg })).toEqual(new Map())
  })

  it('keep a drawing whose labels say anything, since only its markup is looked at', () => {
    const label =
      '<svg xmlns="http://www.w3.org/2000/svg"><text>Never javascript:alert(1) or <tspan>onclick="x"</tspan> &lt;script&gt;</text></svg>'
    expect(diagramsRequest([{ source: 'label', svg: label }])).toEqual(new Map([['label', label]]))
  })
})
