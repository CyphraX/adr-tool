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
import { PROTOCOL_VERSIONS, serve, type Tool } from '../src/protocol'
import { gitExecutable, toolsFor } from '../src/tools'

// docs/plan-roadmap.md, part 9; docs/mcp.md

const repository = fileURLToPath(new URL('../../../', import.meta.url))
const TODAY = '2026-11-02'

/** The number Create gives the next ADR: one above the highest, numbers left free or not. */
const nextNumber = (adrs: readonly { number?: number }[]): string =>
  String(Math.max(0, ...adrs.map((adr) => adr.number ?? 0)) + 1).padStart(4, '0')

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
    const id = `${nextNumber(adrs)}-agents-reach-the-decision-logs-over-mcp`
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

  it('writes nothing through a symbolic link that leads nowhere, and says so', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'adr-tool-mcp-outside-'))
    try {
      const listed = (await openRepository(repositoryFiles(root))).logs[0]!.adrs
      const numbers = listed.length
      const next = nextNumber(listed)
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
    const next = nextNumber((await call(client, 'list_adrs')).adrs)
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

describe('the git that is run', () => {
  it('is git from the PATH on Windows, never one the repository brings along', () => {
    const there = new Set(['C:\\Program Files\\Git\\cmd\\git.exe', 'repository\\git.exe'])
    const exists = (path: string): boolean => there.has(path)
    expect(gitExecutable('linux', 'C:\\Program Files\\Git\\cmd', exists)).toBe('git')
    // A directory of the PATH that is not absolute is looked for where git runs: it is skipped.
    expect(gitExecutable('win32', 'repository;"C:\\Program Files\\Git\\cmd"', exists)).toBe(
      'C:\\Program Files\\Git\\cmd\\git.exe'
    )
    expect(gitExecutable('win32', 'repository', exists)).toBe('git')
  })
})
