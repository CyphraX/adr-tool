import { describe, expect, it } from 'vitest'
import {
  conformanceRepairRequest,
  createRequest,
  diagramsRequest,
  exceptionRequest,
  metadataEditRequest,
  migrationRequest,
  renameRequest,
  repairRequest,
  ruleRequest
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

describe('a Rule, an Exception or a Repair of the Rules as the renderer sends it', () => {
  const draft = {
    id: 'billing-not-web',
    why: 'Billing is the domain.',
    kind: 'must-not-depend',
    from: ['billing'],
    to: ['web']
  }

  it('names a Rule to add, change or remove, of a kind conformance knows, and nothing else', () => {
    expect(ruleRequest({ action: 'add', draft })).toEqual({ action: 'add', draft })
    expect(ruleRequest({ action: 'change', id: 'old', draft: { ...draft, extra: 1 } })).toEqual({
      action: 'change',
      id: 'old',
      draft
    })
    expect(ruleRequest({ action: 'remove', id: 'old', draft })).toEqual({
      action: 'remove',
      id: 'old'
    })
    const threshold = {
      id: 'simple',
      why: 'W.',
      kind: 'threshold',
      metric: 'complexity',
      max: 10,
      of: ['billing'],
      ignoreTypeOnly: true
    }
    // A threshold has no type-only option: it is left behind.
    const { ignoreTypeOnly, ...without } = threshold
    expect(ignoreTypeOnly).toBe(true)
    expect(ruleRequest({ action: 'add', draft: threshold })).toEqual({
      action: 'add',
      draft: without
    })
    expect(
      ruleRequest({
        action: 'add',
        draft: {
          id: 'l',
          why: 'W.',
          kind: 'layers',
          layers: [['web'], ['billing']],
          mode: 'strict'
        }
      })
    ).toMatchObject({ draft: { layers: [['web'], ['billing']], mode: 'strict' } })
    expect(
      ruleRequest({
        action: 'add',
        draft: { id: 'c', why: 'W.', kind: 'no-cycles', scope: 'inside', components: ['billing'] }
      })
    ).toMatchObject({ draft: { scope: 'inside', components: ['billing'] } })
  })

  it('turns down a Rule that is not what it should be', () => {
    for (const request of [
      undefined,
      { action: 'add' },
      { action: 'remove' },
      { action: 'change', draft },
      { action: 'rewrite', id: 'x', draft },
      { action: 'add', draft: { ...draft, kind: 'must-not-import' } },
      { action: 'add', draft: { ...draft, to: 'web' } },
      { action: 'add', draft: { ...draft, tests: 'yes' } },
      { action: 'add', draft: { ...draft, why: 1 } },
      {
        action: 'add',
        draft: { id: 'l', why: 'W.', kind: 'layers', layers: [['web']], mode: 'loose' }
      },
      {
        action: 'add',
        draft: { id: 'c', why: 'W.', kind: 'no-cycles', scope: 'around', components: [] }
      },
      {
        action: 'add',
        draft: { id: 's', why: 'W.', kind: 'threshold', metric: 'beauty', max: 1, of: ['web'] }
      },
      {
        action: 'add',
        draft: {
          id: 's',
          why: 'W.',
          kind: 'threshold',
          metric: 'complexity',
          max: Infinity,
          of: ['web']
        }
      }
    ]) {
      expect(ruleRequest(request), JSON.stringify(request)).toBeUndefined()
    }
  })

  it('names an Exception by a fingerprint of any kind, with its reason and an ADR', () => {
    const fingerprints = [
      { kind: 'dependency', rule: 'r', from: 'billing', to: 'web' },
      { kind: 'cycle', rule: 'r', cycle: ['b', 'a'] },
      { kind: 'component', rule: 'r', component: '/' },
      { kind: 'function', rule: 'r', file: 'src/a.ts', name: 'render' },
      { kind: 'class', rule: 'r', file: 'src/a.ts', name: 'Page' }
    ]
    for (const fingerprint of fingerprints) {
      const request = { fingerprint, reason: 'R.', justifiedBy: 'docs/adr/0001-a' }
      expect(exceptionRequest({ ...request, extra: 1 })).toEqual(request)
    }
    for (const request of [
      { fingerprint: fingerprints[0], reason: 1 },
      { fingerprint: fingerprints[0], reason: 'R.', justifiedBy: 4 },
      { fingerprint: { ...fingerprints[0], kind: 'import' }, reason: 'R.' },
      { fingerprint: { kind: 'dependency', rule: 'r', from: 'billing' }, reason: 'R.' },
      { fingerprint: { kind: 'cycle', rule: 'r', cycle: ['a'] }, reason: 'R.' },
      { fingerprint: { kind: 'function', rule: 'r', file: 'src/a.ts' }, reason: 'R.' }
    ]) {
      expect(exceptionRequest(request), JSON.stringify(request)).toBeUndefined()
    }
  })

  it('names a Repair by its line and fingerprint, and narrows to two members at least', () => {
    const fingerprint = { kind: 'cycle', rule: 'r', cycle: ['a', 'b', 'c'] }
    expect(conformanceRepairRequest({ kind: 'remove-exception', line: 7, fingerprint })).toEqual({
      kind: 'remove-exception',
      line: 7,
      fingerprint
    })
    expect(
      conformanceRepairRequest({
        kind: 'narrow-exception',
        line: 7,
        fingerprint,
        members: ['a', 'b']
      })
    ).toEqual({ kind: 'narrow-exception', line: 7, fingerprint, members: ['a', 'b'] })
    for (const request of [
      { kind: 'narrow-exception', line: 7, fingerprint, members: ['a'] },
      { kind: 'narrow-exception', line: 7, fingerprint, members: 'a, b' },
      { kind: 'remove-exception', line: 7.5, fingerprint },
      { kind: 'remove-exception', line: '7', fingerprint },
      { kind: 'rewrite-exception', line: 7, fingerprint },
      { kind: 'remove-exception', line: 7, fingerprint: { kind: 'cycle', rule: 'r' } }
    ]) {
      expect(conformanceRepairRequest(request), JSON.stringify(request)).toBeUndefined()
    }
  })
})
