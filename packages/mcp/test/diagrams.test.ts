import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Refusal, type Tool } from '../src/protocol'
import { validate } from '../src/schema'
import { toolsFor } from '../src/tools'

// docs/plan-vision.md, part 7; docs/mcp.md, "The Diagrams": an agent reads a Diagram with its
// Drift against the code, and plans its changes as every write is planned.

const shop = fileURLToPath(
  new URL('../../conformance/test/fixtures/layered-shop/', import.meta.url)
)
const DIAGRAM = 'docs/architecture/diagrams/shop.yml'
const PICTURE = 'docs/architecture/diagrams/shop.svg'

// web uses billing and billing persistence, as the code has it; the Diagram leaves out that
// billing uses web, and draws web using persistence, which the code does not have.
const SHOP = [
  'title: The shop',
  'level: container',
  'elements:',
  '  - component: web',
  '    at: [40, 40]',
  '  - component: billing',
  '    at: [300, 40]',
  '  - component: persistence',
  '    at: [560, 40]',
  '  - external: payments',
  '    name: Payments',
  '    at: [300, 200]',
  'connections:',
  '  - from: web',
  '    to: billing',
  '  - from: billing',
  '    to: persistence',
  '  - from: web',
  '    to: persistence',
  '  - from: billing',
  '    to: payments',
  ''
].join('\n')

let root: string
let tools: Tool[]
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'adr-tool-mcp-diagrams-'))
  cpSync(shop, root, { recursive: true })
  mkdirSync(join(root, 'docs/architecture/diagrams'), { recursive: true })
  writeFileSync(join(root, DIAGRAM), SHOP)
  tools = toolsFor({ root, today: () => '2026-11-03' })
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

/** Run a tool as the server does: its input checked against its schema first. */
async function call(name: string, input: Record<string, unknown> = {}) {
  const tool = tools.find((one) => one.name === name)!
  const wrong = validate(tool.inputSchema, input, 'arguments')
  if (wrong) throw new Error(wrong)
  // What a tool answers is JSON that the tests walk into freely.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (await tool.run(input)) as Record<string, any>
}

async function refused(name: string, input: Record<string, unknown>): Promise<string> {
  try {
    await call(name, input)
  } catch (error) {
    if (error instanceof Refusal) return error.message
    throw error
  }
  throw new Error(`${name} was not refused`)
}

/** Plan with a tool, then apply what it planned. */
async function planned(name: string, input: Record<string, unknown>) {
  const plan = await call(name, input)
  const applied = await call('apply_change', { changeId: plan.changeId })
  return { plan, applied }
}

describe('the Diagrams through the MCP server', () => {
  it('are listed with their level, their Problems and their picture', async () => {
    expect(await call('list_diagrams')).toEqual({
      directory: 'docs/architecture/diagrams',
      diagrams: [
        {
          id: 'shop',
          path: DIAGRAM,
          readable: true,
          title: 'The shop',
          level: 'container',
          elements: 4,
          connections: 4,
          picture: { path: PICTURE, exported: false },
          problems: 0
        }
      ],
      problems: []
    })
  })

  it('reads a Diagram as data, with its Drift against the code and the connections the code has', async () => {
    const diagram = await call('read_diagram', { id: 'shop' })
    expect(diagram.elements[0]).toEqual({
      kind: 'component',
      id: 'web',
      name: 'web',
      at: { x: 40, y: 40 },
      line: 4
    })
    expect(diagram.elements[3]).toMatchObject({
      kind: 'external',
      id: 'payments',
      name: 'Payments'
    })
    expect(diagram.connections).toHaveLength(4)
    expect(diagram.drift).toEqual([
      {
        code: 'connection-not-in-code',
        message:
          'The Diagram connects web to persistence, but no Source File of web depends on one of persistence.',
        from: 'web',
        to: 'persistence',
        line: 18
      },
      {
        code: 'dependency-not-in-diagram',
        message:
          'billing depends on web in the code, through one Source File Dependency, and the Diagram does not connect them.',
        from: 'billing',
        to: 'web',
        line: 6,
        weight: 1,
        typeOnly: false,
        dependencies: [{ from: 'src/billing/invoice.ts', to: 'src/web/format.ts', lines: [3] }]
      }
    ])
    expect(diagram.suggestions).toContainEqual({
      from: 'billing',
      to: 'web',
      weight: 1,
      typeOnly: false,
      drawn: false
    })
    const quick = await call('read_diagram', { id: 'shop', drift: false })
    expect(quick).not.toHaveProperty('drift')
    expect(quick.text).toBe(SHOP)
  })

  it('plans edits as one change of their lines, and the Diagram then agrees with the code', async () => {
    const { plan, applied } = await planned('plan_diagram_change', {
      id: 'shop',
      edits: [
        { kind: 'remove-connection', from: 'web', to: 'persistence' },
        { kind: 'add-connection', from: 'billing', to: 'web', label: 'formats dates' },
        { kind: 'move-element', id: 'payments', at: { x: 300, y: 220 } }
      ]
    })
    expect(plan.files.map((file: { path: string }) => file.path)).toEqual([DIAGRAM])
    expect(plan.files[0].diff).toContain('+    label: formats dates')
    expect(plan).not.toHaveProperty('picture')
    expect(applied).toEqual({
      applied: true,
      files: [DIAGRAM],
      diagram: { id: 'shop', path: DIAGRAM }
    })
    const text = readFileSync(join(root, DIAGRAM), 'utf8')
    expect(text).toContain('    at: [300, 220]')
    expect(text).not.toContain('  - from: web\n    to: persistence')
    expect((await call('read_diagram', { id: 'shop' })).drift).toEqual([])
  })

  it('exports the picture, and says when an edit leaves it behind', async () => {
    const { plan } = await planned('plan_diagram_export', { id: 'shop' })
    expect(plan.picture).toBe(PICTURE)
    expect(plan.files[0]).toMatchObject({ path: PICTURE, creates: true })
    expect(readFileSync(join(root, PICTURE), 'utf8')).toMatch(/^<svg /)
    expect((await call('list_diagrams')).diagrams[0].picture).toEqual({
      path: PICTURE,
      exported: true,
      current: true
    })

    const moved = await planned('plan_diagram_change', {
      id: 'shop',
      edits: [{ kind: 'move-element', id: 'web', at: { x: 40, y: 60 } }]
    })
    expect(moved.plan.picture).toBe(
      `${PICTURE} is not current once this is applied: plan_diagram_export draws it again.`
    )
    const stale = await call('read_diagram', { id: 'shop', drift: false })
    expect(stale.picture.current).toBe(false)
    expect(stale.problems).toEqual([
      expect.objectContaining({ code: 'stale-picture', line: 1, repair: 'plan_diagram_export' })
    ])
  })

  it('plans a new Diagram as a file of its own', async () => {
    const { plan, applied } = await planned('plan_new_diagram', {
      id: 'context',
      title: 'The shop and what it uses',
      level: 'system-context',
      elements: [
        { kind: 'repository', id: 'shop', name: 'The shop', at: { x: 40, y: 40 } },
        { kind: 'external', id: 'payments', name: 'Payments', at: { x: 340, y: 40 } }
      ],
      connections: [{ from: 'shop', to: 'payments', label: 'takes payments' }]
    })
    const path = 'docs/architecture/diagrams/context.yml'
    expect(plan.diagram).toEqual({ id: 'context', path })
    expect(applied.files).toEqual([path])
    expect(readFileSync(join(root, path), 'utf8')).toBe(
      [
        'title: The shop and what it uses',
        'level: system-context',
        'elements:',
        '  - repository: shop',
        '    name: The shop',
        '    at: [40, 40]',
        '  - external: payments',
        '    name: Payments',
        '    at: [340, 40]',
        'connections:',
        '  - from: shop',
        '    to: payments',
        '    label: takes payments',
        ''
      ].join('\n')
    )
    expect(
      await refused('plan_new_diagram', {
        id: 'context',
        level: 'container',
        elements: [],
        connections: []
      })
    ).toContain('already exists')
  })

  it('repairs an element whose Component is gone, by its lines', async () => {
    writeFileSync(
      join(root, DIAGRAM),
      SHOP.replace('  - component: persistence', '  - component: storage').replaceAll(
        '    to: persistence',
        '    to: storage'
      )
    )
    const read = await call('read_diagram', { id: 'shop', drift: false })
    expect(read.problems).toEqual([
      expect.objectContaining({
        code: 'component-gone',
        component: 'storage',
        repair: 'plan_diagram_repair'
      })
    ])
    await planned('plan_diagram_repair', { id: 'shop', component: 'storage' })
    const text = readFileSync(join(root, DIAGRAM), 'utf8')
    expect(text).not.toContain('storage')
    expect(await refused('plan_diagram_repair', { id: 'shop', component: 'storage' })).toBe(
      'The Diagram shop has no Problem component-gone of storage: read_diagram lists its Problems.'
    )
  })

  it('refuses what it cannot do, in words the agent can act on', async () => {
    expect(await refused('read_diagram', { id: 'nowhere' })).toBe(
      'There is no Diagram nowhere in docs/architecture/diagrams. There is: shop.'
    )
    expect(
      await refused('plan_diagram_change', {
        id: 'shop',
        edits: [{ kind: 'move-element', id: 'web' }]
      })
    ).toBe(
      'One of the edits is not one: each has a kind and the fields of its kind, as the description says.'
    )
    expect(
      await refused('plan_diagram_change', {
        id: 'shop',
        edits: [{ kind: 'move-element', id: 'gone', at: { x: 0, y: 0 } }]
      })
    ).toMatch(/gone/)
    expect(existsSync(join(root, PICTURE))).toBe(false)
  })
})
