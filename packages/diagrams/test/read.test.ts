import { describe, expect, it } from 'vitest'
import { memoryFileSystem } from '@adr-tool/kernel'
import {
  connectionsOf,
  DEFAULT_DIAGRAMS_DIRECTORY,
  diagramsEnglishOf,
  elementsOf,
  openDiagrams,
  readDiagram,
  readLocation,
  svgPathOf,
  wordingOf,
  type Diagram,
  type DiagramProblem
} from '../src'

const PATH = 'docs/architecture/diagrams/packages.yml'

/** A Diagram that can be read. */
function read(text: string): Diagram {
  const diagram = readDiagram(PATH, text)
  if (!diagram.readable) throw new Error(wordingOf(diagram.problems[0]))
  return diagram
}

/** Why a Diagram cannot be read, as its Problem's sentence. */
function unreadable(text: string): string {
  const diagram = readDiagram(PATH, text)
  if (diagram.readable) throw new Error('read')
  expect(diagram.problems[0].kind).toBe('unreadable-diagram')
  return wordingOf(diagram.problems[0])
}

const kinds = (problems: readonly DiagramProblem[]): string[] =>
  problems.map((problem) => `${problem.line}: ${problem.kind}`)

const example = [
  '# docs/architecture/diagrams/packages.yml',
  'title: The packages of Softarch Suite',
  'description: Each package, and which of them uses which.',
  'level: container',
  'elements:',
  '  - component: kernel',
  '    at: [40, 120]',
  '  - component: core',
  '    at: [240, 60]',
  '    size: [160, 64]',
  '  - external: git',
  '    name: git',
  '    description: Holds the history of the repository.',
  '    at: [640, 300.5]',
  'connections:',
  '  - from: core',
  '    to: kernel',
  '    label: reads the disk through its port',
  ''
].join('\n')

describe('a Diagram', () => {
  it('reads as its file says: elements, connections and the layout as written', () => {
    const diagram = read(example)
    expect(diagram).toMatchObject({
      id: 'packages',
      path: PATH,
      title: 'The packages of Softarch Suite',
      description: 'Each package, and which of them uses which.',
      level: 'container',
      problems: []
    })
    expect(diagram.elements).toEqual([
      { kind: 'component', id: 'kernel', at: { x: 40, y: 120 }, line: 6 },
      {
        kind: 'component',
        id: 'core',
        at: { x: 240, y: 60 },
        size: { width: 160, height: 64 },
        line: 8
      },
      {
        kind: 'external',
        id: 'git',
        name: 'git',
        description: 'Holds the history of the repository.',
        at: { x: 640, y: 300.5 },
        line: 11
      }
    ])
    expect(diagram.connections).toEqual([
      { from: 'core', to: 'kernel', label: 'reads the disk through its port', line: 16 }
    ])
    expect(svgPathOf(diagram)).toBe('docs/architecture/diagrams/packages.svg')
  })

  it('gives a plain box its ID as its name, and needs neither a label nor anything at the top', () => {
    const diagram = read(
      [
        'level: system-context',
        'elements:',
        '  - repository: suite',
        '    at: [0, 0]',
        '  - external: github',
        '    at: [-200, 0]',
        'connections:',
        '  - from: suite',
        '    to: github',
        ''
      ].join('\n')
    )
    expect(
      diagram.elements.map((element) => [
        element.kind,
        element.id,
        'name' in element && element.name
      ])
    ).toEqual([
      ['repository', 'suite', 'suite'],
      ['external', 'github', 'github']
    ])
    expect(diagram.connections).toEqual([{ from: 'suite', to: 'github', line: 8 }])
    expect(diagram.title).toBeUndefined()
    expect(read('level: container\nelements:\nconnections:\n').elements).toEqual([])
  })

  it('preserves and ignores the keys it does not know, and a Component’s own name', () => {
    const diagram = read(
      [
        'level: container',
        'owner: Lena',
        'elements:',
        '  - component: core',
        '    name: The core',
        '    colour: blue',
        '    at: [0, 0]',
        ''
      ].join('\n')
    )
    expect(diagram.elements).toEqual([
      { kind: 'component', id: 'core', at: { x: 0, y: 0 }, line: 4 }
    ])
    expect(diagram.problems).toEqual([])
  })

  it('cannot be read when the keys it owns have values of the wrong form, and says where', () => {
    expect(unreadable('elements: [oops\n')).toMatch(
      /^docs\/architecture\/diagrams\/packages\.yml cannot be read: it is not valid YAML: .+\.$/
    )
    expect(unreadable('- a\n- b\n')).toBe(`${PATH} cannot be read: its top level must be a map.`)
    expect(unreadable('level: container\nelements: { core: 1 }\n')).toBe(
      `${PATH} cannot be read: "elements" on line 2 must be a list.`
    )
    expect(unreadable('elements:\n  - core\n')).toBe(
      `${PATH} cannot be read: the item of "elements" on line 2 must be a map.`
    )
    expect(unreadable('title: [a, b]\n')).toBe(
      `${PATH} cannot be read: "title" on line 1 must be a text.`
    )
    expect(unreadable('elements:\n  - at: [0, 0]\n')).toBe(
      `${PATH} cannot be read: the element on line 2 says none of component, external and repository.`
    )
    expect(unreadable('elements:\n  - component: a\n    external: b\n    at: [0, 0]\n')).toBe(
      `${PATH} cannot be read: the element on line 2 says more than one of component, external and repository.`
    )
    expect(unreadable('elements:\n  - component: a\n')).toBe(
      `${PATH} cannot be read: the element on line 2 has no position "at".`
    )
    expect(unreadable('elements:\n  - component: a\n    at: [1, "2"]\n')).toBe(
      `${PATH} cannot be read: "at" on line 3 must be two numbers, [x, y].`
    )
    expect(unreadable('elements:\n  - component: a\n    at: [1, 2, 3]\n')).toMatch(/"at" on line 3/)
    expect(unreadable('elements:\n  - component: a\n    at: [1, .inf]\n')).toMatch(/"at" on line 3/)
    expect(unreadable('elements:\n  - component: a\n    at: [1, 2]\n    size: [0, 10]\n')).toBe(
      `${PATH} cannot be read: "size" on line 4 must be two positive numbers, [width, height].`
    )
    expect(unreadable('elements:\n  - component:\n    at: [1, 2]\n')).toBe(
      `${PATH} cannot be read: "component" on line 2 must be a text.`
    )
    expect(unreadable('connections:\n  - from: a\n    label: x\n')).toBe(
      `${PATH} cannot be read: the connection on line 2 has no "to".`
    )
  })

  // What the review of PR #51 found: of two `to`, the second was silently ignored.
  it('cannot be read when a key it owns is written twice in one map, and says where the second is', () => {
    expect(unreadable('level: container\ntitle: a\nlevel: component\n')).toBe(
      `${PATH} cannot be read: "level" is written a second time on line 3.`
    )
    expect(unreadable('elements:\n  - component: core\n    at: [0, 0]\n    at: [10, 10]\n')).toBe(
      `${PATH} cannot be read: "at" is written a second time on line 4.`
    )
    expect(
      unreadable('elements:\n  - component: core\n    component: kernel\n    at: [0, 0]\n')
    ).toBe(`${PATH} cannot be read: "component" is written a second time on line 3.`)
    expect(
      unreadable(
        [
          'elements:',
          '  - component: core',
          '    at: [0, 0]',
          '  - component: kernel',
          '    at: [200, 0]',
          'connections:',
          '  - from: core',
          '    to: kernel',
          '    label: a',
          '    "to": core',
          ''
        ].join('\n')
      )
    ).toBe(`${PATH} cannot be read: "to" is written a second time on line 10.`)
    // Twice at the top, and in an item later: the top is read first.
    const twice = readDiagram(
      PATH,
      'elements:\n  - external: a\n    name: x\n    name: y\n    at: [0, 0]\nelements:\n'
    )
    expect(twice.readable).toBe(false)
    expect(twice.problems[0]).toMatchObject({
      line: 6,
      detail: { code: 'key-twice', values: { key: 'elements', line: 6 } }
    })
    // Keys it does not know may repeat: they are not read.
    expect(read('level: container\nowner: a\nowner: b\n').problems).toEqual([])
    expect(
      read('elements:\n  - component: core\n    note: a\n    note: b\n    at: [0, 0]\n').elements
    ).toHaveLength(1)
  })

  it('has the Problems of its file, each at its line', () => {
    const diagram = read(
      [
        'level: container',
        'scope: core',
        'elements:',
        '  - component: core',
        '    at: [0, 0]',
        '  - external: GitHub',
        '    at: [200, 0]',
        '  - external: core',
        '    at: [400, 0]',
        'connections:',
        '  - from: core',
        '    to: core',
        '  - from: core',
        '    to: kernal',
        '  - from: core',
        '    to: GitHub',
        '  - from: core',
        '    to: GitHub',
        '    label: again',
        ''
      ].join('\n')
    )
    expect(kinds(diagram.problems)).toEqual([
      '2: scope-without-component-level',
      '6: invalid-element-id',
      '8: duplicate-element',
      '11: self-connection',
      '13: unknown-element',
      '17: duplicate-connection'
    ])
    expect(diagram.problems.map(wordingOf)).toEqual([
      'The Diagram is a container view and has a scope, which only a component view has. The scope is not read.',
      '"GitHub" is not a valid element ID. An element ID consists of lowercase letters, digits and dashes, and starts and ends with a letter or a digit.',
      'core is shown twice. The first one is read.',
      'The connection from core to core is not drawn: an element does not use itself.',
      'The connection from core to kernal names kernal, which is not an element of the Diagram. It is not drawn.',
      'The Diagram connects core to GitHub twice. The first connection is read.'
    ])
    expect(diagram.scope).toBeUndefined()
    // What is read: the first of each ID, and the connections between two different elements.
    expect(elementsOf(diagram).map((element) => `${element.kind} ${element.id}`)).toEqual([
      'component core',
      'external GitHub'
    ])
    expect(connectionsOf(diagram)).toEqual([{ from: 'core', to: 'GitHub', line: 15 }])
  })

  it('needs a level it knows, and a component view its scope', () => {
    expect(kinds(read('elements:\n').problems)).toEqual(['1: no-level'])
    const unknown = read('title: x\nlevel: layers\n')
    expect(kinds(unknown.problems)).toEqual(['2: unknown-level'])
    expect(unknown.level).toBeUndefined()
    expect(wordingOf(unknown.problems[0]!)).toBe(
      'The Diagram has the level "layers", which the suite does not know. A level is one of system-context, container and component.'
    )
    expect(kinds(read('level: component\n').problems)).toEqual(['1: no-scope'])
    expect(read('level: component\nscope: core\n')).toMatchObject({ scope: 'core', scopeLine: 2 })
    expect(read('').problems.map((problem) => problem.kind)).toEqual(['no-level'])
  })
})

describe('where the Diagrams are', () => {
  it('is docs/architecture/diagrams, unless .arch/config.yml says otherwise', () => {
    expect(readLocation(undefined)).toEqual({ directory: DEFAULT_DIAGRAMS_DIRECTORY, problems: [] })
    expect(readLocation('')).toEqual({ directory: DEFAULT_DIAGRAMS_DIRECTORY, problems: [] })
    expect(readLocation('rules: x\n').directory).toBe(DEFAULT_DIAGRAMS_DIRECTORY)
    expect(readLocation('diagrams:\n').directory).toBe(DEFAULT_DIAGRAMS_DIRECTORY)
    expect(readLocation('diagrams: ./design\\diagrams/\n').directory).toBe('design/diagrams')
  })

  it('is nowhere while .arch/config.yml cannot be used, so that the mistake shows', () => {
    const sentence = (text: string): string => {
      const location = readLocation(text)
      expect(location.directory).toBeUndefined()
      return location.problems.map(wordingOf).join(' ')
    }
    expect(sentence('diagrams: [oops\n')).toMatch(
      /^\.arch\/config\.yml cannot be read: it is not valid YAML: .+\. No Diagram is looked for until it is fixed\.$/
    )
    expect(sentence('- diagrams\n')).toBe(
      '.arch/config.yml cannot be read: its top level must be a map. No Diagram is looked for until it is fixed.'
    )
    for (const wrong of ['../elsewhere', '/abs', '.', '[a]', '7']) {
      expect(sentence(`# where\ndiagrams: ${wrong}\n`)).toBe(
        '"diagrams" in .arch/config.yml must be a relative path inside the repository. No Diagram is looked for until it is fixed.'
      )
      expect(readLocation(`# where\ndiagrams: ${wrong}\n`).problems[0]!.line).toBe(2)
    }
  })

  it('lists the .yml files directly in the directory, by ID, and reads each', async () => {
    const fs = memoryFileSystem({
      '.arch/config.yml': 'diagrams: design\n',
      'design/b.yml': 'level: container\n',
      'design/a.yml': 'level: [x\n',
      'design/a.svg': '<svg/>',
      'design/.hidden.yml': 'level: container\n',
      'design/c.yaml': 'level: container\n',
      'design/old/d.yml': 'level: container\n',
      'docs/architecture/diagrams/e.yml': 'level: container\n'
    })
    const found = await openDiagrams(fs)
    expect(found.directory).toBe('design')
    expect(found.problems).toEqual([])
    expect(found.diagrams.map((diagram) => [diagram.id, diagram.path, diagram.readable])).toEqual([
      ['a', 'design/a.yml', false],
      ['b', 'design/b.yml', true]
    ])

    expect(await openDiagrams(memoryFileSystem({}))).toEqual({
      directory: DEFAULT_DIAGRAMS_DIRECTORY,
      problems: [],
      diagrams: []
    })
    const lost = await openDiagrams(
      memoryFileSystem({
        '.arch/config.yml': 'diagrams: ../x\n',
        'docs/architecture/diagrams/e.yml': 'level: container\n'
      })
    )
    expect(lost.diagrams).toEqual([])
    expect(lost.problems.map((problem) => problem.kind)).toEqual(['invalid-diagrams-directory'])
  })

  it('says why a Problem’s file cannot be read in the words of its detail', () => {
    const diagram = readDiagram(PATH, 'elements: 5\n')
    if (diagram.readable) throw new Error('read')
    expect(diagram.problems[0].detail).toEqual({
      code: 'diagram-key-not-list',
      values: { key: 'elements', line: 1 }
    })
    expect(diagramsEnglishOf(diagram.problems[0].detail)).toBe(
      '"elements" on line 1 must be a list'
    )
  })
})
