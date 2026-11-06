import { describe, expect, it } from 'vitest'
import { memoryFileSystem, Refusal, sentenceOf, type Plan } from '@adr-tool/kernel'
import {
  DIAGRAMS_SENTENCES,
  editDiagramText,
  planDiagramEdit,
  readDiagram,
  type DiagramEdit,
  type DiagramsSaid
} from '../src'

// The edits of the window and of agents (docs/diagrams-format.md, section 2, "How the suite
// writes"): each changes the lines it is about and nothing else, or is refused with a sentence.

const PATH = 'docs/architecture/diagrams/containers.yml'

const lines = (...text: string[]): string => text.map((line) => `${line}\n`).join('')

const edited = (text: string, ...edits: DiagramEdit[]): string => editDiagramText(PATH, text, edits)

/** Why an edit is refused, as its code; the reason is the English sentence of the code. */
function refusedWith(text: string, ...edits: DiagramEdit[]): DiagramsSaid {
  try {
    editDiagramText(PATH, text, edits)
  } catch (error) {
    if (!(error instanceof Refusal)) throw error
    expect(sentenceOf(DIAGRAMS_SENTENCES, error.said as DiagramsSaid)).toBe(error.message)
    return error.said as DiagramsSaid
  }
  throw new Error('edited, not refused')
}

const shop = lines(
  '# The containers of the shop.',
  'title: The shop',
  'level: container',
  'elements:',
  '  - component: web',
  '    at: [480, 40] # where Lena put it',
  '  - component: billing',
  '    at: [260, 40]',
  '    size: [140, 60]',
  '',
  '  # the bank, from elsewhere',
  '  - external: bank',
  '    name: The bank',
  '    at: [40, 160]',
  'connections:',
  '  - from: web',
  '    to: billing',
  '    label: shows invoices',
  '  - from: billing',
  '    to: bank',
  'extra: kept # a key the suite does not know'
)

describe('moving an element', () => {
  it('changes the one line of its position', () => {
    expect(edited(shop, { kind: 'move-element', id: 'billing', at: { x: 300, y: 80 } })).toBe(
      shop.replace('    at: [260, 40]\n', '    at: [300, 80]\n')
    )
  })

  it('keeps a comment behind the position, and writes whole numbers', () => {
    expect(edited(shop, { kind: 'move-element', id: 'web', at: { x: 500.4, y: -19.6 } })).toBe(
      shop.replace('[480, 40] # where', '[500, -20] # where')
    )
  })

  it('moves an element written in braces within its braces', () => {
    const text = lines('level: container', 'elements:', '  - { component: web, at: [1, 2] }')
    expect(edited(text, { kind: 'move-element', id: 'web', at: { x: 20, y: 40 } })).toBe(
      lines('level: container', 'elements:', '  - { component: web, at: [20, 40] }')
    )
  })

  it('is refused for a position written over several lines, and for one out of reach', () => {
    const block = lines('elements:', '  - component: web', '    at:', '      - 1', '      - 2')
    expect(refusedWith(block, { kind: 'move-element', id: 'web', at: { x: 0, y: 0 } })).toEqual({
      code: 'cannot-edit-diagram',
      values: { path: PATH, edit: { code: 'editing-move', values: { id: 'web' } } }
    })
    // In brackets, but over two lines, with a comment between them that would go.
    const broken = lines('elements:', '  - component: web', '    at: [0, # stays put', '      0]')
    expect(
      refusedWith(broken, { kind: 'move-element', id: 'web', at: { x: 20, y: 20 } }).code
    ).toBe('cannot-edit-diagram')
    // An anchor: what an alias of it says would change with it. (A Diagram with an alias where
    // the suite reads cannot be read at all.)
    const anchored = lines('elements:', '  - component: web', '    at: &start [0, 0]')
    expect(
      refusedWith(anchored, { kind: 'move-element', id: 'web', at: { x: 20, y: 20 } }).code
    ).toBe('cannot-edit-diagram')
    expect(
      refusedWith(shop, { kind: 'move-element', id: 'web', at: { x: 2_000_000, y: 0 } }).code
    ).toBe('invalid-position')
    expect(refusedWith(shop, { kind: 'move-element', id: 'gone', at: { x: 0, y: 0 } })).toEqual({
      code: 'no-longer-shows',
      values: { path: PATH, component: 'gone' }
    })
  })
})

describe('adding an element', () => {
  it('writes a Component at the end of the elements, in the style of the items before it', () => {
    expect(
      edited(shop, {
        kind: 'add-element',
        element: { kind: 'component', id: 'persistence', at: { x: 40, y: 40 } }
      })
    ).toBe(
      shop.replace(
        '    at: [40, 160]\n',
        '    at: [40, 160]\n  - component: persistence\n    at: [40, 40]\n'
      )
    )
  })

  it('writes an External System with its name and description, quoted where YAML needs it', () => {
    expect(
      edited(shop, {
        kind: 'add-element',
        element: {
          kind: 'external',
          id: 'github',
          name: 'GitHub',
          description: 'Hosts the repository: issues, pull requests',
          at: { x: 700, y: 160 }
        }
      })
    ).toBe(
      shop.replace(
        '    at: [40, 160]\n',
        [
          '    at: [40, 160]',
          '  - external: github',
          '    name: GitHub',
          '    description: "Hosts the repository: issues, pull requests"',
          '    at: [700, 160]',
          ''
        ].join('\n')
      )
    )
  })

  it('starts the list where there is none, or an empty one, and keeps the line endings', () => {
    const add: DiagramEdit = {
      kind: 'add-element',
      element: { kind: 'component', id: 'web', at: { x: 0, y: 0 } }
    }
    expect(edited(lines('level: container'), add)).toBe(
      lines('level: container', 'elements:', '  - component: web', '    at: [0, 0]')
    )
    expect(edited(lines('level: container', 'connections: []'), add)).toBe(
      lines(
        'level: container',
        'elements:',
        '  - component: web',
        '    at: [0, 0]',
        'connections: []'
      )
    )
    expect(edited(lines('level: container', 'elements: []'), add)).toBe(
      lines('level: container', 'elements:', '  - component: web', '    at: [0, 0]')
    )
    expect(edited('level: container\r\nelements: # none yet\r\n', add)).toBe(
      'level: container\r\nelements: # none yet\r\n  - component: web\r\n    at: [0, 0]\r\n'
    )
    expect(edited('level: container', add)).toBe(
      'level: container\nelements:\n  - component: web\n    at: [0, 0]\n'
    )
  })

  it('is refused for an ID that is shown already, or that no External System can have', () => {
    expect(
      refusedWith(shop, {
        kind: 'add-element',
        element: { kind: 'external', id: 'web', at: { x: 0, y: 0 } }
      })
    ).toEqual({ code: 'already-shown', values: { path: PATH, id: 'web' } })
    expect(
      refusedWith(shop, {
        kind: 'add-element',
        element: { kind: 'external', id: 'GitHub', at: { x: 0, y: 0 } }
      })
    ).toEqual({ code: 'invalid-element-id', values: { id: 'GitHub' } })
  })

  it('is refused for elements written as a list in brackets', () => {
    const text = lines('level: container', 'elements: [{ component: web, at: [0, 0] }]')
    expect(
      refusedWith(text, {
        kind: 'add-element',
        element: { kind: 'component', id: 'billing', at: { x: 0, y: 0 } }
      })
    ).toEqual({
      code: 'cannot-edit-diagram',
      values: { path: PATH, edit: { code: 'editing-add', values: { id: 'billing' } } }
    })
  })
})

describe('removing an element', () => {
  it('takes out its lines and those of its connections, and nothing else', () => {
    expect(edited(shop, { kind: 'remove-element', id: 'bank' })).toBe(
      lines(
        '# The containers of the shop.',
        'title: The shop',
        'level: container',
        'elements:',
        '  - component: web',
        '    at: [480, 40] # where Lena put it',
        '  - component: billing',
        '    at: [260, 40]',
        '    size: [140, 60]',
        '',
        '  # the bank, from elsewhere',
        'connections:',
        '  - from: web',
        '    to: billing',
        '    label: shows invoices',
        'extra: kept # a key the suite does not know'
      )
    )
  })

  it('is refused for an element the Diagram does not show', () => {
    expect(refusedWith(shop, { kind: 'remove-element', id: 'gone' }).code).toBe('no-longer-shows')
  })
})

describe('the name and description of an External System', () => {
  it('changes the lines of its keys, adds a key in its place, and takes out an empty one', () => {
    expect(
      edited(shop, {
        kind: 'describe-element',
        id: 'bank',
        name: 'The bank',
        description: 'Takes the payments.'
      })
    ).toBe(
      shop.replace(
        '    name: The bank\n',
        '    name: The bank\n    description: Takes the payments.\n'
      )
    )
    expect(edited(shop, { kind: 'describe-element', id: 'bank', name: 'Bank' })).toBe(
      shop.replace('    name: The bank\n', '    name: Bank\n')
    )
    expect(edited(shop, { kind: 'describe-element', id: 'bank' })).toBe(
      shop.replace('    name: The bank\n', '')
    )
  })

  it('is refused for a Component, whose words are those of its declaration', () => {
    expect(refusedWith(shop, { kind: 'describe-element', id: 'web', name: 'Shop' })).toEqual({
      code: 'named-by-declaration',
      values: { id: 'web' }
    })
  })
})

describe('connections', () => {
  it('adds one at the end of the connections, with its label', () => {
    expect(
      edited(shop, { kind: 'add-connection', from: 'bank', to: 'web', label: 'confirms payments' })
    ).toBe(
      shop.replace(
        '    to: bank\n',
        '    to: bank\n  - from: bank\n    to: web\n    label: confirms payments\n'
      )
    )
    expect(
      edited(
        lines(
          'level: container',
          'elements:',
          '  - component: a',
          '    at: [0, 0]',
          '  - component: b',
          '    at: [1, 1]'
        ),
        { kind: 'add-connection', from: 'a', to: 'b' }
      )
    ).toBe(
      lines(
        'level: container',
        'elements:',
        '  - component: a',
        '    at: [0, 0]',
        '  - component: b',
        '    at: [1, 1]',
        'connections:',
        '  - from: a',
        '    to: b'
      )
    )
  })

  it('removes one by its lines', () => {
    expect(edited(shop, { kind: 'remove-connection', from: 'web', to: 'billing' })).toBe(
      shop.replace('  - from: web\n    to: billing\n    label: shows invoices\n', '')
    )
  })

  it('labels one: changes its label, adds one after "to", or takes it out', () => {
    expect(
      edited(shop, { kind: 'relabel-connection', from: 'web', to: 'billing', label: 'bills' })
    ).toBe(shop.replace('label: shows invoices', 'label: bills'))
    expect(
      edited(shop, { kind: 'relabel-connection', from: 'billing', to: 'bank', label: 'pays: now' })
    ).toBe(shop.replace('    to: bank\n', '    to: bank\n    label: "pays: now"\n'))
    expect(edited(shop, { kind: 'relabel-connection', from: 'web', to: 'billing' })).toBe(
      shop.replace('    label: shows invoices\n', '')
    )
  })

  it('is refused where it makes no sense, or where it cannot be written line by line', () => {
    expect(refusedWith(shop, { kind: 'add-connection', from: 'web', to: 'billing' })).toEqual({
      code: 'already-connected',
      values: { from: 'web', to: 'billing' }
    })
    expect(refusedWith(shop, { kind: 'add-connection', from: 'web', to: 'web' })).toEqual({
      code: 'connected-to-itself',
      values: { id: 'web' }
    })
    expect(refusedWith(shop, { kind: 'add-connection', from: 'web', to: 'gone' }).code).toBe(
      'no-longer-shows'
    )
    expect(refusedWith(shop, { kind: 'remove-connection', from: 'bank', to: 'web' })).toEqual({
      code: 'not-connected',
      values: { path: PATH, from: 'bank', to: 'web' }
    })
    const braces = lines(
      'elements:',
      '  - component: a',
      '    at: [0, 0]',
      '  - component: b',
      '    at: [1, 1]',
      'connections:',
      '  - { from: a, to: b }'
    )
    expect(
      refusedWith(braces, { kind: 'relabel-connection', from: 'a', to: 'b', label: 'uses' })
    ).toEqual({
      code: 'cannot-edit-diagram',
      values: { path: PATH, edit: { code: 'editing-label', values: { from: 'a', to: 'b' } } }
    })
    // A label over two lines, or one with an anchor.
    const twoLines = lines(
      'elements:',
      '  - component: a',
      '    at: [0, 0]',
      '  - component: b',
      '    at: [1, 1]',
      'connections:',
      '  - from: a',
      '    to: b',
      '    label: shows the',
      '      invoices',
      '  - from: b',
      '    to: a',
      '    label: &same reads'
    )
    expect(
      refusedWith(twoLines, { kind: 'relabel-connection', from: 'a', to: 'b', label: 'bills' }).code
    ).toBe('cannot-edit-diagram')
    expect(
      refusedWith(twoLines, { kind: 'relabel-connection', from: 'b', to: 'a', label: 'writes' })
        .code
    ).toBe('cannot-edit-diagram')
  })
})

describe('the lines around an item', () => {
  const commented = lines(
    'level: container',
    'elements:',
    '  - component: web',
    '    at: [0, 0]',
    '    # more about web',
    '  # the end of the elements',
    'connections:'
  )

  it('a new item is written as the one before it, with the room after its "-"', () => {
    const wide = lines('elements:', '  -   component: web', '      at: [0, 0]')
    expect(
      edited(wide, {
        kind: 'add-element',
        element: { kind: 'component', id: 'billing', at: { x: 200, y: 0 } }
      })
    ).toBe(wide + lines('  -   component: billing', '      at: [200, 0]'))
  })

  it('its comments stay with it: a new item goes below them, and they go with it', () => {
    expect(
      edited(commented, {
        kind: 'add-element',
        element: { kind: 'external', id: 'bank', at: { x: 0, y: 100 } }
      })
    ).toBe(
      commented.replace(
        '    # more about web\n',
        '    # more about web\n  - external: bank\n    at: [0, 100]\n'
      )
    )
    expect(edited(commented, { kind: 'remove-element', id: 'web' })).toBe(
      lines('level: container', 'elements:', '  # the end of the elements', 'connections:')
    )
  })
})

describe('several edits', () => {
  it('apply one after another, each to the text the one before left', () => {
    const after = edited(
      shop,
      {
        kind: 'add-element',
        element: { kind: 'component', id: 'persistence', at: { x: 40, y: 40 } }
      },
      { kind: 'add-connection', from: 'billing', to: 'persistence', label: 'stores' },
      { kind: 'move-element', id: 'persistence', at: { x: 40, y: 60 } },
      { kind: 'remove-element', id: 'bank' }
    )
    const diagram = readDiagram(PATH, after)
    if (!diagram.readable) throw new Error('unreadable')
    expect(diagram.elements.map(({ id, at }) => `${id} ${at.x},${at.y}`)).toEqual([
      'web 480,40',
      'billing 260,40',
      'persistence 40,60'
    ])
    expect(diagram.connections.map(({ from, to, label }) => `${from}>${to} ${label}`)).toEqual([
      'web>billing shows invoices',
      'billing>persistence stores'
    ])
    // What no edit was about stays as it was, byte for byte.
    expect(after.startsWith(shop.slice(0, shop.indexOf('  # the bank')))).toBe(true)
    expect(after.endsWith('extra: kept # a key the suite does not know\n')).toBe(true)
  })

  it('are refused for a file that cannot be read', () => {
    expect(refusedWith('elements: [x\n', { kind: 'remove-element', id: 'web' }).code).toBe(
      'unreadable-diagram'
    )
  })
})

describe('planning the edits', () => {
  function planned(plan: Plan): { before: string; after: string }[] {
    if (!plan.ok) throw new Error(plan.reason)
    return plan.changeSet.files.map(({ before, after }) => ({ before, after }))
  }

  it('plans them against the file as it is on disk now, as one change of its lines', async () => {
    const fs = memoryFileSystem({ [PATH]: shop })
    const edits: DiagramEdit[] = [{ kind: 'move-element', id: 'web', at: { x: 0, y: 0 } }]
    expect(planned(await planDiagramEdit(fs, PATH, edits))).toEqual([
      { before: shop, after: shop.replace('[480, 40]', '[0, 0]') }
    ])
    expect(planned(await planDiagramEdit(fs, PATH, []))).toEqual([])
  })

  it('is refused for a file that is gone, or an edit that no longer applies', async () => {
    const gone = await planDiagramEdit(memoryFileSystem({}), PATH, [
      { kind: 'remove-element', id: 'web' }
    ])
    expect(gone.ok ? undefined : gone.said).toEqual({
      code: 'no-longer-exists',
      values: { path: PATH }
    })
    const moved = await planDiagramEdit(memoryFileSystem({ [PATH]: shop }), PATH, [
      { kind: 'remove-element', id: 'shipping' }
    ])
    expect(moved.ok ? undefined : moved.said).toEqual({
      code: 'no-longer-shows',
      values: { path: PATH, component: 'shipping' }
    })
  })
})
