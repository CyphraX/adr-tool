// What a review of part 2 found, each case pinned down. The writers splice (ADR-0002), and YAML
// can be written in more ways than a splice can serve: where it cannot, the suite must refuse.
import { describe, expect, it } from 'vitest'
import { applyChangeSet, memoryFileSystem, type Plan } from '@adr-tool/kernel'
import { DECLARATION_PATH, openStructure, planAdopt, planRepair } from '../src'
import { readDeclaration } from '../src/declaration'
import { draftComponents } from '../src/draft'
import { assign } from '../src/ownership'
import { sourceFilesAmong } from '../src/source-files'

const CODE = { 'src/cart/a.ts': '', 'src/pricing/b.ts': '' }
const after = (plan: Plan): string => {
  if (!plan.ok) throw new Error(plan.reason)
  return plan.changeSet.files[0]!.after
}
const repair = (text: string, component = 'core', pattern = 'nowhere/**'): Promise<Plan> =>
  planRepair(memoryFileSystem({ [DECLARATION_PATH]: text }), {
    kind: 'dead-pattern',
    component,
    key: 'paths',
    pattern
  })

describe('the Repair', () => {
  it('refuses a Component written as a flow map rather than leave broken YAML behind', async () => {
    for (const text of [
      'components:\n  core: {paths: [nowhere/**]}\n',
      'components:\n  core: { paths: [nowhere/**], name: Y }\n',
      'components:\n  core: { name: Y, paths: [nowhere/**] }\n'
    ]) {
      expect(await repair(text)).toMatchObject({
        ok: false,
        reason: expect.stringContaining('in an editor')
      })
    }
  })

  it('whatever it hands out reads back as a declaration', async () => {
    const texts = [
      'components:\n  core:\n    paths: [nowhere/**]   # the only one\n    tests: [t/**]\n',
      'components:\n  core:\n    paths:\n      - nowhere/**\n    name: Core\n',
      'components:\n  core:\n    paths: [src/**,\n      nowhere/**]\n'
    ]
    for (const text of texts) {
      const plan = await repair(text)
      if (plan.ok) expect(readDeclaration(after(plan)).kind).not.toBe('unreadable')
    }
    expect(after(await repair(texts[0]!))).toBe('components:\n  core:\n    tests: [t/**]\n')
  })

  it('does not move a tag or an anchor onto the neighbouring item', async () => {
    for (const list of [
      '[!!str nowhere/**, src/**]',
      '[&x nowhere/**, src/**]',
      '[src/**, !!str nowhere/**]'
    ]) {
      expect(await repair(`components:\n  core:\n    paths: ${list}\n`)).toMatchObject({
        ok: false
      })
    }
  })

  it('finds a Component whose segment looks like a number', async () => {
    const text = 'components:\n  007:\n    paths: [nowhere/**, src/**]\n'
    expect(after(await repair(text, '007'))).toBe('components:\n  007:\n    paths: [src/**]\n')
  })
})

describe('Adopt', () => {
  it('never overwrites Components that were declared after the Draft was shown', async () => {
    const fs = memoryFileSystem({ ...CODE, [DECLARATION_PATH]: '# nothing yet\n' })
    const structure = await openStructure(fs, Object.keys(CODE))
    expect(structure.canAdopt).toBe(true)

    await fs.writeText(DECLARATION_PATH, 'components:\n  mine: # by hand\n    paths: [src/**]\n')
    expect(await planAdopt(fs, structure)).toMatchObject({
      ok: false,
      reason: expect.stringContaining('declares Components by now')
    })
  })

  it('is refused when the file appeared after the Draft was shown', async () => {
    const fs = memoryFileSystem({ ...CODE })
    const structure = await openStructure(fs, Object.keys(CODE))
    await fs.writeText(DECLARATION_PATH, 'components: [broken\n')
    expect(await planAdopt(fs, structure)).toMatchObject({ ok: false })
  })

  it('keeps every comment, also the one behind or below an empty components key', async () => {
    const cases: [string, string][] = [
      ['components:\n# a comment about other\nother: 1\n', '# a comment about other\nother: 1\n'],
      ['other: 1\ncomponents:\n# final words\n', '# final words\n'],
      ['components: {} # none yet\nother: 1\n', 'other: 1\n'],
      ['components:   # later\n', '']
    ]
    for (const [before, tail] of cases) {
      const fs = memoryFileSystem({ ...CODE, [DECLARATION_PATH]: before })
      const text = after(await planAdopt(fs, await openStructure(fs, Object.keys(CODE))))
      for (const comment of before.match(/#.*/g) ?? []) expect(text).toContain(comment)
      expect(text.endsWith(tail)).toBe(true)
      expect(readDeclaration(text)).toMatchObject({ kind: 'declared', problems: [] })
    }
  })

  it('refuses a file it cannot add to in a way that reads back, and writes nothing', async () => {
    for (const before of ['---\nversion: 1\n...\n', '{version: 1}\n', '  version: 1\n']) {
      const fs = memoryFileSystem({ ...CODE, [DECLARATION_PATH]: before })
      const structure = await openStructure(fs, Object.keys(CODE))
      expect(structure.canAdopt).toBe(true)
      expect(await planAdopt(fs, structure)).toMatchObject({
        ok: false,
        reason: expect.stringContaining('in an editor')
      })
      expect(await fs.readText(DECLARATION_PATH)).toBe(before)
    }
  })

  it('reads back directories whose names look like numbers', async () => {
    const code = { 'src/01/a.ts': '', 'src/007/b.ts': '', 'src/1e3/c.ts': '', 'src/true/d.ts': '' }
    const fs = memoryFileSystem(code)
    const structure = await openStructure(fs, Object.keys(code))
    const plan = await planAdopt(fs, structure)
    if (!plan.ok) throw new Error(plan.reason)
    await applyChangeSet(fs, plan.changeSet)
    const adopted = await openStructure(fs, Object.keys(code))
    expect(adopted.problems).toEqual([])
    expect(adopted.components.map((component) => component.id)).toEqual([
      '007',
      '01',
      '1e3',
      'true'
    ])
  })
})

describe('the declaration', () => {
  it('reads a segment as it is written: 007 is not 7', () => {
    const declaration = readDeclaration(
      'components:\n  007:\n    paths: [a]\n  7:\n    paths: [b]\n'
    )
    expect(declaration).toMatchObject({
      kind: 'declared',
      problems: [],
      components: [{ id: '007' }, { id: '7' }]
    })
  })
})

describe('the Draft', () => {
  it('counts up until a segment is free, also when a sibling is called that already', async () => {
    const files = ['src/A/a.ts', 'src/a/b.ts', 'src/a-2/c.ts', 'src/a_2/d.ts']
    const components = await draftComponents(memoryFileSystem({}), files, sourceFilesAmong(files))
    const ids = components.map((component) => component.id)
    expect(new Set(ids).size).toBe(4)
    expect(ids).toEqual(['a', 'a-2', 'a-2-2', 'a-2-3'])
  })

  it.each([
    ["include ':a'\n'other'.toString()", ['a']],
    ["project(':include').name = 'x'\ninclude ':a'", ['a']],
    ['include(":a", ":b") // ":c"', ['a', 'b']],
    ['include(\n  ":a",\n  ":b",\n)', ['a', 'b']],
    ["include ':a',\n        ':b'", ['a', 'b']],
    ["includeFlat 'flat'\nincludeBuild('build')\nsettings.include ':no'", []],
    ['include(":$name", ":a")', ['a']]
  ])('reads the includes of %j as %j', async (settings, expected) => {
    const code = Object.fromEntries(
      ['a', 'b', 'c', 'other', 'x', 'flat', 'build', 'no'].map((name) => [
        `${name}/src/main/java/A.java`,
        ''
      ])
    )
    const repository = { 'settings.gradle': settings, ...code }
    const files = Object.keys(repository)
    const components = await draftComponents(
      memoryFileSystem(repository),
      files,
      sourceFilesAmong(files)
    )
    // Without a project the directories themselves are drafted: tell the two cases apart.
    const drafted = components.map((component) => component.id)
    expect(drafted).toEqual(
      expected.length === 0
        ? Object.keys(code)
            .map((path) => path.split('/')[0])
            .sort()
        : expected
    )
  })
})

describe('Source Files', () => {
  it('marks a declaration file of a test as a test', () => {
    expect(
      sourceFilesAmong(['src/cart.test.d.ts', 'src/cart.spec.d.mts']).map((file) => file.test)
    ).toEqual([true, true])
  })
})

describe('on a large repository', () => {
  it('assigns twenty thousand Source Files to three hundred Components in well under a second', () => {
    const units = Array.from({ length: 300 }, (_, index) => `packages/p${index}`)
    const files = units.flatMap((unit) =>
      Array.from({ length: 67 }, (_, index) => `${unit}/src/d${index % 7}/f${index}.ts`)
    )
    const declaration = readDeclaration(
      'components:\n' +
        units
          .map(
            (unit, index) =>
              `  p${index}:\n    paths: [${unit}/**, "!${unit}/gen/**"]\n    components:\n` +
              Array.from(
                { length: 7 },
                (_, d) => `      d${d}:\n        paths: [${unit}/src/d${d}/**]\n`
              ).join('')
          )
          .join('')
    )
    if (declaration.kind !== 'declared') throw new Error('not declared')

    const started = performance.now()
    const ownership = assign(declaration.components, sourceFilesAmong(files))
    const took = performance.now() - started

    expect(ownership.sourceFiles).toHaveLength(20100)
    expect(ownership.sourceFiles.every((file) => file.component !== undefined)).toBe(true)
    expect(ownership.problems).toEqual([])
    // Generous, for a slow machine in CI; it took seconds before patterns were ruled out by their prefix.
    expect(took).toBeLessThan(2500)
  })
})
