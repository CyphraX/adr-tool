/**
 * Edits and new Diagrams as a caller hands them in — the window over IPC, an agent over MCP —,
 * looked at before anything is planned with them: neither is trusted more than the files of a
 * foreign repository. What is not exactly an edit or a new Diagram is dropped; only what is
 * named here goes on. Whether an edit can be made is the editor's question: it refuses with a
 * sentence.
 */
import { VIEW_LEVELS, type Point } from './diagram'
import type { NewDiagram } from './create'
import type { DiagramEdit, NewConnection, NewElement } from './edit'

/** More edits than this are no canvas's work between two saves. */
const EDITS_AT_MOST = 5000
/** More elements or connections than this are no Diagram a person drew. */
const ITEMS_AT_MOST = 2000
/** Longer than this is no ID, name, description or label. */
const WORDS_AT_MOST = 10_000

/** Edits as a caller hands them in, each rebuilt field by field; `undefined` if one is not an edit. */
export function readEdits(edits: unknown): DiagramEdit[] | undefined {
  if (!Array.isArray(edits) || edits.length > EDITS_AT_MOST) return undefined
  const rebuilt: DiagramEdit[] = []
  for (const given of edits) {
    const edit = editOf(record(given))
    if (!edit) return undefined
    rebuilt.push(edit)
  }
  return rebuilt
}

/** A new Diagram as a caller hands it in, rebuilt field by field; `undefined` if it is not one. */
export function readNewDiagram(diagram: unknown): NewDiagram | undefined {
  const given = record(diagram)
  const { id, title, description, level, scope, elements, connections } = given
  const levelOf = VIEW_LEVELS.find((known) => known === level)
  if (!isWords(id) || levelOf === undefined) return undefined
  if (![title, description, scope].every((value) => value === undefined || isWords(value))) {
    return undefined
  }
  if (!Array.isArray(elements) || elements.length > ITEMS_AT_MOST) return undefined
  if (!Array.isArray(connections) || connections.length > ITEMS_AT_MOST) return undefined
  const newElements = elements.map((element) => elementOf(record(element)))
  const newConnections = connections.map((connection) => connectionOf(record(connection)))
  if (newElements.includes(undefined) || newConnections.includes(undefined)) return undefined
  return {
    id,
    ...(title !== undefined && { title: title as string }),
    ...(description !== undefined && { description: description as string }),
    level: levelOf,
    ...(scope !== undefined && { scope: scope as string }),
    elements: newElements as NewElement[],
    connections: newConnections as NewConnection[]
  }
}

function editOf(given: Record<string, unknown>): DiagramEdit | undefined {
  const { kind, id, from, to } = given
  switch (kind) {
    case 'move-element': {
      const at = pointOf(given['at'])
      return isWords(id) && at ? { kind, id, at } : undefined
    }
    case 'add-element': {
      const element = elementOf(record(given['element']))
      return element && { kind, element }
    }
    case 'remove-element':
      return isWords(id) ? { kind, id } : undefined
    case 'describe-element': {
      const { name, description } = given
      if (!isWords(id) || !isOptionalWords(name) || !isOptionalWords(description)) return undefined
      return {
        kind,
        id,
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description })
      }
    }
    case 'add-connection': {
      const connection = connectionOf(given)
      return connection && { kind, ...connection }
    }
    case 'remove-connection':
      return isWords(from) && isWords(to) ? { kind, from, to } : undefined
    case 'relabel-connection': {
      const { label } = given
      if (!isWords(from) || !isWords(to) || !isOptionalWords(label)) return undefined
      return { kind, from, to, ...(label !== undefined && { label }) }
    }
    default:
      return undefined
  }
}

function elementOf(given: Record<string, unknown>): NewElement | undefined {
  const { kind, id, name, description } = given
  const at = pointOf(given['at'])
  if (!isWords(id) || !at) return undefined
  if (kind === 'component') return { kind, id, at }
  if (kind !== 'external' && kind !== 'repository') return undefined
  if (!isOptionalWords(name) || !isOptionalWords(description)) return undefined
  return {
    kind,
    id,
    ...(name !== undefined && { name }),
    ...(description !== undefined && { description }),
    at
  }
}

function connectionOf(given: Record<string, unknown>): NewConnection | undefined {
  const { from, to, label } = given
  if (!isWords(from) || !isWords(to) || !isOptionalWords(label)) return undefined
  return { from, to, ...(label !== undefined && { label }) }
}

/** Two finite numbers; whether they are whole and near enough to 0 is `diagrams`' question. */
function pointOf(value: unknown): Point | undefined {
  const { x, y } = record(value)
  return typeof x === 'number' && typeof y === 'number' && Number.isFinite(x + y)
    ? { x, y }
    : undefined
}

const isWords = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= WORDS_AT_MOST

const isOptionalWords = (value: unknown): value is string | undefined =>
  value === undefined || isWords(value)

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}
