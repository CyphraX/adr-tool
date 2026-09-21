import { describe, expect, it } from 'vitest'
import { readDeclaration } from '../src/declaration'

const lines = (...text: string[]): string => text.join('\n') + '\n'

describe('reading .arch/components.yml (docs/structure-format.md, section 1)', () => {
  it('reads the keys, and makes the Component ID from the path of map keys', () => {
    const declaration = readDeclaration(
      lines(
        '# a comment',
        'components:',
        '  core:',
        '    name: Domain core',
        '    description: The UI-free core of the Decisions module.',
        '    paths: [packages/core/src/**, "packages/core/test/**"]',
        '    tests:',
        '      - packages/core/checks/**',
        '    components:',
        '      metadata:',
        '        paths: [packages/core/src/metadata/**]',
        '  app:',
        '    paths: [packages/app/src/**]'
      )
    )
    expect(declaration).toEqual({
      kind: 'declared',
      problems: [],
      components: [
        {
          id: 'core',
          name: 'Domain core',
          description: 'The UI-free core of the Decisions module.',
          paths: ['packages/core/src/**', 'packages/core/test/**'],
          tests: ['packages/core/checks/**'],
          children: [
            {
              id: 'core/metadata',
              name: 'metadata',
              paths: ['packages/core/src/metadata/**'],
              tests: [],
              children: []
            }
          ]
        },
        { id: 'app', name: 'app', paths: ['packages/app/src/**'], tests: [], children: [] }
      ]
    })
  })

  it.each([
    ['nothing', undefined],
    ['an empty file', ''],
    ['only comments', '# nothing yet\n'],
    ['no components key', 'version: 1\n'],
    ['components without a value', 'components:\n'],
    ['an empty map', 'components: {}\n']
  ])('declares nothing with %s', (_, text) => {
    expect(readDeclaration(text)).toEqual({ kind: 'absent' })
  })

  it('preserves and ignores keys it does not know, at the top and inside a Component', () => {
    const declaration = readDeclaration(
      lines('owner: team-a', 'components:', '  core:', '    team: a', '    paths: [src/**]')
    )
    expect(declaration.kind === 'declared' && declaration.components[0]!.id).toBe('core')
    expect(declaration.kind === 'declared' && declaration.problems).toEqual([])
  })

  it.each([
    ['not YAML', 'components: [unclosed\n', /YAML/],
    ['a top level that is not a map', '- a\n- b\n', /map/],
    ['components as a list', 'components:\n  - core\n', /"components" must be a map/],
    ['a Component that is not a map', 'components:\n  core: src/**\n', /core must be a map/],
    [
      'paths as a string',
      'components:\n  core:\n    paths: src/**\n',
      /"paths" of core must be a list/
    ],
    ['a pattern that is no string', 'components:\n  core:\n    paths: [[a]]\n', /"paths" of core/],
    [
      'tests as a map',
      'components:\n  core:\n    paths: [a]\n    tests: {a: b}\n',
      /"tests" of core/
    ],
    [
      'a name that is a list',
      'components:\n  core:\n    name: [a]\n    paths: [a]\n',
      /"name" of core/
    ],
    [
      'nested components as a list',
      'components:\n  core:\n    components: [a]\n',
      /"components" of core must be a map/
    ]
  ])('cannot read %s, and says why', (_, text, detail) => {
    const declaration = readDeclaration(text)
    expect(declaration.kind).toBe('unreadable')
    expect(declaration.kind === 'unreadable' && declaration.detail).toMatch(detail)
  })

  it('reads numbers and booleans written as patterns or names as the text they are', () => {
    const declaration = readDeclaration('components:\n  v2:\n    name: 2\n    paths: [2, true]\n')
    expect(declaration.kind === 'declared' && declaration.components[0]).toMatchObject({
      name: '2',
      paths: ['2', 'true']
    })
  })

  it('reports a segment that is not valid, and still reads the Component', () => {
    const declaration = readDeclaration(
      lines(
        'components:',
        '  Core:',
        '    paths: [a/**]',
        '  my_app:',
        '    paths: [b/**]',
        '  -lead:',
        '    paths: [c/**]',
        '  a/b:',
        '    paths: [d/**]',
        '  ok-1:',
        '    paths: [e/**]'
      )
    )
    expect(declaration.kind === 'declared' && declaration.problems).toEqual([
      { kind: 'invalid-segment', component: 'Core', segment: 'Core' },
      { kind: 'invalid-segment', component: 'my_app', segment: 'my_app' },
      { kind: 'invalid-segment', component: '-lead', segment: '-lead' },
      { kind: 'invalid-segment', component: 'a/b', segment: 'a/b' }
    ])
    expect(declaration.kind === 'declared' && declaration.components).toHaveLength(5)
  })

  it('reports a key that occurs twice in one map, and reads the first', () => {
    const declaration = readDeclaration(
      lines(
        'components:',
        '  core:',
        '    paths: [first/**]',
        '    components:',
        '      io:',
        '        paths: [x/**]',
        '      io:',
        '        paths: [y/**]',
        '  core:',
        '    paths: [second/**]'
      )
    )
    expect(declaration.kind === 'declared' && declaration.problems).toEqual([
      { kind: 'duplicate-component', component: 'core/io' },
      { kind: 'duplicate-component', component: 'core' }
    ])
    expect(declaration.kind === 'declared' && declaration.components[0]!.paths).toEqual([
      'first/**'
    ])
  })

  it('reports a Component that has neither paths nor components', () => {
    const declaration = readDeclaration(
      lines(
        'components:',
        '  empty:',
        '  named:',
        '    name: Only a name',
        '  parent:',
        '    components:',
        '      child:',
        '        paths: [a/**]'
      )
    )
    expect(declaration.kind === 'declared' && declaration.problems).toEqual([
      { kind: 'empty-component', component: 'empty' },
      { kind: 'empty-component', component: 'named' }
    ])
  })

  it('reads a file with CRLF line endings and a byte order mark', () => {
    const declaration = readDeclaration(
      String.fromCharCode(0xfeff) + 'components:\r\n  core:\r\n    paths: [src/**]\r\n'
    )
    expect(declaration.kind === 'declared' && declaration.components[0]!.paths).toEqual(['src/**'])
  })
})
