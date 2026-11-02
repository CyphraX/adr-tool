import { describe, expect, it } from 'vitest'
import { applyEdits, memoryFileSystem, sentenceOf, type Plan } from '@adr-tool/kernel'
import {
  DIAGRAMS_SENTENCES,
  planRepair,
  removeComponent,
  type DiagramProblem,
  type DiagramsSaid
} from '../src'

const PATH = 'docs/architecture/diagrams/packages.yml'

const gone = (component: string): DiagramProblem => ({
  kind: 'component-gone',
  path: PATH,
  line: 1,
  component
})

/** What the Repair leaves of a text. */
const repaired = (text: string, component = 'billing'): string =>
  applyEdits(text, removeComponent(PATH, text, component))

/** A refusal: its reason is the English sentence of its code. */
function refused(plan: Plan): DiagramsSaid {
  if (plan.ok) throw new Error('planned, not refused')
  expect(sentenceOf(DIAGRAMS_SENTENCES, plan.said as DiagramsSaid)).toBe(plan.reason)
  return plan.said as DiagramsSaid
}

const lines = (...text: string[]): string => text.map((line) => `${line}\n`).join('')

describe('the Repair of an element whose Component is gone', () => {
  it('takes out its lines and those of its connections, and nothing else', () => {
    const text = lines(
      '# The containers',
      'level: container',
      'elements:',
      '  # the web, first',
      '  - component: web',
      '    at: [480, 40] # where Lena put it',
      '  - component: billing',
      '    # moved twice',
      '    at: [260, 40]',
      '    size: [140, 60]',
      '',
      '  - component: persistence',
      '    at: [40, 40]',
      'connections:',
      '  - from: web',
      '    to: billing',
      '    label: shows invoices',
      '  - from: web',
      '    to: persistence',
      '  - from: billing',
      '    to: persistence # stores',
      'extra: kept'
    )
    expect(repaired(text)).toBe(
      lines(
        '# The containers',
        'level: container',
        'elements:',
        '  # the web, first',
        '  - component: web',
        '    at: [480, 40] # where Lena put it',
        '',
        '  - component: persistence',
        '    at: [40, 40]',
        'connections:',
        '  - from: web',
        '    to: persistence',
        'extra: kept'
      )
    )
  })

  it('keeps the line endings of the file, and handles the last line without a break', () => {
    const text =
      'elements:\r\n  - component: a\r\n    at: [0, 0]\r\n  - component: billing\r\n    at: [1, 1]'
    expect(repaired(text)).toBe('elements:\r\n  - component: a\r\n    at: [0, 0]\r\n')
    expect(repaired('elements:\n  - component: billing\n    at: [1, 1]\n')).toBe('elements:\n')
  })

  it('takes out every element that names the Component, and items written in braces', () => {
    const text = lines(
      'elements:',
      '  - { component: billing, at: [0, 0] } # first',
      '  - component: web',
      '    at: [1, 1]',
      '  - component: billing',
      '    at: [2, 2]',
      'connections:',
      '  - { from: billing, to: web }'
    )
    expect(repaired(text)).toBe(
      lines('elements:', '  - component: web', '    at: [1, 1]', 'connections:')
    )
  })

  it('leaves the connections where an External System keeps the ID', () => {
    const text = lines(
      'elements:',
      '  - external: billing',
      '    at: [0, 0]',
      '  - component: billing',
      '    at: [1, 1]',
      'connections:',
      '  - from: billing',
      '    to: web'
    )
    expect(repaired(text)).toBe(
      lines(
        'elements:',
        '  - external: billing',
        '    at: [0, 0]',
        'connections:',
        '  - from: billing',
        '    to: web'
      )
    )
  })

  it('is refused where an item does not have its lines to itself, with the advice to use an editor', async () => {
    const cannot = (text: string): DiagramsSaid => {
      try {
        removeComponent(PATH, text, 'billing')
      } catch (error) {
        return (error as { said: DiagramsSaid }).said
      }
      throw new Error('not refused')
    }
    const said = {
      code: 'cannot-remove-element',
      values: { path: PATH, component: 'billing' }
    }
    expect(cannot('elements: [{ component: billing, at: [0, 0] }]\n')).toEqual(said)
    expect(
      cannot(lines('elements:', '  - # billing', '    component: billing', '    at: [0, 0]'))
    ).toEqual(said)
    expect(
      cannot(
        lines(
          'elements:',
          '  - component: billing',
          '    at: [0, 0]',
          'connections: [{ from: billing, to: web }]'
        )
      )
    ).toEqual(said)
    expect(
      cannot(lines('elements:', '  - &b', '    component: billing', '    at: [0, 0]'))
    ).toEqual(said)
    expect(sentenceOf(DIAGRAMS_SENTENCES, said as DiagramsSaid)).toBe(
      `${PATH} is written in a way the suite cannot take billing out of. Remove it and its connections in an editor.`
    )
  })

  it('is planned against the file as it is now, and refused where it no longer applies', async () => {
    const text = lines('elements:', '  - component: billing', '    at: [0, 0]')
    const planned = await planRepair(memoryFileSystem({ [PATH]: text }), gone('billing'))
    if (!planned.ok) throw new Error(planned.reason)
    expect(planned.changeSet.files).toEqual([{ path: PATH, before: text, after: 'elements:\n' }])

    expect(
      refused(await planRepair(memoryFileSystem({ [PATH]: 'elements:\n' }), gone('billing')))
    ).toEqual({
      code: 'no-longer-shows',
      values: { path: PATH, component: 'billing' }
    })
    expect(refused(await planRepair(memoryFileSystem({}), gone('billing')))).toEqual({
      code: 'no-longer-exists',
      values: { path: PATH }
    })
    expect(
      refused(await planRepair(memoryFileSystem({ [PATH]: 'elements: [x\n' }), gone('billing')))
        .code
    ).toBe('unreadable-diagram')
    expect(
      refused(
        await planRepair(memoryFileSystem({ [PATH]: text }), {
          kind: 'no-level',
          path: PATH,
          line: 1
        })
      )
    ).toEqual({ code: 'no-diagram-repair', values: {} })
  })
})
