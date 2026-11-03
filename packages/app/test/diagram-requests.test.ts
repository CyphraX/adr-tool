import { describe, expect, it } from 'vitest'
import {
  DIAGRAM_TEXT_LIMIT,
  diagramEditsRequest,
  diagramProblemRequest,
  diagramTextRequest,
  newDiagramRequest
} from '../src/main/diagram-requests'

// What the window sends for its Diagrams goes on only as the contract says it, field by field.

describe('the edits of the canvas, as the window sends them', () => {
  const edits = [
    { kind: 'move-element', id: 'web', at: { x: 40, y: 60 } },
    { kind: 'add-element', element: { kind: 'component', id: 'shop', at: { x: 0, y: 0 } } },
    {
      kind: 'add-element',
      element: { kind: 'external', id: 'github', name: 'GitHub', at: { x: 300, y: 0 } }
    },
    { kind: 'remove-element', id: 'gone' },
    { kind: 'describe-element', id: 'github', description: 'Hosts the code.' },
    { kind: 'add-connection', from: 'web', to: 'shop', label: 'sells' },
    { kind: 'remove-connection', from: 'web', to: 'gone' },
    { kind: 'relabel-connection', from: 'web', to: 'shop' }
  ]

  it('go on when each is exactly an edit', () => {
    expect(diagramEditsRequest(edits)).toEqual(edits)
  })

  it('leave behind whatever else they carry', () => {
    expect(
      diagramEditsRequest([
        { kind: 'remove-element', id: 'web', path: '../../outside.yml' },
        {
          kind: 'add-element',
          element: { kind: 'component', id: 'shop', name: 'x', at: { x: 1, y: 2, z: 3 } }
        }
      ])
    ).toEqual([
      { kind: 'remove-element', id: 'web' },
      { kind: 'add-element', element: { kind: 'component', id: 'shop', at: { x: 1, y: 2 } } }
    ])
  })

  it('are dropped as a whole for one that is not an edit', () => {
    for (const wrong of [
      { kind: 'rewrite', text: 'level: container\n' },
      { kind: 'move-element', id: 'web', at: { x: '40', y: 60 } },
      { kind: 'move-element', id: 'web', at: { x: Number.NaN, y: 60 } },
      { kind: 'add-element', element: { kind: 'person', id: 'p', at: { x: 0, y: 0 } } },
      { kind: 'add-connection', from: 'web' },
      { kind: 'relabel-connection', from: 'web', to: 'shop', label: 3 },
      null
    ]) {
      expect(diagramEditsRequest([edits[0], wrong])).toBeUndefined()
    }
    expect(diagramEditsRequest('move')).toBeUndefined()
  })
})

describe('a new Diagram, as the dialog starts it', () => {
  const diagram = {
    id: 'containers',
    title: 'The containers',
    level: 'container',
    elements: [{ kind: 'component', id: 'web', at: { x: 16, y: 16 } }],
    connections: [{ from: 'web', to: 'shop' }]
  }

  it('goes on when it is one', () => {
    expect(newDiagramRequest(diagram)).toEqual(diagram)
    const view = { ...diagram, level: 'component', scope: 'shop', description: 'Inside.' }
    expect(newDiagramRequest(view)).toEqual(view)
  })

  it('is dropped with a level the format does not have, or a list that is none', () => {
    expect(newDiagramRequest({ ...diagram, level: 'deployment' })).toBeUndefined()
    expect(newDiagramRequest({ ...diagram, elements: {} })).toBeUndefined()
    expect(newDiagramRequest({ ...diagram, connections: [{ from: 'web' }] })).toBeUndefined()
    expect(newDiagramRequest({ ...diagram, title: 7 })).toBeUndefined()
  })
})

describe('a Problem of a Diagram to repair', () => {
  it('is one whose Repair exists, rebuilt field by field', () => {
    const gone = { kind: 'component-gone', path: 'd/a.yml', line: 4, component: 'web' }
    expect(diagramProblemRequest({ ...gone, extra: true })).toEqual(gone)
    const stale = { kind: 'stale-picture', path: 'd/a.yml', line: 1, picture: 'd/a.svg' }
    expect(diagramProblemRequest(stale)).toEqual(stale)
    expect(diagramProblemRequest({ kind: 'no-level', path: 'd/a.yml', line: 1 })).toBeUndefined()
    expect(diagramProblemRequest({ ...gone, line: '4' })).toBeUndefined()
  })
})

describe('the text of a Diagram, for its Drift', () => {
  it('is text, and not more of it than a Diagram is', () => {
    expect(diagramTextRequest('level: container\n')).toBe('level: container\n')
    expect(diagramTextRequest(3)).toBeUndefined()
    expect(diagramTextRequest('x'.repeat(DIAGRAM_TEXT_LIMIT + 1))).toBeUndefined()
  })
})
