import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { memoryFileSystem, sentenceOf, type Plan } from '@adr-tool/kernel'
import {
  DECLARATION_PATH,
  planRename,
  planRepair,
  readDeclaration,
  saidOf,
  STRUCTURE_SENTENCES,
  structureEnglishOf,
  wordingOf,
  type StructureProblem,
  type StructureSaid
} from '../src/model'
import { prepareGo } from '../src/go/outline'
import { prepareJava } from '../src/java/outline'
import { preparePython } from '../src/python/outline'

// What `structure` says has a code beside its English sentence (docs/plan-roadmap.md, part 12).

/** A refusal: its reason is the English sentence of its code. */
function refused(plan: Plan): StructureSaid {
  if (plan.ok) throw new Error('planned, not refused')
  expect(plan.said, plan.reason).toBeDefined()
  expect(sentenceOf(STRUCTURE_SENTENCES, plan.said as StructureSaid)).toBe(plan.reason)
  return plan.said as StructureSaid
}

describe('a Problem of Structure', () => {
  // What each Problem said before it had a code, word for word.
  const problems: [StructureProblem, string][] = [
    [
      { kind: 'unreadable-declaration', detail: 'its top level must be a map' },
      '.arch/components.yml cannot be read: its top level must be a map'
    ],
    [
      { kind: 'invalid-segment', component: 'core/Domain', segment: 'Domain' },
      '"Domain" in core/Domain is not a valid segment of a Component ID. A segment consists of lowercase letters, digits and dashes, and starts and ends with a letter or a digit.'
    ],
    [
      { kind: 'duplicate-component', component: 'core' },
      'core is declared twice. The first declaration is read.'
    ],
    [
      { kind: 'dead-pattern', component: 'core', key: 'tests', pattern: 'x/**' },
      'The pattern "x/**" in tests of core matches no Source File.'
    ],
    [
      { kind: 'pattern-outside-repository', component: 'core', key: 'paths', pattern: '../x' },
      'The pattern "../x" in paths of core is absolute or leaves the repository. It matches nothing.'
    ],
    [
      { kind: 'overlapping-components', components: ['a', 'b'], files: ['x.ts'] },
      'a and b both claim x.ts. Until one of them gives way, the file is treated as Unassigned.'
    ],
    [
      { kind: 'overlapping-components', components: ['a', 'b'], files: ['x.ts', 'y.ts'] },
      'a and b both claim 2 Source Files. Until one of them gives way, these files are treated as Unassigned.'
    ],
    [{ kind: 'empty-component', component: 'core' }, 'core has neither paths nor components.']
  ]

  it('says what it said before, as the sentence of its code', () => {
    for (const [problem, sentence] of problems) {
      expect(wordingOf(problem)).toBe(sentence)
      expect(saidOf(problem).code).toBe(problem.kind)
      expect(structureEnglishOf(saidOf(problem))).toBe(sentence)
    }
  })

  it('of a declaration that cannot be read carries why as a code', () => {
    const declaration = readDeclaration('components:\n  core: [a]\n')
    if (declaration.kind !== 'unreadable') throw new Error(declaration.kind)
    expect(declaration.said).toEqual({ code: 'component-not-map', values: { id: 'core' } })
    expect(structureEnglishOf(declaration.said)).toBe(declaration.detail)
    const yaml = readDeclaration('components: [oops\n')
    if (yaml.kind !== 'unreadable') throw new Error(yaml.kind)
    expect(yaml.said.code).toBe('not-yaml')
    expect(structureEnglishOf(yaml.said)).toBe(yaml.detail)
    // The parser's first line, without the picture of the line it draws below, and the line.
    const flow = readDeclaration('components: [\n')
    if (flow.kind !== 'unreadable') throw new Error(flow.kind)
    expect(flow.detail).toBe(
      'it is not valid YAML: Flow sequence in block collection must be sufficiently indented and end with a ] at line 2, column 1'
    )
    expect(flow.line).toBe(2)
    expect(declaration.line).toBeUndefined()
  })
})

describe('a refusal of structure', () => {
  const declared = 'components:\n  core:\n    paths: [src/**]\n  app:\n    paths: [app/**]\n'
  const rename = (text: string | undefined, id: string, segment: string) =>
    planRename(
      memoryFileSystem(text === undefined ? {} : { [DECLARATION_PATH]: text }),
      id,
      segment
    )

  it('carries the code of its reason, whose English is the reason', async () => {
    expect(refused(await rename(declared, 'core', 'app'))).toEqual({
      code: 'component-exists',
      values: { id: 'app' }
    })
    expect(refused(await rename(declared, 'core', 'Core')).code).toBe('not-a-segment')
    expect(refused(await rename(undefined, 'core', 'domain')).code).toBe('rename-needs-declaration')
    expect(refused(await rename('components: [oops\n', 'core', 'x'))).toEqual({
      code: 'unreadable-declaration',
      values: { path: DECLARATION_PATH, detail: expect.objectContaining({ code: 'not-yaml' }) }
    })
    const fs = memoryFileSystem({ [DECLARATION_PATH]: declared })
    expect(refused(await planRepair(fs, { kind: 'empty-component', component: 'core' })).code).toBe(
      'no-repair'
    )
    expect(
      refused(
        await planRepair(fs, {
          kind: 'dead-pattern',
          component: 'core',
          key: 'tests',
          pattern: 'x'
        })
      )
    ).toEqual({ code: 'no-pattern-list', values: { component: 'core', key: 'tests' } })
  })
})

describe('a Java file that cannot be read', () => {
  it('says why as a code', async () => {
    const require = createRequire(import.meta.url)
    const read = await prepareJava({
      runtime: await readFile(require.resolve('web-tree-sitter/web-tree-sitter.wasm')),
      grammar: await readFile(require.resolve('tree-sitter-java/tree-sitter-java.wasm'))
    })
    const broken = read('class Broken { void x( { }\n')
    if (broken.analysed) throw new Error('analysed')
    expect(broken.said?.code).toMatch(/^java-(missing|unreadable)$/)
    expect(structureEnglishOf(broken.said!)).toBe(broken.message)
  })
})

describe('a Python or a Go file that cannot be read', () => {
  it.each([
    ['python', preparePython, 'def broken(:\n'],
    ['go', prepareGo, 'package x\nfunc broken( {\n']
  ] as const)('says why as a code, in %s', async (language, prepare, text) => {
    const require = createRequire(import.meta.url)
    const read = await prepare({
      runtime: await readFile(require.resolve('web-tree-sitter/web-tree-sitter.wasm')),
      grammar: await readFile(require.resolve(`tree-sitter-${language}/tree-sitter-${language}.wasm`))
    })
    const broken = read(text)
    if (broken.analysed) throw new Error('analysed')
    expect(broken.said?.code).toMatch(new RegExp(`^${language}-(missing|unreadable)$`))
    expect(structureEnglishOf(broken.said!)).toBe(broken.message)
  })
})
