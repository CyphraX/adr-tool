import type { Readable, Writable } from 'node:stream'
import { validate, type Schema } from './schema'

/**
 * The versions of the Model Context Protocol this server speaks, the newest first. What it
 * uses — tools, their annotations and structured results — reads the same in all of them.
 */
export const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'] as const

/** What a tool says it does, for the client to decide what it may call unasked. */
export interface ToolAnnotations {
  readonly title?: string
  readonly readOnlyHint?: boolean
  readonly destructiveHint?: boolean
  readonly idempotentHint?: boolean
  readonly openWorldHint?: boolean
}

/** A tool that only reads. */
export const READ: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
}

/** A plan writes nothing either; it is held until it is applied or discarded. */
export const PLAN: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false
}

export interface Tool {
  readonly name: string
  readonly title: string
  readonly description: string
  readonly inputSchema: Schema
  readonly annotations: ToolAnnotations
  /** The result, as an object; a `Refusal` thrown is what the agent is told instead. */
  readonly run: (input: Record<string, unknown>) => Promise<Record<string, unknown>>
}

/** Why a tool does not do what it was asked: told to the agent as a tool error, not a protocol error. */
export class Refusal extends Error {}

export interface ServerInfo {
  readonly name: string
  readonly title: string
  readonly version: string
  readonly instructions: string
}

type Id = string | number

const ERROR = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603
} as const

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** A line longer than this is not read: nothing the server takes is that long. */
export const MAX_LINE_BYTES = 32 * 1024 * 1024

/** What needs nothing of the repository is answered at once, also while a tool runs. */
const AT_ONCE = new Set(['initialize', 'ping', 'tools/list'])

/**
 * Answer the messages of one client, one JSON-RPC message per line in, one per line out
 * (the stdio transport of the Model Context Protocol), until the input ends. What is not for
 * the client — a note, a stack trace — goes to `log`, never to `output`.
 *
 * Tool calls run one after another, in the order they came — a batch too: a write planned
 * after a read sees it, and two writes never interleave. `initialize`, `ping` and
 * `tools/list` do not wait for them. A request the client cancels before it runs is not run.
 */
export async function serve(
  input: Readable,
  output: Writable,
  server: ServerInfo,
  tools: readonly Tool[],
  log: (text: string) => void = () => {}
): Promise<void> {
  const byName = new Map(tools.map((tool) => [tool.name, tool]))
  let closed = false
  // The client stopped reading: there is nobody left to answer.
  output.on('error', () => {
    closed = true
    input.destroy()
  })
  const write = (message: object): void => {
    if (!closed) output.write(`${JSON.stringify(message)}\n`)
  }
  /** The requests that wait in the queue, and those of them the client cancelled. */
  const waiting = new Set<Id>()
  const cancelled = new Set<Id>()

  /** What a message is: a request to answer, one that is wrong, or nothing to answer. */
  const classify = (
    message: unknown
  ):
    | { kind: 'request'; id: Id; method: string; params: unknown }
    | { kind: 'invalid'; id: Id | null }
    | { kind: 'none' } => {
    if (!isObject(message)) return { kind: 'invalid', id: null }
    const { id, method } = message
    const validId = typeof id === 'string' || typeof id === 'number'
    // A response: the server asks the client nothing, and answers no answer.
    if (method === undefined && ('result' in message || 'error' in message)) return { kind: 'none' }
    if (message.jsonrpc !== '2.0' || typeof method !== 'string' || ('id' in message && !validId)) {
      return { kind: 'invalid', id: validId ? id : null }
    }
    if (!validId) {
      // A notification wants no answer; a cancellation stops what has not started yet.
      if (method === 'notifications/cancelled' && isObject(message.params)) {
        const asked = message.params.requestId
        if ((typeof asked === 'string' || typeof asked === 'number') && waiting.has(asked)) {
          cancelled.add(asked)
        }
      }
      return { kind: 'none' }
    }
    return { kind: 'request', id, method, params: message.params }
  }

  const invalid = (id: Id | null): object => ({
    jsonrpc: '2.0',
    id,
    error: { code: ERROR.invalidRequest, message: 'Not a JSON-RPC 2.0 request.' }
  })

  const answer = async (id: Id, method: string, params: unknown): Promise<object | undefined> => {
    try {
      return { jsonrpc: '2.0', id, result: await handle(method, params) }
    } catch (error) {
      if (error instanceof ProtocolError) {
        return { jsonrpc: '2.0', id, error: { code: error.code, message: error.message } }
      }
      log(error instanceof Error ? (error.stack ?? error.message) : String(error))
      return {
        jsonrpc: '2.0',
        id,
        error: { code: ERROR.internal, message: 'The server failed; its log says why.' }
      }
    }
  }

  const handle = async (method: string, params: unknown): Promise<object> => {
    switch (method) {
      case 'initialize': {
        const asked = isObject(params) ? params.protocolVersion : undefined
        const protocolVersion =
          PROTOCOL_VERSIONS.find((version) => version === asked) ?? PROTOCOL_VERSIONS[0]
        return {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: server.name, title: server.title, version: server.version },
          instructions: server.instructions
        }
      }
      case 'ping':
        return {}
      case 'tools/list':
        return {
          tools: tools.map(({ name, title, description, inputSchema, annotations }) => ({
            name,
            title,
            description,
            inputSchema,
            annotations
          }))
        }
      case 'tools/call': {
        if (!isObject(params) || typeof params.name !== 'string') {
          throw new ProtocolError(ERROR.invalidParams, 'tools/call needs the name of a tool.')
        }
        const tool = byName.get(params.name)
        if (!tool)
          throw new ProtocolError(ERROR.invalidParams, `There is no tool "${params.name}".`)
        const input = withoutNulls(params.arguments ?? {})
        const wrong = validate(tool.inputSchema, input, 'arguments')
        if (wrong !== undefined) return failure(wrong)
        try {
          const result = await tool.run(input as Record<string, unknown>)
          return {
            content: [{ type: 'text', text: JSON.stringify(result) }],
            structuredContent: result
          }
        } catch (error) {
          if (error instanceof Refusal) return failure(error.message)
          // Whatever else went wrong is told to the agent too: it is part of the call.
          log(error instanceof Error ? (error.stack ?? error.message) : String(error))
          return failure(
            `The tool failed: ${error instanceof Error ? error.message : String(error)}`
          )
        }
      }
      default:
        throw new ProtocolError(ERROR.methodNotFound, `This server does not know "${method}".`)
    }
  }

  /** The answer to one message of the queue: run unless it was cancelled before it started. */
  const settle = async (message: unknown): Promise<object | undefined> => {
    const one = classify(message)
    if (one.kind === 'none') return undefined
    if (one.kind === 'invalid') return invalid(one.id)
    waiting.delete(one.id)
    if (cancelled.delete(one.id)) return undefined
    return answer(one.id, one.method, one.params)
  }

  // Requests are answered in the order they came: a write planned after a read sees it.
  let queue = Promise.resolve()
  const later = (work: () => Promise<void>): void => {
    queue = queue.then(work).catch((error: unknown) => log(String(error)))
  }

  const take = (line: string): void => {
    if (line.trim() === '') return
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      later(async () =>
        write({
          jsonrpc: '2.0',
          id: null,
          error: { code: ERROR.parse, message: 'The line is not JSON.' }
        })
      )
      return
    }
    if (Array.isArray(parsed)) {
      if (parsed.length === 0) {
        later(async () => write(invalid(null)))
        return
      }
      for (const message of parsed) {
        if (
          isObject(message) &&
          (typeof message.id === 'string' || typeof message.id === 'number')
        ) {
          waiting.add(message.id)
        }
      }
      later(async () => {
        const answers: object[] = []
        for (const message of parsed) {
          const reply = await settle(message)
          if (reply) answers.push(reply)
        }
        if (answers.length > 0) write(answers)
      })
      return
    }
    const one = classify(parsed)
    if (one.kind === 'request' && AT_ONCE.has(one.method)) {
      void answer(one.id, one.method, one.params).then((reply) => reply && write(reply))
      return
    }
    // A cancellation reaches what waits in the queue before it runs.
    if (one.kind === 'none') return
    if (one.kind === 'request') waiting.add(one.id)
    later(async () => {
      const reply = await settle(parsed)
      if (reply) write(reply)
    })
  }

  // Lines by hand: a line that never ends must not grow without bound.
  let pending: Buffer[] = []
  let pendingBytes = 0
  let skipping = false
  try {
    for await (const chunk of input as AsyncIterable<Buffer | string>) {
      let data = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk
      for (let end = data.indexOf(10); end >= 0; end = data.indexOf(10)) {
        if (!skipping) take(Buffer.concat([...pending, data.subarray(0, end)]).toString('utf8'))
        skipping = false
        pending = []
        pendingBytes = 0
        data = data.subarray(end + 1)
      }
      if (skipping || data.length === 0) continue
      pending.push(data)
      pendingBytes += data.length
      if (pendingBytes > MAX_LINE_BYTES) {
        skipping = true
        pending = []
        pendingBytes = 0
        later(async () =>
          write({
            jsonrpc: '2.0',
            id: null,
            error: { code: ERROR.invalidRequest, message: 'The line is too long.' }
          })
        )
      }
    }
  } catch (error) {
    // The input was closed under it: the client is gone.
    if (!closed) throw error
  }
  if (!skipping && pending.length > 0) take(Buffer.concat(pending).toString('utf8'))
  await queue
}

/** An argument given as `null` is one left out: clients fill unused ones with it. */
function withoutNulls(value: unknown): unknown {
  if (!isObject(value)) return value
  return Object.fromEntries(Object.entries(value).filter(([, one]) => one !== null))
}

class ProtocolError extends Error {
  constructor(
    readonly code: number,
    message: string
  ) {
    super(message)
  }
}

/** A tool call that does not do what was asked, and says why: the agent can try again. */
function failure(text: string): object {
  return { content: [{ type: 'text', text }], isError: true }
}

export type { Id }
