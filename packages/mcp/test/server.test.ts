import { execFileSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { devNull, tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listTemplates, memoryFileSystem, openRepository, planCreate } from '@adr-tool/core'
import { repositoryFiles } from '../src/files'
import { PROTOCOL_VERSIONS, serve, type Tool } from '../src/protocol'
import { toolsFor } from '../src/tools'

// docs/plan-roadmap.md, part 9; docs/mcp.md

const repository = fileURLToPath(new URL('../../../', import.meta.url))
const TODAY = '2026-11-02'

/**
 * The server on a pair of streams, and the reference client of the Model Context Protocol
 * talking to it over them, a JSON-RPC message per line, as over a process's stdin and stdout.
 */
async function connect(
  root: string,
  tools = toolsFor({ root, today: () => TODAY, author: async () => 'Kim Becker' })
): Promise<{ client: Client; close: () => Promise<void> }> {
  const toServer = new PassThrough()
  const fromServer = new PassThrough()
  const served = serve(
    toServer,
    fromServer,
    { name: 'softarch-suite', title: 'Softarch Suite', version: '0.0.0', instructions: 'Test.' },
    tools
  )
  let buffered = ''
  const transport: Transport = {
    start: async () => {
      fromServer.on('data', (chunk: Buffer) => {
        buffered += chunk.toString('utf8')
        let end: number
        while ((end = buffered.indexOf('\n')) >= 0) {
          const line = buffered.slice(0, end)
          buffered = buffered.slice(end + 1)
          transport.onmessage?.(JSON.parse(line) as JSONRPCMessage)
        }
      })
    },
    send: async (message) => {
      toServer.write(`${JSON.stringify(message)}\n`)
    },
    close: async () => {
      toServer.end()
      transport.onclose?.()
    }
  }
  const client = new Client({ name: 'test', version: '1.0.0' })
  await client.connect(transport)
  return {
    client,
    close: async () => {
      await client.close()
      await served
    }
  }
}

type Result = { structuredContent?: Record<string, unknown>; isError?: boolean; content: unknown }

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const result = (await client.callTool({ name, arguments: args })) as Result
  if (result.isError) throw new Error(JSON.stringify(result.content))
  // What a tool answers is JSON that the tests walk into freely.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return result.structuredContent as Record<string, any>
}

async function refusal(
  client: Client,
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  const result = (await client.callTool({ name, arguments: args })) as Result
  expect(result.isError).toBe(true)
  return (result.content as { text: string }[])[0]!.text
}

let root: string
beforeEach(() => {
  // A copy of this repository's Decision Log and declaration: what the server writes stays there.
  root = mkdtempSync(join(tmpdir(), 'adr-tool-mcp-'))
  cpSync(join(repository, 'docs/adr'), join(root, 'docs/adr'), { recursive: true })
  cpSync(join(repository, '.arch'), join(root, '.arch'), { recursive: true })
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('the MCP server (docs/mcp.md)', () => {
  it('speaks the protocol with the reference client', async () => {
    const { client, close } = await connect(root)
    expect(client.getServerVersion()).toMatchObject({ name: 'softarch-suite' })
    expect(client.getServerCapabilities()).toEqual({ tools: { listChanged: false } })
    const { tools } = await client.listTools()
    expect(tools.map((tool) => tool.name)).toEqual([
      'list_decision_logs',
      'list_adrs',
      'read_adr',
      'search_adrs',
      'list_problems',
      'list_templates',
      'list_components',
      'read_structure',
      'list_rules',
      'list_violations',
      'plan_create_adr',
      'plan_decision',
      'plan_edit_body',
      'plan_edit_metadata',
      'plan_repair',
      'plan_migration',
      'plan_rule',
      'plan_exception',
      'list_diagrams',
      'read_diagram',
      'plan_new_diagram',
      'plan_diagram_change',
      'plan_diagram_export',
      'plan_diagram_repair',
      'apply_change',
      'discard_change'
    ])
    // What only reads says so; only apply_change writes.
    expect(
      tools.filter((tool) => !tool.annotations?.readOnlyHint).map((tool) => tool.name)
    ).toEqual(['apply_change'])
    await close()
  })

  it("lists this repository's ADRs, reads one, and creates one as the app would", async () => {
    const { client, close } = await connect(root)

    const { adrs } = await call(client, 'list_adrs')
    expect(adrs.length).toBeGreaterThanOrEqual(12)
    expect(adrs[0]).toMatchObject({
      log: 'docs/adr',
      id: '0001-electron-svelte-typescript-throughout',
      number: 1,
      status: 'accepted'
    })

    const adr = await call(client, 'read_adr', { id: '0004-operations-return-change-sets' })
    expect(adr.title).toBe('Operations return change sets and never write')
    expect(adr.body).toBe(
      readFileSync(join(root, 'docs/adr/0004-operations-return-change-sets.md'), 'utf8').split(
        /\n---\n/
      )[1]
    )

    const planned = await call(client, 'plan_create_adr', {
      title: 'Agents reach the Decision Logs over MCP'
    })
    // The next number follows the highest; a number may be left free for an ADR still in a branch.
    const highest = Math.max(...adrs.map((one: { number: number }) => one.number))
    const id = `${String(highest + 1).padStart(4, '0')}-agents-reach-the-decision-logs-over-mcp`
    expect(planned.created).toEqual({ log: 'docs/adr', id, path: `docs/adr/${id}.md` })
    expect(planned.files).toHaveLength(1)
    expect(planned.files[0]).toMatchObject({ path: `docs/adr/${id}.md`, creates: true })
    expect(planned.files[0].diff).toContain('+status: proposed')
    // Planned is not written.
    expect(() => readFileSync(join(root, `docs/adr/${id}.md`))).toThrow()

    // What the app writes: core's planCreate, with the default Template, on the same day.
    const fs = memoryFileSystem({})
    const app = await planCreate(
      repositoryFiles(root),
      (await openRepository(repositoryFiles(root))).logs[0]!,
      {
        title: 'Agents reach the Decision Logs over MCP',
        template: (await listTemplates(fs)).defaultName,
        today: TODAY
      }
    )
    if (!app.ok) throw new Error(app.reason)

    const applied = await call(client, 'apply_change', { changeId: planned.changeId })
    expect(applied).toEqual({
      applied: true,
      files: [`docs/adr/${id}.md`],
      created: { log: 'docs/adr', id, path: `docs/adr/${id}.md` }
    })
    expect(readFileSync(join(root, `docs/adr/${id}.md`), 'utf8')).toBe(
      app.changeSet.files[0]!.after
    )

    const read = await call(client, 'read_adr', { id })
    expect(read).toMatchObject({
      status: 'proposed',
      created: TODAY,
      title: 'Agents reach the Decision Logs over MCP'
    })
    await close()
  })

  it('writes a decision only when it is applied, and not after the file changed', async () => {
    const { client, close } = await connect(root)
    const { created } = await call(client, 'apply_change', {
      changeId: (await call(client, 'plan_create_adr', { title: 'Try it' })).changeId
    })
    const accept = await call(client, 'plan_decision', { id: created.id, decision: 'accept' })
    expect(accept.files[0].diff).toContain('-status: proposed')
    expect(accept.files[0].diff).toContain('+status: accepted')

    // Someone else edits the file in the meantime: nothing is written.
    const path = join(root, created.path)
    writeFileSync(path, readFileSync(path, 'utf8').replace('# Try it', '# Try it out'))
    expect(await refusal(client, 'apply_change', { changeId: accept.changeId })).toContain(
      'changed on disk after the change was planned'
    )
    // A change is applied once.
    expect(await refusal(client, 'apply_change', { changeId: accept.changeId })).toContain(
      'There is no planned change with this changeId'
    )
    await close()
  })

  it('finds, edits and checks', async () => {
    const { client, close } = await connect(root)
    const { adrs } = await call(client, 'search_adrs', { query: 'reserialize MARKDOWN' })
    expect(adrs[0]).toMatchObject({ id: '0002-never-reserialize-markdown' })

    const { created } = await call(client, 'apply_change', {
      changeId: (await call(client, 'plan_create_adr', { title: 'Tags and text' })).changeId
    })
    // A Trace is checked against the Components the repository declares.
    expect(
      await refusal(client, 'plan_edit_metadata', { id: created.id, affects: ['nowhere'] })
    ).toBe('There is no declared Component nowhere.')
    const tagged = await call(client, 'plan_edit_metadata', {
      id: created.id,
      tags: ['agents'],
      affects: ['mcp']
    })
    expect(tagged.files[0].diff).toContain('+tags: [agents]')
    expect(tagged.files[0].diff).toContain('+affects: [mcp]')
    const read = await call(client, 'read_adr', { id: created.id })
    // A person adds a line in the meantime: the agent's edit of what it read is refused.
    const path = join(root, read.path as string)
    writeFileSync(path, `${readFileSync(path, 'utf8')}\nA line a person added.\n`)
    expect(
      await refusal(client, 'plan_edit_body', {
        id: created.id,
        body: '\n# Tags and text\n\nRewritten by an agent.\n',
        revision: read.revision
      })
    ).toMatch(/^The body of .* changed since it was read/)
    const again = await call(client, 'read_adr', { id: created.id })
    expect(again.body).toContain('A line a person added.')
    const body = await call(client, 'plan_edit_body', {
      id: created.id,
      body: `${again.body}Rewritten by an agent.\n`,
      revision: again.revision
    })
    expect(body.files[0].diff).toContain('+Rewritten by an agent.')
    expect(body.files[0].diff).not.toContain('-A line a person added.')

    const { problems } = await call(client, 'list_problems')
    expect(problems).toEqual([])
    await close()
  })

  it("records a Correction for git's user.name when the agent names nobody", async () => {
    const env = { ...process.env, GIT_CONFIG_GLOBAL: devNull, GIT_CONFIG_NOSYSTEM: '1' }
    execFileSync('git', ['init', '-q', '-b', 'trunk'], { cwd: root, env })
    execFileSync('git', ['config', 'user.name', 'Lena Becker'], { cwd: root, env })
    const { client, close } = await connect(root, toolsFor({ root, today: () => TODAY }))
    const read = await call(client, 'read_adr', { id: '0004-operations-return-change-sets' })
    const edited = await call(client, 'plan_edit_body', {
      id: read.id,
      body: `${read.body}One more sentence.\n`,
      revision: read.revision,
      note: 'Says what the change set holds.'
    })
    expect(edited.files[0].diff).toContain('Lena Becker')
    await close()
  })

  it('refuses what it cannot do, in words the agent can act on', async () => {
    const { client, close } = await connect(root)
    expect(await refusal(client, 'read_adr', { id: '9999-none' })).toBe(
      'There is no ADR 9999-none in docs/adr.'
    )
    expect(await refusal(client, 'read_adr', { id: 'x', log: 'nowhere' })).toBe(
      'There is no Decision Log at nowhere. The repository has: docs/adr.'
    )
    expect(
      await refusal(client, 'plan_decision', {
        id: '0001-electron-svelte-typescript-throughout',
        decision: 'accept'
      })
    ).toContain('proposed')
    expect(await refusal(client, 'list_adrs', { status: 'maybe' })).toBe(
      'arguments.status must be one of proposed, accepted, rejected, deprecated, superseded, unknown.'
    )
    expect(await refusal(client, 'plan_create_adr', { title: '  ' })).toBe(
      'arguments.title must not be empty.'
    )
    expect(await refusal(client, 'list_adrs', { path: '/etc' })).toContain(
      'arguments.path is not expected'
    )
    await close()
  })

  it('starts the first Decision Log of a repository that has none', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'adr-tool-mcp-empty-'))
    try {
      const { client, close } = await connect(empty)
      expect(await refusal(client, 'list_adrs', { log: 'docs/adr' })).toBe(
        'There is no Decision Log at docs/adr: the repository has none yet.'
      )
      const planned = await call(client, 'plan_create_adr', { title: 'Record decisions' })
      expect(planned.created).toMatchObject({
        id: '0001-record-decisions',
        path: 'docs/adr/0001-record-decisions.md'
      })
      await call(client, 'apply_change', { changeId: planned.changeId })
      const { logs } = await call(client, 'list_decision_logs')
      expect(logs).toEqual([{ path: 'docs/adr', naming: 'sequential', adrs: 1, problems: 0 }])
      await close()
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }
  })
})

describe('the Structure and the Rules (docs/plan-vision.md, part 4)', () => {
  let shop: string
  beforeEach(() => {
    // A shop with a Decision Log to justify an Exception by: web uses billing, billing persistence.
    shop = mkdtempSync(join(tmpdir(), 'adr-tool-mcp-shop-'))
    cpSync(join(repository, 'docs/adr'), join(shop, 'docs/adr'), { recursive: true })
    const files: Record<string, string> = {
      '.arch/components.yml': [
        'components:',
        '  web:',
        '    paths: [src/web/**]',
        '  billing:',
        '    paths: [src/billing/**]',
        '  persistence:',
        '    paths: [src/persistence/**]',
        ''
      ].join('\n'),
      'src/web/page.ts': "import { invoice } from '../billing/invoice'\n",
      'src/billing/invoice.ts':
        "import { save } from '../persistence/db'\nexport const invoice = 1\n",
      'src/persistence/db.ts': 'export const save = 1\n'
    }
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(join(shop, path, '..'), { recursive: true })
      writeFileSync(join(shop, path), text)
    }
  })
  afterEach(() => rmSync(shop, { recursive: true, force: true }))

  const ADR = 'docs/adr/0004-operations-return-change-sets'

  it('lets the agent see a Rule before it writes the code, and the person accept what it breaks', async () => {
    const { client, close } = await connect(shop)
    const rules = join(shop, '.arch/rules.yml')

    // Lena's Rule, planned and applied: the file is started.
    const rule = await call(client, 'plan_rule', {
      id: 'persistence-alone',
      why: 'What is stored knows nothing of the domain.',
      kind: 'may-only-depend',
      from: ['persistence'],
      to: []
    })
    expect(rule.files[0]).toMatchObject({ path: '.arch/rules.yml', creates: true })
    expect(rule.files[0].diff).toContain('+  - id: persistence-alone')
    expect(existsSync(rules)).toBe(false)
    await call(client, 'apply_change', { changeId: rule.changeId })

    const listed = await call(client, 'list_rules')
    expect(listed.rules).toEqual([
      {
        id: 'persistence-alone',
        why: 'What is stored knows nothing of the domain.',
        kind: 'may-only-depend',
        from: ['persistence'],
        to: [],
        line: 2,
        violations: 0,
        accepted: 0
      }
    ])

    // The agent asks before it writes an import, by the specifier it would write.
    const asked = await call(client, 'list_violations', {
      from: 'src/persistence/db.ts',
      to: '../billing/invoice'
    })
    expect(asked.import).toEqual({
      from: 'src/persistence/db.ts',
      to: 'src/billing/invoice.ts',
      written: '../billing/invoice',
      fromComponent: 'persistence',
      toComponent: 'billing',
      exists: false
    })
    expect(asked.breaks).toBe(1)
    expect(asked.violations[0]).toMatchObject({
      rule: 'persistence-alone',
      sentence: 'persistence may depend on no other Component, and depends on billing.',
      fingerprint: { rule: 'persistence-alone', from: 'persistence', to: 'billing' }
    })
    // From a file that is not written yet, and an import that breaks nothing.
    const fresh = await call(client, 'list_violations', {
      from: 'src/persistence/cache.ts',
      to: 'src/web/page.ts'
    })
    expect(fresh.violations[0].fingerprint).toEqual({
      rule: 'persistence-alone',
      from: 'persistence',
      to: 'web'
    })
    const fine = await call(client, 'list_violations', {
      from: 'src/web/page.ts',
      to: 'src/persistence/db.ts'
    })
    expect(fine).toMatchObject({ breaks: 0, violations: [], next: 'The import breaks no Rule.' })
    const library = await call(client, 'list_violations', {
      from: 'src/persistence/db.ts',
      to: 'yaml'
    })
    expect(library.note).toContain('is the Library yaml')

    // It is written all the same, and the person accepts it, citing an ADR.
    writeFileSync(
      join(shop, 'src/persistence/db.ts'),
      "import { invoice } from '../billing/invoice'\nexport const save = 1\n"
    )
    const found = await call(client, 'list_violations', { component: 'billing' })
    expect(found.breaks).toBe(1)
    expect(found.violations[0].imports).toEqual([
      { file: 'src/persistence/db.ts', line: 1, imports: 'src/billing/invoice.ts' }
    ])
    expect(
      await refusal(client, 'plan_exception', {
        ...found.violations[0].fingerprint,
        reason: 'For now.',
        justifiedBy: 'docs/adr/9999-none'
      })
    ).toContain('which is not an ADR of this repository')
    const exception = await call(client, 'plan_exception', {
      ...found.violations[0].fingerprint,
      reason: 'The invoice is saved as it is printed, until part 5.',
      justifiedBy: ADR
    })
    expect(exception.files[0].diff).toContain('+exceptions:')
    expect(exception.files[0].diff).toContain(`+    justified-by: ${ADR}`)
    await call(client, 'apply_change', { changeId: exception.changeId })
    const accepted = await call(client, 'list_violations')
    expect(accepted.breaks).toBe(0)
    expect(accepted.violations[0].acceptedBy).toEqual({
      line: 8,
      reason: 'The invoice is saved as it is printed, until part 5.',
      justifiedBy: ADR
    })

    // The Structure as data: the Dependencies, the Cycle, the metrics.
    const structure = await call(client, 'read_structure')
    expect(structure.components).toBe('declared')
    expect(structure.nodes.map((node: { id: string }) => node.id)).toEqual([
      'web',
      'billing',
      'persistence'
    ])
    expect(structure.nodes[0]).toMatchObject({ files: 1, fanOut: 1, fanIn: 0, instability: 1 })
    expect(
      structure.dependencies.map((edge: { from: string; to: string }) => `${edge.from}->${edge.to}`)
    ).toEqual(['billing->persistence', 'persistence->billing', 'web->billing'])
    expect(structure.cycles[0].members).toEqual(['billing', 'persistence'])

    // The import goes again: the Exception matches nothing, and its Repair takes it out.
    writeFileSync(join(shop, 'src/persistence/db.ts'), 'export const save = 1\n')
    const stale = await call(client, 'list_rules')
    expect(stale.problems).toHaveLength(1)
    expect(stale.problems[0]).toMatchObject({ code: 'unmatched-exception', line: 8 })
    const repair = await call(client, 'plan_exception', stale.problems[0].repair.arguments)
    await call(client, 'apply_change', { changeId: repair.changeId })
    expect((await call(client, 'list_rules')).problems).toEqual([])

    // A change keeps what it does not name; a removal takes the Rule's lines.
    const changed = await call(client, 'plan_rule', {
      action: 'change',
      id: 'persistence-alone',
      to: ['billing']
    })
    expect(changed.files[0].diff).toContain('+    to: [billing]')
    expect(changed.files[0].diff).not.toContain('-    why:')
    const removed = await call(client, 'plan_rule', { action: 'remove', id: 'persistence-alone' })
    expect(removed.files[0].diff).toContain('-  - id: persistence-alone')
    await close()
  })

  it('plans a Rule about Libraries, lists its Violation at each import, and accepts it (part 15)', async () => {
    const { client, close } = await connect(shop)
    writeFileSync(
      join(shop, 'src/web/page.ts'),
      "import { invoice } from '../billing/invoice'\nimport { Pool } from 'pg'\n"
    )
    const rule = await call(client, 'plan_rule', {
      id: 'only-persistence-uses-pg',
      why: 'The database is the business of persistence.',
      kind: 'library',
      library: ['pg'],
      'only-in': ['persistence']
    })
    expect(rule.files[0].diff).toContain('+    library: pg')
    expect(rule.files[0].diff).toContain('+    only-in: persistence')
    await call(client, 'apply_change', { changeId: rule.changeId })
    expect((await call(client, 'list_rules')).rules).toEqual([
      {
        id: 'only-persistence-uses-pg',
        why: 'The database is the business of persistence.',
        kind: 'library',
        library: ['pg'],
        'only-in': ['persistence'],
        line: 2,
        violations: 1,
        accepted: 0
      }
    ])
    const { violations } = await call(client, 'list_violations')
    expect(violations).toMatchObject([
      {
        rule: 'only-persistence-uses-pg',
        kind: 'library',
        fingerprint: { rule: 'only-persistence-uses-pg', component: 'web', library: 'pg' },
        component: 'web',
        library: 'pg',
        imports: [{ file: 'src/web/page.ts', line: 2, imports: 'pg' }]
      }
    ])
    const accepted = await call(client, 'plan_exception', {
      ...violations[0].fingerprint,
      reason: 'The page reads one report itself, for now.'
    })
    expect(accepted.files[0].diff).toContain('+    library: pg')
    await call(client, 'apply_change', { changeId: accepted.changeId })
    expect((await call(client, 'list_rules')).rules[0]).toMatchObject({
      violations: 0,
      accepted: 1
    })
    // Changed to not-in, its only-in is gone.
    const changed = await call(client, 'plan_rule', {
      action: 'change',
      id: 'only-persistence-uses-pg',
      'not-in': ['web']
    })
    expect(changed.files[0].diff).toContain('+    not-in: web')
    expect(changed.files[0].diff).toContain('-    only-in: persistence')
    await close()
  })

  it('refuses what it cannot plan, in words the agent can act on', async () => {
    const { client, close } = await connect(shop)
    expect(await refusal(client, 'plan_rule', { id: 'x', why: 'X.' })).toBe(
      'A new Rule needs a "kind": one of must-not-depend, may-only-depend, layers, no-cycles, threshold, library.'
    )
    expect(
      await refusal(client, 'plan_rule', {
        id: 'x',
        why: 'X.',
        kind: 'must-not-depend',
        from: ['web']
      })
    ).toBe('A Rule of the kind must-not-depend needs "to".')
    expect(await refusal(client, 'plan_rule', { action: 'change', id: 'x', why: 'X.' })).toBe(
      '.arch/rules.yml has no Rule x. Look at the file again.'
    )
    expect(await refusal(client, 'list_violations', { from: 'src/web/page.ts' })).toBe(
      'A planned import needs both "from" and "to".'
    )
    expect(
      await refusal(client, 'list_violations', { from: 'README.md', to: 'src/web/page.ts' })
    ).toContain('README.md is no Source File')
    expect(
      await refusal(client, 'list_violations', { from: 'src/web/page.ts', to: './nowhere' })
    ).toContain('./nowhere cannot be resolved from src/web/page.ts')
    expect(await refusal(client, 'plan_exception', { rule: 'x', from: 'web', reason: 'R.' })).toBe(
      'An Exception from x names its Violation by "from" and "to", as list_violations gives them in "fingerprint".'
    )
    expect(await refusal(client, 'read_structure', { component: 'nowhere' })).toContain(
      'There is no Component nowhere.'
    )
    await close()
  })

  it('plans an import of a file not written yet, measures no own files, and accepts the Violation of a function', async () => {
    writeFileSync(
      join(shop, '.arch/components.yml'),
      [
        'components:',
        '  web:',
        '    paths: [src/web/**]',
        '  billing:',
        '    paths: [src/billing/**]',
        '    components:',
        '      tax:',
        '        paths: [src/billing/tax/**]',
        '  persistence:',
        '    paths: [src/persistence/**]',
        ''
      ].join('\n')
    )
    mkdirSync(join(shop, 'src/billing/tax'), { recursive: true })
    writeFileSync(
      join(shop, 'src/billing/tax/rate.ts'),
      [
        'export function rate(country: string): number {',
        "  if (country === 'de') return 0.19",
        "  if (country === 'at') return 0.2",
        '  return 0',
        '}',
        ''
      ].join('\n')
    )
    writeFileSync(
      join(shop, '.arch/rules.yml'),
      [
        'rules:',
        '  - id: persistence-alone',
        '    why: What is stored knows nothing of the domain.',
        '    kind: may-only-depend',
        '    from: persistence',
        '    to: []',
        '  - id: simple',
        '    why: A function is read in one go.',
        '    kind: threshold',
        '    metric: complexity',
        '    max: 2',
        '    of: billing',
        ''
      ].join('\n')
    )
    const { client, close } = await connect(shop)

    // An import of a file that is not there yet, named by its path: a Source File, no Library.
    const planned = await call(client, 'list_violations', {
      from: 'src/persistence/db.ts',
      to: 'src/web/chart.ts'
    })
    expect(planned.import).toMatchObject({
      from: 'src/persistence/db.ts',
      to: 'src/web/chart.ts',
      toComponent: 'web',
      exists: false
    })
    expect(planned.violations.map((one: { fingerprint: unknown }) => one.fingerprint)).toEqual([
      { rule: 'persistence-alone', from: 'persistence', to: 'web' }
    ])

    // The own files of billing have a size, and no metric of the Component they stand beside.
    const level = await call(client, 'read_structure', { component: 'billing' })
    const own = level.nodes.find((node: { kind: string }) => node.kind === 'own-files')
    expect(own).toEqual({ id: 'billing', kind: 'own-files', files: 1, lines: 2 })
    expect(level.nodes.find((node: { id: string }) => node.id === 'billing/tax')).toHaveProperty(
      'fanOut'
    )

    // The Violation of a function is named by its file and its name, and accepted by them.
    const found = await call(client, 'list_violations', { component: 'billing' })
    expect(found.violations[0]).toMatchObject({
      rule: 'simple',
      file: 'src/billing/tax/rate.ts',
      name: 'rate',
      line: 1,
      value: 3,
      fingerprint: { rule: 'simple', file: 'src/billing/tax/rate.ts', name: 'rate' }
    })
    expect(
      await refusal(client, 'plan_exception', {
        rule: 'simple',
        component: 'billing',
        reason: 'R.'
      })
    ).toBe(
      'An Exception from simple names its Violation by "file" and "name", as list_violations gives them in "fingerprint".'
    )
    const exception = await call(client, 'plan_exception', {
      ...found.violations[0].fingerprint,
      reason: 'The rates are a table, read as one.'
    })
    expect(exception.files[0].diff).toContain('+    file: src/billing/tax/rate.ts')
    expect(exception.files[0].diff).toContain('+    name: rate')
    await call(client, 'apply_change', { changeId: exception.changeId })
    const accepted = await call(client, 'list_violations', { component: 'billing' })
    expect(accepted.breaks).toBe(0)
    expect(accepted.violations[0].acceptedBy).toMatchObject({
      reason: 'The rates are a table, read as one.'
    })

    // A change merges what it names into the Rule: of the same family of kinds, its keys stay.
    const turned = await call(client, 'plan_rule', {
      action: 'change',
      id: 'persistence-alone',
      kind: 'must-not-depend',
      to: ['web']
    })
    expect(turned.files[0].diff).toContain('+    kind: must-not-depend')
    expect(turned.files[0].diff).toContain('+    to: [web]')
    expect(turned.files[0].diff).not.toContain('-    from:')
    const bounded = await call(client, 'plan_rule', { action: 'change', id: 'simple', min: 1 })
    expect(bounded.files[0].diff).toContain('-    max: 2')
    expect(bounded.files[0].diff).toContain('+    min: 1')
    await close()
  })
})

describe('the protocol, line by line', () => {
  async function exchange(lines: string[]): Promise<unknown[]> {
    const input = new PassThrough()
    const output = new PassThrough()
    let text = ''
    output.on('data', (chunk: Buffer) => (text += chunk.toString('utf8')))
    const done = serve(input, output, { name: 's', title: 'S', version: '0', instructions: '' }, [])
    for (const line of lines) input.write(`${line}\n`)
    input.end()
    await done
    return text
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as unknown)
  }

  it('answers requests, ignores notifications, and says what it does not understand', async () => {
    const replies = await exchange([
      '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"c","version":"1"}}}',
      '{"jsonrpc":"2.0","method":"notifications/initialized"}',
      '{"jsonrpc":"2.0","id":2,"method":"ping"}',
      'not json',
      '{"jsonrpc":"2.0","id":3,"method":"resources/list"}',
      '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"nothing"}}'
    ])
    // initialize and ping are answered at once, the rest in the order it came.
    expect(replies).toHaveLength(5)
    expect(replies).toEqual(
      expect.arrayContaining([
        {
          jsonrpc: '2.0',
          id: 1,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: 's', title: 'S', version: '0' },
            instructions: ''
          }
        },
        { jsonrpc: '2.0', id: 2, result: {} },
        { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'The line is not JSON.' } },
        {
          jsonrpc: '2.0',
          id: 3,
          error: { code: -32601, message: 'This server does not know "resources/list".' }
        },
        { jsonrpc: '2.0', id: 4, error: { code: -32602, message: 'There is no tool "nothing".' } }
      ])
    )
    const queued = replies.filter((reply) => ![1, 2].includes((reply as { id: number }).id))
    expect(queued).toEqual([
      expect.objectContaining({ id: null }),
      expect.objectContaining({ id: 3 }),
      expect.objectContaining({ id: 4 })
    ])
  })

  it('offers its newest version to a client that asks for one it does not know', async () => {
    const [reply] = (await exchange([
      '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2099-01-01"}}'
    ])) as { result: { protocolVersion: string } }[]
    expect(reply!.result.protocolVersion).toBe(PROTOCOL_VERSIONS[0])
  })
})

describe('what the review found (PR #41)', () => {
  /** Lines in, lines out, with the tools of the repository at `root`. */
  async function rawly(tools: Tool[], lines: string[]): Promise<Record<string, unknown>[]> {
    const input = new PassThrough()
    const output = new PassThrough()
    let text = ''
    output.on('data', (chunk: Buffer) => (text += chunk.toString('utf8')))
    const done = serve(
      input,
      output,
      { name: 's', title: 'S', version: '0', instructions: '' },
      tools
    )
    for (const line of lines) input.write(`${line}\n`)
    input.end()
    await done
    return text
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>)
  }
  const callLine = (id: number, name: string, args: Record<string, unknown>): string =>
    JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } })

  it('applies the writes of a batch one after another', async () => {
    // One server, with the changes it holds, for the client and for the lines by hand.
    const tools = toolsFor({ root, today: () => TODAY, author: async () => 'Kim Becker' })
    const { client, close } = await connect(root, tools)
    const { created } = await call(client, 'apply_change', {
      changeId: (await call(client, 'plan_create_adr', { title: 'Batched' })).changeId
    })
    const read = await call(client, 'read_adr', { id: created.id })
    const accept = await call(client, 'plan_decision', { id: created.id, decision: 'accept' })
    const edit = await call(client, 'plan_edit_body', {
      id: created.id,
      body: '\n# Rewritten\n',
      revision: read.revision
    })
    await close()

    const [answers] = (await rawly(tools, [
      JSON.stringify([
        JSON.parse(callLine(1, 'apply_change', { changeId: accept.changeId })),
        JSON.parse(callLine(2, 'apply_change', { changeId: edit.changeId }))
      ])
    ])) as unknown as { result: { isError?: boolean; content: { text: string }[] } }[][]
    // The first is written; the second was planned against the file before it, and is refused.
    expect(answers![0]!.result.isError).toBeUndefined()
    expect(answers![1]!.result.isError).toBe(true)
    expect(answers![1]!.result.content[0]!.text).toContain('changed on disk')
    const text = readFileSync(join(root, created.path as string), 'utf8')
    expect(text).toContain('status: accepted')
    expect(text).toContain('# Batched')
  })

  it('reads a file through one handle: within its limit, a directory as none, a FIFO not waited for', async () => {
    const root = mkdtempSync(join(tmpdir(), 'adr-read-once-'))
    try {
      writeFileSync(join(root, 'ten.txt'), '0123456789')
      mkdirSync(join(root, 'dir'))
      const fs = repositoryFiles(root)
      expect(await fs.readText('ten.txt', { atMost: 10 })).toBe('0123456789')
      expect(await fs.readText('ten.txt', { atMost: 9 })).toBeUndefined()
      expect(await fs.readText('ten.txt')).toBe('0123456789')
      expect(await fs.readText('dir')).toBeUndefined()
      expect(await fs.readText('dir', { atMost: 10 })).toBeUndefined()
      if (process.platform !== 'win32') {
        execFileSync('mkfifo', [join(root, 'pipe')])
        expect(await fs.readText('pipe', { atMost: 10 })).toBeUndefined()
        expect(await fs.readText('pipe')).toBeUndefined()
      }
      // A link that leads out is named as such, and not read.
      symlinkSync(tmpdir(), join(root, 'linked'), 'junction')
      expect(await fs.leadsOutside?.('linked')).toBe(true)
      expect(await fs.readText('linked/x')).toBeUndefined()
      for (const path of ['ten.txt', 'dir', 'missing', '../x']) {
        expect(await fs.leadsOutside?.(path), path).toBe(false)
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('writes nothing through a symbolic link that leads nowhere, and says so', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'adr-tool-mcp-outside-'))
    try {
      const { adrs } = (await openRepository(repositoryFiles(root))).logs[0]!
      const numbers = adrs.length
      const next = String(Math.max(...adrs.map((one) => one.number ?? 0)) + 1).padStart(4, '0')
      symlinkSync(join(outside, 'pwned.md'), join(root, `docs/adr/${next}-use-kafka.md`))
      // A link to itself: a loop that is nothing to read.
      symlinkSync('loop.md', join(root, 'docs/adr/loop.md'))
      const { client, close } = await connect(root)
      expect((await call(client, 'list_decision_logs')).logs[0].adrs).toBe(numbers)
      const planned = await call(client, 'plan_create_adr', { title: 'Use Kafka' })
      expect(planned.created.id).toBe(`${next}-use-kafka`)
      expect(await refusal(client, 'apply_change', { changeId: planned.changeId })).toBe(
        `Nothing was written. docs/adr/${next}-use-kafka.md is a symbolic link that leads nowhere: it is not written. Every file is as it was before; apply_change with this changeId tries again.`
      )
      expect(existsSync(join(outside, 'pwned.md'))).toBe(false)
      // Nothing was left beside the link either.
      expect(readdirSync(join(root, 'docs/adr')).filter((name) => name.startsWith('.'))).toEqual([])
      await close()
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  })

  it('names the Decision Log at the top of the repository "."', async () => {
    const top = mkdtempSync(join(tmpdir(), 'adr-tool-mcp-top-'))
    try {
      mkdirSync(join(top, '.adr'))
      mkdirSync(join(top, 'docs/adr'), { recursive: true })
      writeFileSync(join(top, '.adr/config.yml'), 'logs:\n  - path: .\n  - path: docs/adr\n')
      writeFileSync(join(top, '0001-top.md'), '---\nstatus: proposed\n---\n\n# Top\n')
      writeFileSync(join(top, 'docs/adr/0001-below.md'), '---\nstatus: proposed\n---\n\n# Below\n')
      const { client, close } = await connect(top)
      expect(
        (await call(client, 'list_decision_logs')).logs.map((log: { path: string }) => log.path)
      ).toEqual(['.', 'docs/adr'])
      expect((await call(client, 'list_adrs', { log: '.' })).adrs).toEqual([
        expect.objectContaining({ log: '.', id: '0001-top' })
      ])
      expect((await call(client, 'list_adrs', { log: '' })).adrs).toHaveLength(1)
      // An argument sent as null is one left out.
      expect((await call(client, 'list_adrs', { log: null, status: null })).adrs).toHaveLength(2)
      await close()
    } finally {
      rmSync(top, { recursive: true, force: true })
    }
  })

  it('starts the first Decision Log where the configuration says', async () => {
    const configured = mkdtempSync(join(tmpdir(), 'adr-tool-mcp-configured-'))
    try {
      writeFileSync(join(configured, '.adr-dir'), 'doc/architecture/decisions\n')
      const { client, close } = await connect(configured)
      const planned = await call(client, 'plan_create_adr', { title: 'Record decisions' })
      expect(planned.created.path).toBe('doc/architecture/decisions/0001-record-decisions.md')
      await call(client, 'apply_change', { changeId: planned.changeId })
      expect((await call(client, 'list_adrs')).adrs).toHaveLength(1)
      await close()

      writeFileSync(join(configured, '.adr-dir'), '/etc\n')
      const again = await connect(configured)
      rmSync(join(configured, 'doc'), { recursive: true })
      expect(await refusal(again.client, 'plan_create_adr', { title: 'Elsewhere' })).toMatch(
        /^\.adr-dir cannot be used: .* Repair it first\.$/
      )
      await again.close()
    } finally {
      rmSync(configured, { recursive: true, force: true })
    }
  })

  it('says that a rename is one, even when no line changes', async () => {
    const { client, close } = await connect(root)
    const { adrs } = await call(client, 'list_adrs')
    const next = String(
      Math.max(...adrs.map((one: { number: number }) => one.number)) + 1
    ).padStart(4, '0')
    // Two ADRs with one number: the Repair renumbers the newer one.
    for (const slug of ['first', 'second']) {
      writeFileSync(
        join(root, `docs/adr/${next}-${slug}.md`),
        `---\nstatus: proposed\n---\n\n# ${slug}\n`
      )
    }
    const { problems } = await call(client, 'list_problems')
    const repair = problems.flatMap((problem: { repairs: unknown[] }) => problem.repairs)[0]
    const planned = await call(client, 'plan_repair', { repair })
    const renamed = planned.files.find((file: { renameTo?: string }) => file.renameTo)
    expect(renamed.diff).toMatch(/^rename from docs\/adr\/.*\nrename to docs\/adr\//)
    await close()
  })
})

describe('the protocol under load (PR #41)', () => {
  const slow: Tool = {
    name: 'slow',
    title: 'Slow',
    description: 'Takes its time.',
    inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    annotations: {},
    run: () => new Promise((resolve) => setTimeout(() => resolve({ done: true }), 100))
  }

  async function exchange(lines: string[]): Promise<Record<string, unknown>[]> {
    const input = new PassThrough()
    const output = new PassThrough()
    const replies: Record<string, unknown>[] = []
    let text = ''
    output.on('data', (chunk: Buffer) => {
      text += chunk.toString('utf8')
      let end: number
      while ((end = text.indexOf('\n')) >= 0) {
        replies.push(JSON.parse(text.slice(0, end)) as Record<string, unknown>)
        text = text.slice(end + 1)
      }
    })
    const done = serve(input, output, { name: 's', title: 'S', version: '0', instructions: '' }, [
      slow
    ])
    for (const line of lines) input.write(`${line}\n`)
    input.end()
    await done
    return replies
  }
  const slowCall = (id: number): string =>
    JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'slow' } })

  it('answers ping while a tool runs, and runs no request the client cancelled', async () => {
    const replies = await exchange([
      slowCall(1),
      slowCall(2),
      '{"jsonrpc":"2.0","method":"notifications/cancelled","params":{"requestId":2}}',
      '{"jsonrpc":"2.0","id":3,"method":"ping"}'
    ])
    expect(replies.map((reply) => reply.id)).toEqual([3, 1])
  })

  it('answers no answer, and refuses what is no request', async () => {
    const replies = await exchange([
      '{"jsonrpc":"2.0","id":7,"result":{}}',
      '{"jsonrpc":"2.0","id":null,"method":"ping"}',
      '{"jsonrpc":"2.0","id":{"a":1},"method":"ping"}',
      '[]'
    ])
    expect(replies).toEqual([
      { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Not a JSON-RPC 2.0 request.' } },
      { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Not a JSON-RPC 2.0 request.' } },
      { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Not a JSON-RPC 2.0 request.' } }
    ])
  })

  it('stops quietly when the client stops reading', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const done = serve(input, output, { name: 's', title: 'S', version: '0', instructions: '' }, [])
    output.destroy(Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }))
    input.write('{"jsonrpc":"2.0","id":1,"method":"ping"}\n')
    await expect(done).resolves.toBeUndefined()
  })
})
