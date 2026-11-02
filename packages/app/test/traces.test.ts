import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { applyChangeSet, memoryFileSystem } from '@adr-tool/core'
import { nodeFileSystem } from '../src/main/node-file-system'
import { declaredComponents, openWithTraces, planComponentRename } from '../src/main/traces'

/** A repository with a declaration and two ADRs that name its Components. */
const REPOSITORY = {
  '.arch/components.yml': [
    'components:',
    '  kernel:',
    '    paths: [packages/kernel/src/**]',
    '  core:',
    '    name: Decisions core',
    '    paths: [packages/core/src/**]',
    '    components:',
    '      metadata:',
    '        paths: [packages/core/src/metadata/**]',
    '  structure:',
    '    paths: [packages/structure/src/**]',
    ''
  ].join('\n'),
  'docs/adr/0001-one-core-per-module.md': [
    '---',
    'status: accepted',
    'affects: [kernel, core, structure]',
    '---',
    '',
    '# One core per module',
    '',
    'The structure package stays apart from core.',
    ''
  ].join('\n'),
  'docs/adr/0002-metadata-keys.md': [
    '---',
    'status: proposed',
    'affects:',
    '  - core/metadata',
    '  - core/storage',
    '---',
    '',
    '# Metadata keys',
    ''
  ].join('\n')
}

describe('the Traces of a repository', () => {
  it('name the Components of the declaration, parents before children', async () => {
    expect(await declaredComponents(memoryFileSystem(REPOSITORY))).toEqual([
      { id: 'kernel', name: 'kernel' },
      { id: 'core', name: 'Decisions core' },
      { id: 'core/metadata', name: 'metadata' },
      { id: 'structure', name: 'structure' }
    ])
  })

  it('are checked against it when the repository is opened', async () => {
    const { repository, components } = await openWithTraces(memoryFileSystem(REPOSITORY))
    expect(components?.map((component) => component.id)).toEqual([
      'kernel',
      'core',
      'core/metadata',
      'structure'
    ])
    expect(repository.logs[0]!.problems).toEqual([
      { kind: 'unknown-component', adr: '0002-metadata-keys', component: 'core/storage' }
    ])
  })

  it('are not checked while nothing is declared, or the declaration cannot be read', async () => {
    for (const declaration of [undefined, '# nothing yet\n', 'components: [oops\n']) {
      const files: Record<string, string> = { ...REPOSITORY }
      if (declaration === undefined) delete files['.arch/components.yml']
      else files['.arch/components.yml'] = declaration
      const { repository, components } = await openWithTraces(memoryFileSystem(files))
      expect(components).toBeUndefined()
      expect(repository.logs[0]!.problems).toEqual([])
    }
  })
})

describe('renaming a Component', () => {
  it('is one change set: one line in the declaration, one line in each ADR that names it', async () => {
    const fs = memoryFileSystem(REPOSITORY)
    const plan = await planComponentRename(fs, 'structure', 'architecture')
    if (!plan.ok) throw new Error(plan.reason)
    expect('renamed' in plan).toBe(false)
    const changed = plan.changeSet.files.map((file) => {
      const [before, after] = [file.before.split('\n'), file.after.split('\n')]
      return {
        path: file.path,
        removed: before.filter((line) => !after.includes(line)),
        added: after.filter((line) => !before.includes(line))
      }
    })
    expect(changed).toEqual([
      { path: '.arch/components.yml', removed: ['  structure:'], added: ['  architecture:'] },
      {
        path: 'docs/adr/0001-one-core-per-module.md',
        removed: ['affects: [kernel, core, structure]'],
        added: ['affects: [kernel, core, architecture]']
      }
    ])

    expect(await applyChangeSet(fs, plan.changeSet)).toEqual({ applied: true })
    const { repository } = await openWithTraces(fs)
    expect(repository.logs[0]!.problems).toHaveLength(1)
  })

  it('takes the Components below along, a Trace that points nowhere too', async () => {
    const fs = memoryFileSystem(REPOSITORY)
    const plan = await planComponentRename(fs, 'core', 'decisions')
    if (!plan.ok) throw new Error(plan.reason)
    expect(plan.changeSet.files.map((file) => file.path)).toEqual([
      '.arch/components.yml',
      'docs/adr/0001-one-core-per-module.md',
      'docs/adr/0002-metadata-keys.md'
    ])
    expect(plan.changeSet.files[2]!.after).toContain(
      '  - decisions/metadata\n  - decisions/storage\n'
    )
  })

  it("is refused with structure's reason, and with core's", async () => {
    const fs = memoryFileSystem(REPOSITORY)
    expect(await planComponentRename(fs, 'core', 'kernel')).toEqual({
      ok: false,
      reason: 'There is a Component kernel already.'
    })
    const broken = memoryFileSystem({
      ...REPOSITORY,
      'docs/adr/0003-broken.md': '---\nstatus: [\naffects: [core]\n---\n# Broken\n'
    })
    expect(await planComponentRename(broken, 'core', 'decisions')).toEqual({
      ok: false,
      reason:
        'The frontmatter of 0003-broken cannot be read, and it has a list "affects". Fix it before core is renamed.'
    })
  })
})

// The done-when of part 7 (docs/plan-structure.md), as far as the files go: this repository
// declares its Components, and its ADRs name them.
describe('this repository', () => {
  const own = fileURLToPath(new URL('../../../', import.meta.url))

  it('has Traces that all name declared Components', async () => {
    const { repository, components } = await openWithTraces(nodeFileSystem(own))
    expect(components?.map((component) => component.id)).toContain('structure')
    const [log] = repository.logs
    expect(log!.problems).toEqual([])
    const adr = log!.adrs.find((one) => one.id.startsWith('0006-'))!
    expect(adr.metadata.affects).toEqual(['kernel', 'core', 'structure'])
  })

  it('renames structure with one line in the declaration and one in ADR-0006', async () => {
    const plan = await planComponentRename(nodeFileSystem(own), 'structure', 'architecture')
    if (!plan.ok) throw new Error(plan.reason)
    const lines = (text: string): string[] => text.split('\n')
    expect(
      plan.changeSet.files.map((file) => ({
        path: file.path,
        changed: lines(file.before).filter((line, index) => line !== lines(file.after)[index])
      }))
    ).toEqual([
      { path: '.arch/components.yml', changed: ['  structure:'] },
      {
        path: 'docs/adr/0006-one-core-package-per-module-on-a-shared-kernel.md',
        changed: ['affects: [kernel, core, structure]']
      }
    ])
  })
})
