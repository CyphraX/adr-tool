import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { applyChangeSet, memoryFileSystem, type FileSystem } from '@adr-tool/kernel'
import {
  analyseDependencies,
  DECLARATION_PATH,
  levelOf,
  metricsOf,
  openStructure,
  planAdopt,
  withDirectories,
  type DeclaredComponent
} from '../src'
import { metricsByDefinition } from './metrics-by-definition'
import { nodeFileSystem, repositoryFiles } from './repository-files'

const root = fileURLToPath(new URL('../../../', import.meta.url))

const ids = (components: readonly DeclaredComponent[]): string[] =>
  components.flatMap((component) => [component.id, ...ids(component.children)])

/** This repository as it was before it adopted its Draft: without a declaration. */
function undeclared(): FileSystem {
  const fs = nodeFileSystem(root)
  return {
    readText: async (path) => (path === DECLARATION_PATH ? undefined : fs.readText(path)),
    list: fs.list
  }
}

// The done-when of part 2 (docs/plan-structure.md). This repository has declared its
// Components since part 7; what is read here is the Draft it adopted then.
it('drafts the Components of this repository from its pnpm workspace', async () => {
  const files = repositoryFiles(root)
  const structure = await openStructure(undeclared(), files)

  expect(structure.origin).toBe('draft')
  expect(structure.problems).toEqual([])
  expect(structure.hints).toEqual([])
  expect(structure.canAdopt).toBe(true)

  // The packages of the workspace are the top level.
  const top = structure.components.map((component) => component.id)
  expect(top).toEqual([
    'app',
    'cli',
    'conformance',
    'core',
    'diagrams',
    'kernel',
    'mcp',
    'structure'
  ])
  expect(structure.components.find((component) => component.id === 'core')!.paths).toEqual([
    'packages/core/**'
  ])

  // Beneath them, the directories under their source root.
  expect(ids(structure.components)).toEqual(
    expect.arrayContaining([
      'app/main',
      'app/preload',
      'app/renderer',
      'app/shared',
      'core/lifecycle',
      'core/metadata',
      'core/problems',
      'kernel/change',
      'kernel/fs',
      'kernel/text'
    ])
  )
  // `structure` keeps most of its files directly under src, beside the adapters of its languages.
  expect(ids(structure.components).filter((id) => id.startsWith('structure/'))).toEqual([
    'structure/java',
    'structure/typescript'
  ])

  const owner = (path: string): string | undefined =>
    structure.sourceFiles.find((file) => file.path === path)?.component
  expect(owner('packages/core/src/metadata/write.ts')).toBe('core/metadata')
  expect(owner('packages/core/src/index.ts')).toBe('core')
  expect(owner('packages/core/test/decide.test.ts')).toBe('core')
  expect(owner('packages/app/src/renderer/src/App.svelte')).toBe('app/renderer')
  // Outside of every package: Unassigned, which is a state and not a Problem.
  expect(owner('eslint.config.mjs')).toBeUndefined()

  const tests = structure.sourceFiles.filter((file) => file.test)
  expect(tests.map((file) => file.path)).toContain('packages/kernel/test/pending.test.ts')
  expect(tests.every((file) => /\/test\/|\.test\./.test(file.path))).toBe(true)
  expect(structure.sourceFiles.some((file) => file.path.includes('node_modules'))).toBe(false)
})

it('adopts that Draft into a declaration that reads back as the same Components', async () => {
  const files = repositoryFiles(root)
  const structure = await openStructure(undeclared(), files)

  // Planned against a copy in memory: this test must never write into the repository.
  const copy = memoryFileSystem({})
  const plan = await planAdopt(copy, structure)
  if (!plan.ok) throw new Error(plan.reason)
  await applyChangeSet(copy, plan.changeSet)

  const text = (await copy.readText(DECLARATION_PATH))!
  const adopted = await openStructure(
    { readText: async (path) => (path === DECLARATION_PATH ? text : undefined), list: copy.list },
    files
  )
  expect(adopted.origin).toBe('declared')
  expect(adopted.problems).toEqual([])
  expect(adopted.components).toEqual(structure.components)
  expect(adopted.sourceFiles).toEqual(structure.sourceFiles)

  // And that is what this repository declares: the Draft, adopted in the app (part 7).
  const declared = await openStructure(nodeFileSystem(root), files)
  expect(declared.origin).toBe('declared')
  expect(declared.problems).toEqual([])
  expect(declared.components).toEqual(structure.components)
})

// The done-when of part 3, as far as `structure` goes; the app shows the same in the second
// half of the part.
it('finds the Dependency from app to core, and the Source File Dependencies behind it', async () => {
  const fs = nodeFileSystem(root)
  const files = repositoryFiles(root)
  const structure = await openStructure(fs, files)
  const analysis = await analyseDependencies(fs, files, structure.sourceFiles)

  expect(analysis.notAnalysed).toEqual([])
  expect(analysis.notResolved).toEqual([])

  const top = levelOf(structure, analysis.dependencies)!
  const edges = top.edges.map((edge) => `${edge.from} > ${edge.to}`)
  expect(edges).toEqual(
    expect.arrayContaining(['app > core', 'core > kernel', 'structure > kernel'])
  )
  // One core package per module on a shared kernel (ADR-0006): the cores do not meet, and
  // the kernel depends on nothing.
  expect(
    edges.filter((edge) => /^(?:core > structure|structure > core|kernel > )/.test(edge))
  ).toEqual([])
  // The command line composes both cores, as the app does.
  expect(edges).toEqual(expect.arrayContaining(['cli > core', 'cli > structure']))
  expect(top.cycles).toEqual([])

  const behind = top.edges.find((edge) => edge.from === 'app' && edge.to === 'core')!
  expect(behind.weight).toBe(behind.dependencies.length)
  const users = behind.dependencies.map((dependency) => dependency.from)
  expect(users).toEqual(
    expect.arrayContaining([
      // The main process, under tsconfig.node.json of app's solution-style tsconfig.json …
      'packages/app/src/main/repositories.ts',
      // … the renderer, under tsconfig.web.json …
      'packages/app/src/renderer/src/lib/state.svelte.ts',
      // … and its Svelte components, read from their script blocks.
      'packages/app/src/renderer/src/components/RelationsGraph.svelte'
    ])
  )
  expect(
    behind.dependencies.every((dependency) => dependency.to === 'packages/core/src/index.ts')
  ).toBe(true)
  // The export is written as `adr export` writes it, by the same code (part 10).
  expect(edges).toContain('app > cli')
  // The whole repository is analysed; beside the tests of the other packages, that can take
  // longer than vitest's 5 seconds.
}, 30_000)

// The done-when of part 5, as far as `structure` goes: the app shows these numbers.
it('computes the metrics of this repository as their definitions say', async () => {
  const fs = nodeFileSystem(root)
  const files = repositoryFiles(root)
  const structure = await openStructure(fs, files)
  const { dependencies, lineCounts } = await analyseDependencies(fs, files, structure.sourceFiles)

  const metrics = metricsOf(structure, dependencies, lineCounts)
  // The directories below a Component without children are checked by the same definitions.
  const explored = withDirectories(structure)
  expect(metrics).toEqual(metricsByDefinition(explored, dependencies, lineCounts, false))
  expect([...metrics.keys()]).toContain('app/renderer/lib')
  // The kernel depends on nothing else here, and nothing here depends on the app: the two ends
  // of the scale.
  expect(metrics.get('kernel')!.instability).toBe(0)
  expect(metrics.get('app')!.instability).toBe(1)
  // It uses the cores of Decisions, Structure and Conformance, the export of the command line,
  // and the sentences of Diagrams for its German, and reaches the kernel only through them.
  expect(metrics.get('app')).toMatchObject({ fanOut: 5, fanIn: 0 })
})
