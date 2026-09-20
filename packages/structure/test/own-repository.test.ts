import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { applyChangeSet, memoryFileSystem } from '@adr-tool/kernel'
import { DECLARATION_PATH, openStructure, planAdopt, type DeclaredComponent } from '../src'
import { nodeFileSystem, repositoryFiles } from './repository-files'

const root = fileURLToPath(new URL('../../../', import.meta.url))

const ids = (components: readonly DeclaredComponent[]): string[] =>
  components.flatMap((component) => [component.id, ...ids(component.children)])

// The done-when of part 2 (docs/plan-structure.md). This repository declares no Components
// yet, so what is read here is the Draft.
it('drafts the Components of this repository from its pnpm workspace', async () => {
  const files = repositoryFiles(root)
  const structure = await openStructure(nodeFileSystem(root), files)

  expect(structure.origin).toBe('draft')
  expect(structure.problems).toEqual([])
  expect(structure.hints).toEqual([])
  expect(structure.canAdopt).toBe(true)

  // The packages of the workspace are the top level. `spikes` is there as long as it exists.
  const top = structure.components.map((component) => component.id)
  expect(top.filter((id) => id !== 'spikes')).toEqual(['app', 'core', 'kernel', 'structure'])
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
  // `structure` has its files directly under src: there is nothing to tell apart yet.
  expect(ids(structure.components).filter((id) => id.startsWith('structure/'))).toEqual([])

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
  const structure = await openStructure(nodeFileSystem(root), files)

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
})
