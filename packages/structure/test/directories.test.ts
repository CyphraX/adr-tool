import { describe, expect, it } from 'vitest'
import { withDirectories } from '../src/directories'
import { levelOf, type Level } from '../src/levels'
import { matrixOf } from '../src/matrix'
import { metricsOf } from '../src/metrics'
import { analysed } from './shop'

/**
 * `app` has no children and owns code in several directories below `app/src`; `lib` has its
 * code in one directory. A Cycle runs between the directories `state` and `ui`.
 */
const repository: Record<string, string> = {
  '.arch/components.yml': [
    'components:',
    '  app:',
    '    paths: [app/**]',
    '  lib:',
    '    paths: [lib/**]',
    ''
  ].join('\n'),
  'app/src/main.ts': "import { view } from './ui/view'\nimport { store } from './state/store'\n",
  'app/src/ui/view.ts': "import { button } from './widgets/button'\n",
  'app/src/ui/widgets/button.ts': "import { store } from '../../state/store'\n",
  'app/src/state/store.ts':
    "import { view } from '../ui/view'\nimport { lib } from '../../../lib/index'\n",
  'app/src/state/__tests__/store.test.ts': "import { store } from '../store'\n",
  'app/src/deep/only/one/thing.ts': '',
  'lib/index.ts': '',
  'lib/util.ts': "import { lib } from './index'\n"
}

async function levels() {
  const { structure, dependencies } = await analysed(repository)
  return (parent?: string, tests = false) => levelOf(structure, dependencies, parent, { tests })
}

const nodes = (level: Level | undefined) => level!.nodes.map((node) => `${node.kind} ${node.id}`)
const edges = (level: Level | undefined) =>
  level!.edges.map((edge) => `${edge.from} > ${edge.to} ${edge.weight}`)

describe('the directories below a Component without children (docs/structure-format.md, section 4)', () => {
  it('become directory nodes below its base, a directory that only holds one passed over', async () => {
    const { structure } = await analysed(repository)
    const explored = withDirectories(structure)
    const app = explored.components.find((component) => component.id === 'app')!
    const tree = (list: typeof app.children): unknown =>
      list.map((child) => ({
        id: child.id,
        name: child.name,
        directory: 'directory' in child ? child.directory : undefined,
        children: tree(child.children)
      }))
    expect(tree(app.children)).toEqual([
      {
        id: 'app/deep/only/one',
        name: 'deep/only/one',
        directory: 'app/src/deep/only/one',
        children: []
      },
      {
        id: 'app/state',
        name: 'state',
        directory: 'app/src/state',
        children: [
          {
            id: 'app/state/__tests__',
            name: '__tests__',
            directory: 'app/src/state/__tests__',
            children: []
          }
        ]
      },
      {
        id: 'app/ui',
        name: 'ui',
        directory: 'app/src/ui',
        children: [
          { id: 'app/ui/widgets', name: 'widgets', directory: 'app/src/ui/widgets', children: [] }
        ]
      }
    ])
    // Each Source File is owned by the deepest of them; what lies in the base stays the Component's.
    expect(
      Object.fromEntries(explored.sourceFiles.map((file) => [file.path, file.component]))
    ).toMatchObject({
      'app/src/main.ts': 'app',
      'app/src/ui/view.ts': 'app/ui',
      'app/src/ui/widgets/button.ts': 'app/ui/widgets',
      'app/src/state/__tests__/store.test.ts': 'app/state/__tests__',
      'app/src/deep/only/one/thing.ts': 'app/deep/only/one',
      'lib/index.ts': 'lib'
    })
    // What has its code in one directory has no directories, and the declaration is not touched.
    expect(explored.components.find((component) => component.id === 'lib')!.children).toEqual([])
    expect(structure.components.find((component) => component.id === 'app')!.children).toEqual([])
  })

  it('show below the Component its own files first, then its directories, with their Dependencies', async () => {
    const level = (await levels())('app')
    expect(nodes(level)).toEqual([
      'source-file app/src/main.ts',
      'directory app/deep/only/one',
      'directory app/state',
      'directory app/ui'
    ])
    expect(level!.nodes.map((node) => node.files)).toEqual([
      ['app/src/main.ts'],
      ['app/src/deep/only/one/thing.ts'],
      ['app/src/state/store.ts'],
      ['app/src/ui/view.ts', 'app/src/ui/widgets/button.ts']
    ])
    expect(edges(level)).toEqual([
      'app/src/main.ts > app/state 1',
      'app/src/main.ts > app/ui 1',
      'app/state > app/ui 1',
      'app/ui > app/state 1'
    ])
    // A level that shows Source Files names no weakest Dependency.
    expect(level!.cycles).toEqual([
      { members: ['app/state', 'app/ui'], roundTrip: ['app/state', 'app/ui'], typeOnly: false }
    ])
  })

  it('open like a Component, at any depth, down to the Source Files', async () => {
    const level = await levels()
    expect(nodes(level('app/ui'))).toEqual([
      'source-file app/src/ui/view.ts',
      'directory app/ui/widgets'
    ])
    expect(edges(level('app/ui'))).toEqual(['app/src/ui/view.ts > app/ui/widgets 1'])
    expect(nodes(level('app/ui/widgets'))).toEqual(['source-file app/src/ui/widgets/button.ts'])
    expect(nodes(level('app/deep/only/one'))).toEqual([
      'source-file app/src/deep/only/one/thing.ts'
    ])
    // A directory that was passed over is no level, nor is one that is not there.
    expect(level('app/deep')).toBeUndefined()
    expect(level('app/gone')).toBeUndefined()
  })

  it('leave out a directory of test files while test files are left out', async () => {
    const level = await levels()
    expect(nodes(level('app/state'))).toEqual(['source-file app/src/state/store.ts'])
    expect(nodes(level('app/state', true))).toEqual([
      'source-file app/src/state/store.ts',
      'directory app/state/__tests__'
    ])
  })

  it('stay a level of Source Files where the Component has its code in one directory', async () => {
    expect(nodes((await levels())('lib'))).toEqual([
      'source-file lib/index.ts',
      'source-file lib/util.ts'
    ])
  })
})

describe('directory nodes in the matrix and the metrics (section 5)', () => {
  it('can be expanded in the matrix like a Component', async () => {
    const { structure, dependencies } = await analysed(repository)
    const matrix = matrixOf(structure, dependencies, undefined, ['app', 'app/ui'])!
    expect(matrix.rows.map((row) => [row.node.id, row.depth, row.expandable])).toEqual([
      ['lib', 0, true],
      ['app/deep/only/one', 1, true],
      ['app/state', 1, true],
      ['app/ui/widgets', 2, true],
      ['app/src/ui/view.ts', 2, false],
      ['app/src/main.ts', 1, false]
    ])
    expect(matrix.groups.map((group) => group.id)).toEqual(['app', 'app/ui'])
  })

  it('have the metrics of a Component; fan-in and fan-out count directories of the same level', async () => {
    const { structure, dependencies, lineCounts } = await analysed(repository)
    const metrics = metricsOf(structure, dependencies, lineCounts)
    expect(metrics.get('app/ui')).toMatchObject({
      files: 2,
      efferent: 1,
      afferent: 2,
      fanOut: 1,
      fanIn: 1,
      cohesion: 1
    })
    expect(metrics.get('app/state')).toMatchObject({
      files: 1,
      efferent: 1,
      afferent: 2,
      fanOut: 1,
      fanIn: 1
    })
    expect(metrics.get('app/ui/widgets')).toMatchObject({ files: 1, fanOut: 0, fanIn: 0 })
    // A directory of test files only has none while they are left out.
    expect(metrics.has('app/state/__tests__')).toBe(false)
    expect(metrics.get('app')).toMatchObject({ files: 5, fanOut: 1, fanIn: 0 })
  })
})
