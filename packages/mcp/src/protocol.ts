import { createInterface } from 'node:readline'
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

interface Message {
  readonly jsonrpc?: unknown
  readonly id?: unknown
  readonly method?: unknown
  readonly params?: unknown
}

const ERROR = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603
} as const

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Answer the messages of one client, one JSON-RPC message per line in, one per line out
 * (the stdio transport of the Model Context Protocol), until the input ends. What is not for
 * the client — a note, a stack trace — goes to `log`, never to `output`.
 */
export async function serve(
  input: Readable,
  output: Writable,
  server: ServerInfo,
  tools: readonly Tool[],
  log: (text: string) => void = () => {}
): Promise<void> {
  const byName = new Map(tools.map((tool) => [tool.name, tool]))
  const send = (message: object): void => {
    output.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`)
  }

  const answer = async (message: Message): Promise<object | undefined> => {
    const id = message.id
    const request = typeof id === 'string' || typeof id === 'number'
    if (message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
      // A response to something the server never asks for, or nothing at all.
      return request || id === undefined
        ? {
            id: request ? id : null,
            error: { code: ERROR.invalidRequest, message: 'Not a JSON-RPC 2.0 request.' }
          }
        : undefined
    }
    // A notification — `notifications/initialized`, `notifications/cancelled` — wants no answer.
    if (!request) return undefined
    try {
      const result = await handle(message.method, message.params)
      return { id, result }
    } catch (error) {
      if (error instanceof ProtocolError) {
        return { id, error: { code: error.code, message: error.message } }
      }
      log(error instanceof Error ? (error.stack ?? error.message) : String(error))
      return {
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
        const input = params.arguments ?? {}
        const wrong = validate(tool.inputSchema, input, 'arguments')
        if (wrong !== undefined) return failure(wrong)
        try {
          const result = await tool.run(input as Record<string, unknown>)
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            structuredContent: result
          }
        } catch (error) {
          if (error instanceof Refusal) return failure(error.message)
          throw error
        }
      }
      default:
        throw new ProtocolError(ERROR.methodNotFound, `This server does not know "${method}".`)
    }
  }

  const lines = createInterface({ input, crlfDelay: Infinity })
  // Requests are answered in the order they came: a write planned after a read sees it.
  let queue = Promise.resolve()
  for await (const line of lines) {
    if (line.trim() === '') continue
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      send({ id: null, error: { code: ERROR.parse, message: 'The line is not JSON.' } })
      continue
    }
    queue = queue.then(async () => {
      if (Array.isArray(parsed)) {
        const answers = (
          await Promise.all(parsed.map((one) => answer(isObject(one) ? one : {})))
        ).filter((one) => one !== undefined)
        if (answers.length > 0)
          output.write(`${JSON.stringify(answers.map((one) => ({ jsonrpc: '2.0', ...one })))}\n`)
        return
      }
      const reply = await answer(isObject(parsed) ? parsed : {})
      if (reply) send(reply)
    })
  }
  await queue
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
