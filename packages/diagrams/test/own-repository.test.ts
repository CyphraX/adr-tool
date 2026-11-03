import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { applyChangeSet, type FileSystem } from '@adr-tool/kernel'
import { DECLARATION_PATH, openStructure } from '@adr-tool/structure/model'
import {
  driftOf,
  driftWording,
  openDiagrams,
  planExport,
  planRepair,
  problemsOf,
  readDiagram,
  suggestConnections,
  wordingOf,
  type Diagram
} from '../src'
import { analysedAt, nodeFileSystem, writableFileSystem } from './repository'

// The done-when of part 6 (docs/plan-vision.md): a Diagram of this repository's packages,
// written by hand in the format, draws to SVG, suggests the connections the code has, reports a
// connection added on purpose as Drift, and an element with a removed Component as a Problem.
const root = fileURLToPath(new URL('../../../', import.meta.url))

/** `vitest run --mode export` (`pnpm --filter @adr-tool/diagrams export-own`) writes the SVG. */
const exporting = (import.meta as ImportMeta & { env?: { MODE?: string } }).env?.MODE === 'export'

/** What the repository consists of: what git tracks, and what it neither tracks nor ignores. */
const files = (): string[] =>
  execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  })
    .split('\0')
    .filter((path) => path !== '')

async function own() {
  const repository = await analysedAt(root, files())
  const { directory, diagrams, problems } = await openDiagrams(repository.fs)
  expect(directory).toBe('docs/architecture/diagrams')
  expect(problems).toEqual([])
  expect(diagrams.map((diagram) => diagram.id)).toEqual(['packages'])
  const packages = diagrams[0]!
  if (!packages.readable) throw new Error(wordingOf(packages.problems[0]))
  return { ...repository, packages }
}

const pairs = (list: readonly { from: string; to: string }[]): string[] =>
  list.map(({ from, to }) => `${from} > ${to}`).sort()

/** The Diagram with one more connection, as a person would add it in an editor. */
function withConnection(diagram: Diagram, text: string, from: string, to: string): Diagram {
  const added = readDiagram(
    diagram.path,
    text.replace('connections:\n', `connections:\n  - from: ${from}\n    to: ${to}\n`)
  )
  if (!added.readable) throw new Error(wordingOf(added.problems[0]))
  return added
}

describe('the Diagram of this repository’s packages', () => {
  it('is valid, and shows every package of the repository', async () => {
    const { structure, packages } = await own()
    expect(structure.origin).toBe('declared')
    expect(problemsOf(packages, structure)).toEqual([])
    expect(
      packages.elements
        .filter((element) => element.kind === 'component')
        .map((element) => element.id)
        .sort()
    ).toEqual(structure.components.map((component) => component.id).sort())
  })

  it('suggests the connections the code has, and draws every one of them: it has no Drift', async () => {
    const { structure, analysis, packages } = await own()
    const suggested = suggestConnections(packages, structure, analysis)
    expect(pairs(suggested)).toEqual([
      'app > cli',
      'app > conformance',
      'app > core',
      'app > diagrams',
      'app > structure',
      'cli > conformance',
      'cli > core',
      'cli > structure',
      'conformance > kernel',
      'conformance > structure',
      'core > kernel',
      'diagrams > kernel',
      'diagrams > structure',
      'mcp > core',
      'mcp > structure',
      'structure > kernel'
    ])
    expect(suggested.every((connection) => connection.drawn)).toBe(true)
    // The window's German takes the sentences of Diagrams as types only.
    expect(suggested.find((one) => one.from === 'app' && one.to === 'diagrams')).toMatchObject({
      typeOnly: true
    })
    expect(driftOf(packages, structure, analysis)).toEqual([])
  })

  it('reports a connection added on purpose as Drift', async () => {
    const { fs, structure, analysis, packages } = await own()
    const text = (await fs.readText(packages.path))!
    const added = withConnection(packages, text, 'kernel', 'core')
    expect(driftOf(added, structure, analysis).map(driftWording)).toEqual([
      'The Diagram connects kernel to core, but no Source File of kernel depends on one of core.'
    ])
    // A connection to an External System has no Drift: no code stands behind it.
    expect(driftOf(withConnection(packages, text, 'kernel', 'git'), structure, analysis)).toEqual(
      []
    )
  })

  // What the review of PR #51 found: app uses core through packages/core/src/index.ts, which is
  // core's own and none of its parts'.
  it('in the component view of core, takes what enters through core’s own files for core', async () => {
    const { structure, analysis } = await own()
    const parts = ['adr', 'export', 'foreign', 'lifecycle', 'log', 'metadata', 'problems']
    const text = [
      'level: component',
      'scope: core',
      'elements:',
      ...['app', 'cli', 'mcp', 'kernel', ...parts.map((part) => `core/${part}`)].flatMap(
        (id, index) => [`  - component: ${id}`, `    at: [${index * 160}, 0]`]
      ),
      'connections:',
      ...[
        ['app', 'core/adr'],
        ['mcp', 'core/log'],
        ['kernel', 'core/adr']
      ].flatMap(([from, to]) => [`  - from: ${from}`, `    to: ${to}`]),
      ''
    ].join('\n')
    const view = readDiagram('docs/architecture/diagrams/core.yml', text)
    if (!view.readable) throw new Error(wordingOf(view.problems[0]))
    expect(problemsOf(view, structure)).toEqual([])
    const through = suggestConnections(view, structure, analysis).filter((one) => one.throughScope)
    expect(through.map((one) => `${one.from} > ${one.to}${one.drawn ? ' drawn' : ''}`)).toEqual(
      expect.arrayContaining(['app > core drawn', 'mcp > core drawn'])
    )
    expect(
      through
        .find((one) => one.from === 'app')!
        .dependencies.every((dependency) => dependency.to === 'packages/core/src/index.ts')
    ).toBe(true)
    // Into core/adr and core/log through core's own files, perhaps: not Drift. kernel uses
    // nothing of core.
    expect(
      driftOf(view, structure, analysis)
        .filter((one) => one.kind === 'connection-not-in-code')
        .map(driftWording)
    ).toEqual([
      'The Diagram connects kernel to core/adr, but no Source File of kernel depends on one of core/adr.'
    ])
  })

  it('reports an element whose Component is removed as a Problem, whose Repair takes it out', async () => {
    const { fs, packages } = await own()
    const declaration = (await fs.readText(DECLARATION_PATH))!
    // The declaration without mcp, as if it had been removed.
    const without = declaration.replace('  mcp:\n    paths: [packages/mcp/**]\n', '')
    expect(without).not.toBe(declaration)
    const removed: FileSystem = {
      readText: async (path) => (path === DECLARATION_PATH ? without : fs.readText(path)),
      list: fs.list
    }
    const structure = await openStructure(removed, files())
    const problems = problemsOf(packages, structure)
    expect(
      problems.map((problem) => `${problem.path}:${problem.line}: ${wordingOf(problem)}`)
    ).toEqual([
      'docs/architecture/diagrams/packages.yml:18: The Diagram shows mcp, which is not a declared Component.'
    ])

    // Planned against the repository as it is: this test never writes into it.
    const repair = await planRepair(removed, problems[0]!)
    if (!repair.ok) throw new Error(repair.reason)
    const [file] = repair.changeSet.files
    const text = (await fs.readText(packages.path))!
    expect(file!.before).toBe(text)
    expect(file!.after).toBe(
      text.replace(
        / {2}- component: mcp\n.*\n| {2}- from: mcp\n.*\n(?: {4}label: .*\n)?| {2}- from: agent\n {4}to: mcp\n.*\n/g,
        ''
      )
    )
    const after = readDiagram(packages.path, file!.after)
    if (!after.readable) throw new Error('unreadable')
    expect(problemsOf(after, structure)).toEqual([])
  })

  it('draws to the SVG committed beside it', async () => {
    const { fs, structure, packages } = await own()
    const planned = await planExport(fs, packages.path, structure)
    if (!planned.ok) throw new Error(planned.reason)
    expect(planned.svg).toBe('docs/architecture/diagrams/packages.svg')
    if (exporting) {
      expect(await applyChangeSet(writableFileSystem(root), planned.changeSet)).toEqual({
        applied: true
      })
      return
    }
    // Stale when the Diagram or the declaration changed: `pnpm --filter @adr-tool/diagrams export-own`.
    expect(planned.changeSet.files.map((file) => file.path)).toEqual([])
    const svg = (await nodeFileSystem(root).readText(planned.svg))!
    expect(svg).toContain('<title>The packages of Softarch Suite</title>')
  })
})
