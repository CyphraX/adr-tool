import { describe, expect, it } from 'vitest'
import { memoryFileSystem, type Plan } from '@adr-tool/kernel'
import { planRenameInDiagrams, renameInDiagram } from '../src'

// A Rename of a Component rewrites the Diagrams that show it (docs/diagrams-format.md, section
// 2, "IDs"): in `component` and `scope`, and in `from` and `to` where they name a Component
// element — with the IDs below it — and nowhere else.

const PATH = 'docs/architecture/diagrams/core.yml'

const lines = (...text: string[]): string => text.map((line) => `${line}\n`).join('')

const view = lines(
  '# Inside core; core/adr is where the ADRs are.',
  'title: core and its parts',
  'level: component',
  "scope: 'core'",
  'elements:',
  '  - component: core/adr',
  '    at: [40, 40]',
  '  - component: "core/adr/body"',
  '    at: [40, 160]',
  '  - component: kernel',
  '    at: [300, 40]',
  '  - external: core',
  '    name: Another core, from elsewhere',
  '    at: [600, 40]',
  '  - component: corelike',
  '    at: [600, 160]',
  'connections:',
  '  - from: core/adr',
  '    to: kernel',
  '    label: core reads the disk',
  '  - from: kernel',
  '    to: core',
  '  - from: corelike',
  '    to: core/adr/body'
)

describe('a Rename in a Diagram', () => {
  it('rewrites the Component and the IDs below it where they name a Component, keeping quotes', () => {
    expect(renameInDiagram(PATH, view, 'core', 'kern')).toBe(
      lines(
        '# Inside core; core/adr is where the ADRs are.',
        'title: core and its parts',
        'level: component',
        "scope: 'kern'",
        'elements:',
        '  - component: kern/adr',
        '    at: [40, 40]',
        '  - component: "kern/adr/body"',
        '    at: [40, 160]',
        '  - component: kernel',
        '    at: [300, 40]',
        '  - external: core',
        '    name: Another core, from elsewhere',
        '    at: [600, 40]',
        '  - component: corelike',
        '    at: [600, 160]',
        'connections:',
        '  - from: kern/adr',
        '    to: kernel',
        '    label: core reads the disk',
        '  - from: kernel',
        '    to: core',
        '  - from: corelike',
        '    to: kern/adr/body'
      )
    )
  })

  it('leaves a Diagram alone that does not name the Component', () => {
    expect(renameInDiagram(PATH, view, 'billing', 'invoicing')).toBe(view)
  })

  it('is refused where the ID is written as a block of text', () => {
    const block = lines(
      'level: container',
      'elements:',
      '  - component: >-',
      '      core',
      '    at: [0, 0]'
    )
    let said: unknown
    try {
      renameInDiagram(PATH, block, 'core', 'kern')
    } catch (error) {
      said = (error as { said: unknown }).said
    }
    expect(said).toEqual({
      code: 'cannot-rename-in-diagram',
      values: { path: PATH, component: 'core' }
    })
  })
})

describe('planning a Rename in the Diagrams', () => {
  const planned = (plan: Plan) => {
    if (!plan.ok) throw new Error(plan.reason)
    return plan
  }

  it('rewrites every Diagram that shows the Component, and warns of one it cannot read', async () => {
    const other = 'docs/architecture/diagrams/other.yml'
    const broken = 'docs/architecture/diagrams/broken.yml'
    const fs = memoryFileSystem({
      [PATH]: view,
      [other]: lines('level: container', 'elements:', '  - component: web', '    at: [0, 0]'),
      // An alias is no text the reader takes: the Diagram cannot be read.
      [broken]: lines(
        'level: container',
        'elements:',
        '  - component: &c core',
        '    at: [0, 0]',
        'connections:',
        '  - from: *c',
        '    to: core'
      ),
      'docs/architecture/diagrams/quiet.yml': lines('level: container', 'elements: [x'),
      'docs/architecture/diagrams/core.svg': '<svg/>\n'
    })
    const plan = planned(await planRenameInDiagrams(fs, 'core', 'kern'))
    expect(plan.changeSet.files.map((file) => file.path)).toEqual([PATH])
    expect(plan.changeSet.files[0]!.after).toBe(renameInDiagram(PATH, view, 'core', 'kern'))
    expect(plan.warned).toEqual([
      { code: 'diagram-not-renamed', values: { path: broken, component: 'core' } }
    ])
    expect(plan.warnings).toEqual([
      `${broken} cannot be read, so the Rename does not rewrite what it says of core.`
    ])
  })

  it('plans nothing where no Diagram is', async () => {
    expect(planned(await planRenameInDiagrams(memoryFileSystem({}), 'core', 'kern'))).toEqual({
      ok: true,
      changeSet: { files: [] }
    })
  })
})
