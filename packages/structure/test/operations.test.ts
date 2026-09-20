import { describe, expect, it } from 'vitest'
import { applyChangeSet, memoryFileSystem, type Plan } from '@adr-tool/kernel'
import { DECLARATION_PATH, hasRepair, openStructure, planAdopt, planRepair } from '../src'

const CODE = {
  'package.json': '{ "workspaces": ["packages/*"] }',
  'packages/core/package.json': '{}',
  'packages/core/src/index.ts': '',
  'packages/core/src/metadata/read.ts': '',
  'packages/My App/package.json': '{}',
  'packages/My App/src/main.ts': ''
}
const lines = (...text: string[]): string => text.join('\n') + '\n'
const CRLF = String.fromCharCode(13, 10)

async function open(repository: Record<string, string>) {
  const fs = memoryFileSystem(repository)
  return { fs, structure: await openStructure(fs, Object.keys(repository)) }
}

/** The text of the declaration after a plan, and that nothing was written by planning. */
function written(plan: Plan): string {
  if (!plan.ok) throw new Error(plan.reason)
  expect(plan.changeSet.files).toHaveLength(1)
  expect(plan.changeSet.files[0]!.path).toBe(DECLARATION_PATH)
  return plan.changeSet.files[0]!.after
}

describe('opening a repository', () => {
  it('shows the Draft as long as nothing is declared, and never writes', async () => {
    const { fs, structure } = await open(CODE)
    expect(structure.origin).toBe('draft')
    expect(structure.canAdopt).toBe(true)
    expect(structure.problems).toEqual([])
    expect(structure.hints).toEqual([])
    expect(structure.components.map((component) => component.id)).toEqual(['my-app', 'core'])
    expect(await fs.list('.arch')).toBeUndefined()
  })

  it('reads the declaration once there is one, with its Problems', async () => {
    const { structure } = await open({
      ...CODE,
      [DECLARATION_PATH]: 'components:\n  core:\n    paths: [packages/core/**, lib/**]\n'
    })
    expect(structure.origin).toBe('declared')
    expect(structure.canAdopt).toBe(false)
    expect(structure.hints).toEqual([])
    expect(structure.problems).toEqual([
      { kind: 'dead-pattern', component: 'core', key: 'paths', pattern: 'lib/**' }
    ])
    expect(structure.sourceFiles.map((file) => [file.path, file.component])).toEqual([
      ['packages/My App/src/main.ts', undefined],
      ['packages/core/src/index.ts', 'core'],
      ['packages/core/src/metadata/read.ts', 'core']
    ])
  })

  it('shows the Draft while the declaration cannot be read, names the Problem, and offers no Adopt', async () => {
    const { fs, structure } = await open({ ...CODE, [DECLARATION_PATH]: 'components: [oops\n' })
    expect(structure.origin).toBe('draft')
    expect(structure.components).not.toHaveLength(0)
    expect(structure.problems).toMatchObject([{ kind: 'unreadable-declaration' }])
    expect(structure.canAdopt).toBe(false)
    expect(await planAdopt(fs, structure)).toMatchObject({
      ok: false,
      reason: expect.stringContaining('cannot be read')
    })
  })
})

describe('Adopt', () => {
  it('writes the Draft as a new file that reads back as the same Components', async () => {
    const { fs, structure } = await open(CODE)
    const plan = await planAdopt(fs, structure)
    expect(written(plan)).toBe(
      lines(
        'components:',
        '  my-app:',
        '    name: My App',
        '    paths: ["packages/My App/**"]',
        '  core:',
        '    paths: [packages/core/**]',
        '    components:',
        '      metadata:',
        '        paths: [packages/core/src/metadata/**]'
      )
    )
    expect(plan.ok && plan.changeSet.files[0]!.creates).toBe(true)
    expect(await fs.readText(DECLARATION_PATH)).toBeUndefined()

    if (plan.ok) await applyChangeSet(fs, plan.changeSet)
    const adopted = await openStructure(fs, [...Object.keys(CODE), DECLARATION_PATH])
    expect(adopted.origin).toBe('declared')
    expect(adopted.problems).toEqual([])
    expect(adopted.components).toEqual(structure.components)
    expect(adopted.sourceFiles).toEqual(structure.sourceFiles)
  })

  it('goes into a file that is there and declares nothing, and nothing else in it moves', async () => {
    const before = ['# Architecture of the shop', 'owner:   "team-a"   # keep my spacing', ''].join(
      CRLF
    )
    const { fs, structure } = await open({ ...CODE, [DECLARATION_PATH]: before })
    const after = written(await planAdopt(fs, structure))
    expect(after.startsWith(before)).toBe(true)
    expect(after.slice(before.length).split(CRLF).slice(0, 2)).toEqual(['components:', '  my-app:'])
    expect(after.replaceAll(CRLF, '')).not.toContain('\n')
  })

  it('takes the place of a components key that is empty', async () => {
    for (const empty of ['components:', 'components: {}', 'components:   # later']) {
      const before = lines('version: 1', empty, 'owner: team-a')
      const { fs, structure } = await open({ ...CODE, [DECLARATION_PATH]: before })
      const after = written(await planAdopt(fs, structure))
      expect(after.startsWith('version: 1\ncomponents:\n  my-app:\n')).toBe(true)
      expect(
        after.endsWith('        paths: [packages/core/src/metadata/**]\nowner: team-a\n')
      ).toBe(true)
    }
  })

  it('starts on a new line in a file that does not end with one', async () => {
    const { fs, structure } = await open({ ...CODE, [DECLARATION_PATH]: 'owner: team-a' })
    expect(written(await planAdopt(fs, structure)).startsWith('owner: team-a\ncomponents:\n')).toBe(
      true
    )
  })

  it('is refused once Components are declared, and when there is nothing to adopt', async () => {
    const declared = await open({
      ...CODE,
      [DECLARATION_PATH]: 'components:\n  a:\n    paths: [x]\n'
    })
    expect(await planAdopt(declared.fs, declared.structure)).toMatchObject({ ok: false })
    const empty = await open({ 'README.md': '' })
    expect(await planAdopt(empty.fs, empty.structure)).toMatchObject({
      ok: false,
      reason: expect.stringContaining('nothing to adopt')
    })
  })
})

describe('the Repair of a pattern that matches no Source File', () => {
  const dead = {
    kind: 'dead-pattern',
    component: 'core/io',
    key: 'paths',
    pattern: 'lib/**'
  } as const
  const declaration = (paths: string[]): string =>
    lines(
      '# top',
      'components:',
      '  core:',
      '    paths: [src/**]',
      '    components:',
      '      io:',
      ...paths,
      'owner: a'
    )
  const repaired = async (paths: string[]): Promise<Plan> =>
    planRepair(memoryFileSystem({ [DECLARATION_PATH]: declaration(paths) }), dead)

  it('takes the item out of a flow list with one comma, wherever it stands', async () => {
    const cases: [string, string][] = [
      ['paths: [lib/**, src/io/**, x/**]', 'paths: [src/io/**, x/**]'],
      ['paths: [src/io/**, "lib/**" ,  x/**]', 'paths: [src/io/**, x/**]'],
      ["paths: [src/io/**, x/**, 'lib/**']", 'paths: [src/io/**, x/**]']
    ]
    for (const [before, after] of cases) {
      expect(written(await repaired([`        ${before}   # why`]))).toBe(
        declaration([`        ${after}   # why`])
      )
    }
  })

  it('takes the line out of a block list', async () => {
    const before = [
      '        paths:',
      '          - src/io/**',
      '          - lib/**   # old',
      '          - x/**'
    ]
    expect(written(await repaired(before))).toBe(
      declaration(['        paths:', '          - src/io/**', '          - x/**'])
    )
  })

  it('takes the key with the last item: no empty list stays behind', async () => {
    const rest = ['        tests: [checks/**]']
    expect(written(await repaired(['        paths: [lib/**]', ...rest]))).toBe(declaration(rest))
    expect(written(await repaired(['        paths:', '          - lib/**', ...rest]))).toBe(
      declaration(rest)
    )
  })

  it('keeps CRLF line endings', async () => {
    const text = declaration([
      '        paths:',
      '          - lib/**',
      '          - x/**'
    ]).replaceAll('\n', CRLF)
    const plan = await planRepair(memoryFileSystem({ [DECLARATION_PATH]: text }), dead)
    expect(written(plan)).toBe(
      declaration(['        paths:', '          - x/**']).replaceAll('\n', CRLF)
    )
  })

  it('is refused when the file has moved on, or when a list is written in a way it cannot edit', async () => {
    expect(await repaired(['        paths: [x/**]'])).toMatchObject({
      ok: false,
      reason: expect.stringContaining('no longer')
    })
    expect(await repaired(['        paths: [lib/** # gone?', '          , x/**]'])).toMatchObject({
      ok: false,
      reason: expect.stringContaining('in an editor')
    })
  })

  it('is the only Repair there is', async () => {
    const other = { kind: 'empty-component', component: 'core' } as const
    expect(hasRepair(dead)).toBe(true)
    expect(hasRepair(other)).toBe(false)
    expect(await planRepair(memoryFileSystem({}), other)).toMatchObject({ ok: false })
  })
})
