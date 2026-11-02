import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listTemplates, memoryFileSystem, openRepository, planCreate } from '@adr-tool/core'
import { repositoryFiles } from '../src/files'
import { PROTOCOL_VERSIONS, serve } from '../src/protocol'
import { toolsFor } from '../src/tools'

// docs/plan-roadmap.md, part 9; docs/mcp.md

const repository = fileURLToPath(new URL('../../../', import.meta.url))
const TODAY = '2026-11-02'

/**
 * The server on a pair of streams, and the reference client of the Model Context Protocol
 * talking to it over them, a JSON-RPC message per line, as over a process's stdin and stdout.
 */
async function connect(root: string): Promise<{ client: Client; close: () => Promise<void> }> {
  const toServer = new PassThrough()
  const fromServer = new PassThrough()
  const served = serve(
    toServer,
    fromServer,
    { name: 'softarch-suite', title: 'Softarch Suite', version: '0.0.0', instructions: 'Test.' },
    toolsFor({ root, today: () => TODAY, author: async () => 'Kim Becker' })
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
      'plan_create_adr',
      'plan_decision',
      'plan_edit_body',
      'plan_edit_metadata',
      'plan_repair',
      'plan_migration',
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
    const id = `${String(adrs.length + 1).padStart(4, '0')}-agents-reach-the-decision-logs-over-mcp`
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
    const body = await call(client, 'plan_edit_body', {
      id: created.id,
      body: '\n# Tags and text\n\nRewritten by an agent.\n'
    })
    expect(body.files[0].diff).toContain('+Rewritten by an agent.')

    const { problems } = await call(client, 'list_problems')
    expect(problems).toEqual([])
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
    expect(
      await exchange([
        '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"c","version":"1"}}}',
        '{"jsonrpc":"2.0","method":"notifications/initialized"}',
        '{"jsonrpc":"2.0","id":2,"method":"ping"}',
        'not json',
        '{"jsonrpc":"2.0","id":3,"method":"resources/list"}',
        '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"nothing"}}'
      ])
    ).toEqual([
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
      { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'The line is not JSON.' } },
      { jsonrpc: '2.0', id: 2, result: {} },
      {
        jsonrpc: '2.0',
        id: 3,
        error: { code: -32601, message: 'This server does not know "resources/list".' }
      },
      { jsonrpc: '2.0', id: 4, error: { code: -32602, message: 'There is no tool "nothing".' } }
    ])
  })

  it('offers its newest version to a client that asks for one it does not know', async () => {
    const [reply] = (await exchange([
      '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2099-01-01"}}'
    ])) as { result: { protocolVersion: string } }[]
    expect(reply!.result.protocolVersion).toBe(PROTOCOL_VERSIONS[0])
  })
})
