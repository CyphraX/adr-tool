import { describe, expect, it } from 'vitest'
import { memoryFileSystem, readConfig, type Plan } from '@adr-tool/kernel'
import { newDiagramText, planNewDiagram, readDiagram, type NewDiagram } from '../src'

// A new Diagram, as the window starts one from a level of the Component hierarchy, written in
// the style the suite writes (docs/diagrams-format.md, section 2).

const containers: NewDiagram = {
  id: 'containers',
  title: 'The containers of the shop',
  level: 'container',
  elements: [
    { kind: 'component', id: 'persistence', at: { x: 40, y: 40 } },
    { kind: 'component', id: 'web', at: { x: 360, y: 40 } }
  ],
  connections: [{ from: 'web', to: 'persistence' }]
}

describe('a new Diagram', () => {
  it('is written with its keys in their order, every item in block style', () => {
    expect(newDiagramText(containers)).toBe(
      [
        'title: The containers of the shop',
        'level: container',
        'elements:',
        '  - component: persistence',
        '    at: [40, 40]',
        '  - component: web',
        '    at: [360, 40]',
        'connections:',
        '  - from: web',
        '    to: persistence',
        ''
      ].join('\n')
    )
  })

  it('has the scope of a component view, and empty lists where there is nothing yet', () => {
    expect(
      newDiagramText({
        id: 'billing',
        title: 'Inside billing: invoices and payments',
        description: 'What billing is made of.',
        level: 'component',
        scope: 'billing',
        elements: [],
        connections: []
      })
    ).toBe(
      [
        'title: "Inside billing: invoices and payments"',
        'description: What billing is made of.',
        'level: component',
        'scope: billing',
        'elements: []',
        'connections: []',
        ''
      ].join('\n')
    )
  })

  it('writes the repository and External Systems with their words', () => {
    const text = newDiagramText({
      id: 'context',
      level: 'system-context',
      elements: [
        { kind: 'repository', id: 'shop', name: 'The shop', at: { x: 40, y: 40 } },
        { kind: 'external', id: 'bank', description: 'Takes the payments.', at: { x: 360, y: 40 } }
      ],
      connections: [{ from: 'shop', to: 'bank', label: 'pays' }]
    })
    const diagram = readDiagram('context.yml', text)
    if (!diagram.readable) throw new Error('unreadable')
    expect(diagram.problems).toEqual([])
    expect(diagram.elements).toMatchObject([
      { kind: 'repository', id: 'shop', name: 'The shop' },
      { kind: 'external', id: 'bank', name: 'bank', description: 'Takes the payments.' }
    ])
    expect(diagram.connections).toMatchObject([{ from: 'shop', to: 'bank', label: 'pays' }])
  })

  it('is refused for an ID that is no segment, and a component view without its scope', () => {
    const said = (spec: NewDiagram): unknown => {
      try {
        newDiagramText(spec)
      } catch (error) {
        return (error as { said: unknown }).said
      }
      throw new Error('written')
    }
    expect(said({ ...containers, id: 'Containers' })).toEqual({
      code: 'invalid-diagram-id',
      values: { id: 'Containers' }
    })
    expect(said({ ...containers, level: 'component' })).toEqual({ code: 'no-scope', values: {} })
    expect(said({ ...containers, connections: [{ from: 'web', to: 'web' }] })).toEqual({
      code: 'connected-to-itself',
      values: { id: 'web' }
    })
  })
})

describe('planning a new Diagram', () => {
  const files = (plan: Plan<{ path: string }>) => {
    if (!plan.ok) throw new Error(plan.reason)
    return { path: plan.path, files: plan.changeSet.files }
  }

  it('creates its file where the Diagrams are', async () => {
    expect(files(await planNewDiagram(memoryFileSystem({}), containers))).toEqual({
      path: 'docs/architecture/diagrams/containers.yml',
      files: [
        {
          path: 'docs/architecture/diagrams/containers.yml',
          before: '',
          after: newDiagramText(containers),
          creates: true
        }
      ]
    })
    const config = '.arch/config.yml'
    const moved = await planNewDiagram(
      memoryFileSystem({ [config]: 'diagrams: design/pictures\n' }),
      containers
    )
    expect(files(moved).path).toBe('design/pictures/containers.yml')
  })

  it('is refused where the file is there already, or no directory can be used', async () => {
    const taken = await planNewDiagram(
      memoryFileSystem({ 'docs/architecture/diagrams/containers.yml': 'level: container\n' }),
      containers
    )
    expect(taken.ok ? undefined : taken.said).toEqual({
      code: 'already-exists',
      values: { path: 'docs/architecture/diagrams/containers.yml' }
    })
    const nowhere = await planNewDiagram(
      memoryFileSystem({}),
      containers,
      readConfig('diagrams: /etc\n')
    )
    expect(nowhere.ok ? undefined : nowhere.said).toEqual({
      code: 'no-diagrams-directory',
      values: { path: '.arch/config.yml' }
    })
  })
})
