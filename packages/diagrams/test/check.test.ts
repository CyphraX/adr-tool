import { describe, expect, it } from 'vitest'
import { memoryFileSystem } from '@adr-tool/kernel'
import { analyseDependencies, openStructure } from '@adr-tool/structure'
import {
  checkDiagram,
  driftOf,
  driftWording,
  problemsOf,
  readDiagram,
  suggestConnections,
  wordingOf,
  type Diagram
} from '../src'

/** A repository in memory, its Components and its Dependencies. */
async function analysed(repository: Record<string, string>) {
  const fs = memoryFileSystem(repository)
  const files = Object.keys(repository)
  const structure = await openStructure(fs, files)
  return { structure, ...(await analyseDependencies(fs, files, structure.sourceFiles)) }
}

const declaration = [
  'components:',
  '  app:',
  '    paths: [src/app/**]',
  '  core:',
  '    paths: [src/core/**]',
  '    components:',
  '      metadata:',
  '        paths: [src/core/metadata/**]',
  '        components:',
  '          keys:',
  '            paths: [src/core/metadata/keys/**]',
  '          values:',
  '            paths: [src/core/metadata/values/**]',
  '      lifecycle:',
  '        paths: [src/core/lifecycle/**]',
  '  kernel:',
  '    paths: [src/kernel/**]',
  ''
].join('\n')

const repository: Record<string, string> = {
  '.arch/components.yml': declaration,
  'src/app/main.ts': "import { decide } from '../core/lifecycle/decide'\nimport '../core/index'\n",
  'src/core/index.ts': "export * from './lifecycle/decide'\n",
  'src/core/lifecycle/decide.ts':
    "import { key } from '../metadata/keys/key'\nimport { fs } from '../../kernel/fs'\n",
  'src/core/metadata/keys/key.ts': "import type { Value } from '../values/value'\n",
  'src/core/metadata/values/value.ts': "import { key } from '../keys/key'\n",
  'src/core/metadata/read.ts': "import { fs } from '../../kernel/fs'\n",
  'src/kernel/fs.ts': '',
  'src/kernel/fs.test.ts': "import { decide } from '../core/lifecycle/decide'\n"
}

/** A Diagram of these elements and connections, at a level. */
function diagramOf(
  head: string[],
  elements: string[],
  connections: [string, string][] = []
): Diagram {
  const text = [
    ...head,
    'elements:',
    ...elements.flatMap((element, index) => [
      element.startsWith('external ') || element.startsWith('repository ')
        ? `  - ${element.replace(' ', ': ')}`
        : `  - component: ${element}`,
      `    at: [${index * 200}, 0]`
    ]),
    'connections:',
    ...connections.flatMap(([from, to]) => [`  - from: ${from}`, `    to: ${to}`]),
    ''
  ].join('\n')
  const diagram = readDiagram('docs/architecture/diagrams/test.yml', text)
  if (!diagram.readable) throw new Error(wordingOf(diagram.problems[0]))
  return diagram
}

const fitting = (diagram: Diagram, structure: Parameters<typeof checkDiagram>[1]): string[] =>
  checkDiagram(diagram, structure).map(wordingOf)

describe('the elements of a level', () => {
  it('of a container view are the top-level Components', async () => {
    const { structure } = await analysed(repository)
    const diagram = diagramOf(['level: container'], ['app', 'core', 'core/metadata', 'external fs'])
    expect(fitting(diagram, structure)).toEqual([
      'core/metadata does not belong in a container view, which shows the Components at the top of the hierarchy.'
    ])
  })

  it('of a component view are the children of its scope, and what stands beside it', async () => {
    const { structure } = await analysed(repository)
    const ofCore = diagramOf(
      ['level: component', 'scope: core'],
      [
        'core/metadata',
        'core/lifecycle',
        'app',
        'kernel',
        'external git',
        'core',
        'core/metadata/keys'
      ]
    )
    expect(fitting(ofCore, structure)).toEqual([
      'core does not belong in the component view of core, which shows the parts of core and the Components beside it and beside what contains it.',
      'core/metadata/keys does not belong in the component view of core, which shows the parts of core and the Components beside it and beside what contains it.'
    ])
    // Deeper: the parts of core/metadata, beside them core/lifecycle, and beside core the rest.
    const ofMetadata = diagramOf(
      ['level: component', 'scope: core/metadata'],
      ['core/metadata/keys', 'core/metadata/values', 'core/lifecycle', 'app', 'kernel', 'core']
    )
    expect(
      checkDiagram(ofMetadata, structure).map(
        (problem) => problem.kind === 'component-does-not-fit' && problem.component
      )
    ).toEqual(['core'])
  })

  it('of a system context are no Components, and only there is the repository shown', async () => {
    const { structure } = await analysed(repository)
    expect(
      fitting(
        diagramOf(['level: system-context'], ['repository suite', 'external git', 'core']),
        structure
      )
    ).toEqual([
      'core does not belong in a system context, which shows the repository as one box and no Component.'
    ])
    expect(
      fitting(diagramOf(['level: container'], ['repository suite', 'app']), structure)
    ).toEqual([
      'The repository suite stands for every Component, and only a system context shows it.'
    ])
  })

  it('are not checked without a level, and a scope that is not declared is a Problem', async () => {
    const { structure } = await analysed(repository)
    expect(fitting(diagramOf([], ['core/metadata/keys', 'app']), structure)).toEqual([])
    const lost = diagramOf(['level: component', 'scope: billing'], ['app', 'billing/x'])
    expect(
      checkDiagram(lost, structure).map((problem) => `${problem.line}: ${wordingOf(problem)}`)
    ).toEqual([
      '2: The Diagram looks into billing, which is not a declared Component.',
      '6: The Diagram shows billing/x, which is not a declared Component.'
    ])
    expect(problemsOf(lost, structure).map((problem) => problem.kind)).toEqual([
      'unknown-scope',
      'component-gone'
    ])
  })
})

describe('suggested connections', () => {
  it('count a Source File for the deepest shown Component that contains it, and never join one to itself', async () => {
    const { structure, dependencies } = await analysed(repository)
    const deep = diagramOf(
      ['level: component', 'scope: core'],
      ['app', 'core/metadata', 'core/lifecycle', 'kernel']
    )
    expect(
      suggestConnections(deep, structure, dependencies).map(
        (one) => `${one.from} > ${one.to} ${one.weight}${one.typeOnly ? ' (type)' : ''}`
      )
    ).toEqual([
      // src/core/index.ts is core's own: the boundary of the view of core.
      'app > core 1',
      'app > core/lifecycle 1',
      'core/lifecycle > core/metadata 1',
      'core/lifecycle > kernel 1',
      'core/metadata > kernel 1'
    ])

    // Where core stands for all it contains, its own files and its parts are one.
    const top = diagramOf(['level: container'], ['app', 'core', 'kernel', 'external git'])
    expect(
      suggestConnections(top, structure, dependencies).map(
        (one) => `${one.from} > ${one.to} ${one.weight}`
      )
    ).toEqual(['app > core 2', 'core > kernel 2'])
    // A file that no shown Component contains counts for none.
    const part = diagramOf(['level: container'], ['app', 'kernel'])
    expect(suggestConnections(part, structure, dependencies)).toEqual([])
  })

  it('in a component view, count the scope’s own files for the scope, as the boundary of the view', async () => {
    const { structure, dependencies } = await analysed(repository)
    const view = (connections: [string, string][]) =>
      diagramOf(
        ['level: component', 'scope: core'],
        ['app', 'core/metadata', 'core/lifecycle', 'kernel'],
        connections
      )
    const through = (diagram: Diagram) =>
      suggestConnections(diagram, structure, dependencies)
        .filter((one) => one.throughScope)
        .map((one) => `${one.from} > ${one.to} ${one.weight}${one.drawn ? ' drawn' : ''}`)
    const drift = (diagram: Diagram) => driftOf(diagram, structure, dependencies).map(driftWording)

    // app uses core through src/core/index.ts, which leads on to core/lifecycle: the
    // Dependency of the one on the other stays inside the scope.
    expect(through(view([]))).toEqual(['app > core 1'])
    expect(drift(view([['app', 'core/lifecycle']]))).toEqual([
      'core/lifecycle depends on core/metadata in the code, through one Source File Dependency, and the Diagram does not connect them.',
      'core/lifecycle depends on kernel in the code, through one Source File Dependency, and the Diagram does not connect them.',
      'core/metadata depends on kernel in the code, through one Source File Dependency, and the Diagram does not connect them.'
    ])
    // Through core's own files, app may reach any part of core: drawn into core/metadata, the
    // connection is not Drift, and it draws app's use of core.
    const intoMetadata = view([
      ['app', 'core/metadata'],
      ['app', 'core/lifecycle'],
      ['core/lifecycle', 'core/metadata'],
      ['core/lifecycle', 'kernel'],
      ['core/metadata', 'kernel']
    ])
    expect(through(intoMetadata)).toEqual(['app > core 1 drawn'])
    expect(drift(intoMetadata)).toEqual([])
    // Drawn into no part of core, app's use of core's own files is Drift; kernel uses none.
    expect(
      drift(
        view([
          ['kernel', 'core/metadata'],
          ['app', 'core/lifecycle'],
          ['core/lifecycle', 'core/metadata'],
          ['core/lifecycle', 'kernel'],
          ['core/metadata', 'kernel']
        ])
      )
    ).toEqual([
      'The Diagram connects kernel to core/metadata, but no Source File of kernel depends on one of core/metadata.'
    ])
    const left = view([
      ['core/lifecycle', 'core/metadata'],
      ['core/lifecycle', 'kernel'],
      ['core/metadata', 'kernel']
    ])
    expect(driftOf(left, structure, dependencies).map((one) => one.kind)).toEqual([
      'scope-dependency-not-in-diagram',
      'dependency-not-in-diagram'
    ])
    expect(drift(left)).toEqual([
      "app depends on core's own files in the code, through one Source File Dependency, and the Diagram connects app to no part of core.",
      'app depends on core/lifecycle in the code, through one Source File Dependency, and the Diagram does not connect them.'
    ])
  })

  it('in a component view, let a part of the scope use what the scope’s own files use', async () => {
    const { structure, dependencies } = await analysed(repository)
    // src/core/metadata/read.ts is core/metadata's own, and uses kernel; keys and values do not.
    const view = diagramOf(
      ['level: component', 'scope: core/metadata'],
      ['core/metadata/keys', 'core/metadata/values', 'core/lifecycle', 'kernel'],
      [
        ['core/metadata/keys', 'kernel'],
        ['core/metadata/values', 'core/lifecycle'],
        ['core/lifecycle', 'core/metadata/keys'],
        ['core/lifecycle', 'kernel'],
        ['core/metadata/keys', 'core/metadata/values'],
        ['core/metadata/values', 'core/metadata/keys']
      ]
    )
    expect(
      suggestConnections(view, structure, dependencies)
        .filter((one) => one.throughScope)
        .map((one) => `${one.from} > ${one.to} ${one.weight}${one.drawn ? ' drawn' : ''}`)
    ).toEqual(['core/metadata > kernel 1 drawn'])
    expect(driftOf(view, structure, dependencies).map(driftWording)).toEqual([
      'The Diagram connects core/metadata/values to core/lifecycle, but no Source File of core/metadata/values depends on one of core/lifecycle.'
    ])
    const without = diagramOf(
      ['level: component', 'scope: core/metadata'],
      ['core/metadata/keys', 'core/metadata/values', 'kernel'],
      [
        ['core/metadata/keys', 'core/metadata/values'],
        ['core/metadata/values', 'core/metadata/keys']
      ]
    )
    expect(driftOf(without, structure, dependencies).map(driftWording)).toEqual([
      "core/metadata's own files depend on kernel in the code, through one Source File Dependency, and the Diagram connects no part of core/metadata to kernel."
    ])
  })

  it('leave test files out unless asked, and give External Systems none', async () => {
    const { structure, dependencies } = await analysed(repository)
    const diagram = diagramOf(
      ['level: container'],
      ['core', 'kernel', 'external git'],
      [
        ['kernel', 'core'],
        ['git', 'kernel'],
        ['kernel', 'git']
      ]
    )
    expect(
      driftOf(diagram, structure, dependencies).map((one) => `${one.kind} ${one.from} > ${one.to}`)
    ).toEqual(['connection-not-in-code kernel > core', 'dependency-not-in-diagram core > kernel'])
    expect(
      driftOf(diagram, structure, dependencies, { tests: true }).map(
        (one) => `${one.kind} ${one.from} > ${one.to}`
      )
    ).toEqual(['dependency-not-in-diagram core > kernel'])
  })

  it('and Drift need a declaration: none on a Draft, nor Problems about Component IDs', async () => {
    const undeclared = Object.fromEntries(
      Object.entries(repository).filter(([path]) => path !== '.arch/components.yml')
    )
    const { structure, dependencies } = await analysed(undeclared)
    expect(structure.origin).toBe('draft')
    const diagram = diagramOf(['level: container'], ['app', 'gone'], [['gone', 'app']])
    expect(checkDiagram(diagram, structure)).toEqual([])
    expect(suggestConnections(diagram, structure, dependencies)).toEqual([])
    expect(driftOf(diagram, structure, dependencies)).toEqual([])

    const unreadable = await analysed({ ...repository, '.arch/components.yml': 'components: [x\n' })
    expect(unreadable.structure.origin).toBe('draft')
    expect(checkDiagram(diagram, unreadable.structure)).toEqual([])
  })

  it('give a connection to an element whose Component is gone no Drift: the Problem says it', async () => {
    const { structure, dependencies } = await analysed(repository)
    const diagram = diagramOf(
      ['level: container'],
      ['app', 'core', 'billing'],
      [
        ['app', 'core'],
        ['billing', 'core']
      ]
    )
    expect(driftOf(diagram, structure, dependencies)).toEqual([])
    expect(problemsOf(diagram, structure).map((problem) => problem.kind)).toEqual([
      'component-gone'
    ])
  })
})
