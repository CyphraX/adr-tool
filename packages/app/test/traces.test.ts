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

  it("is refused with structure's reason, and with core's, each with its code", async () => {
    const fs = memoryFileSystem(REPOSITORY)
    expect(await planComponentRename(fs, 'core', 'kernel')).toEqual({
      ok: false,
      reason: 'There is a Component kernel already.',
      said: { code: 'component-exists', values: { id: 'kernel' } }
    })
    const broken = memoryFileSystem({
      ...REPOSITORY,
      'docs/adr/0003-broken.md': '---\nstatus: [\naffects: [core]\n---\n# Broken\n'
    })
    expect(await planComponentRename(broken, 'core', 'decisions')).toEqual({
      ok: false,
      reason:
        'The frontmatter of 0003-broken cannot be read, and it has a list "affects". Fix it before core is renamed.',
      said: { code: 'unreadable-has-affects', values: { adr: '0003-broken', component: 'core' } }
    })
  })
})

describe('renaming a Component that the Rules name (docs/conformance-format.md, section 7)', () => {
  const RULES = [
    'rules:',
    '  - id: core-apart',
    '    why: The cores speak their own glossaries.',
    '    kind: must-not-depend',
    '    from: [core/**, structure]',
    "    to: ['structure']",
    'exceptions:',
    '  - rule: core-apart',
    '    from: core',
    '    to: structure',
    '    reason: For now.',
    ''
  ].join('\n')

  it('rewrites them in the same change set as the declaration and the ADRs', async () => {
    const fs = memoryFileSystem({ ...REPOSITORY, '.arch/rules.yml': RULES })
    const plan = await planComponentRename(fs, 'structure', 'architecture')
    if (!plan.ok) throw new Error(plan.reason)
    expect(plan.changeSet.files.map((file) => file.path)).toEqual([
      '.arch/components.yml',
      'docs/adr/0001-one-core-per-module.md',
      '.arch/rules.yml'
    ])
    expect(plan.changeSet.files[2]!.after).toBe(
      RULES.replace('[core/**, structure]', '[core/**, architecture]')
        .replace("['structure']", "['architecture']")
        .replace('to: structure', 'to: architecture')
    )
    // Below the renamed one, too: core/** follows core.
    const below = await planComponentRename(fs, 'core', 'decisions')
    if (!below.ok) throw new Error(below.reason)
    expect(below.changeSet.files.find((file) => file.path === '.arch/rules.yml')!.after).toContain(
      'from: [decisions/**, structure]'
    )
  })

  it("is refused with conformance's reason and code where the file cannot be renamed in", async () => {
    const fs = memoryFileSystem({
      ...REPOSITORY,
      '.arch/rules.yml': RULES.replace(
        "    to: ['structure']",
        '    to: &target structure'
      ).replace('    to: structure', '    to: *target')
    })
    expect(await planComponentRename(fs, 'structure', 'architecture')).toEqual({
      ok: false,
      reason:
        '.arch/rules.yml is written in a way the suite cannot rename structure in. Change it in an editor.',
      said: {
        code: 'cannot-rename-in-rules',
        values: { path: '.arch/rules.yml', id: 'structure' }
      }
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
    expect(adr.metadata.affects).toEqual(['kernel', 'core', 'structure', 'conformance'])
  })

  it('renames structure in the declaration, in ADR-0006 and in the Rules', async () => {
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
        changed: ['affects: [kernel, core, structure, conformance]']
      },
      {
        path: '.arch/rules.yml',
        changed: [
          '    from: [core, structure]',
          '    to: [core, structure]',
          '    to: [kernel, structure]',
          '    layers: [app, [cli, mcp], conformance, [core, structure], kernel]'
        ]
      }
    ])
  })
})
