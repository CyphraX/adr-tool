/**
 * What the window sends for its Diagrams, looked at before anything is planned with it: the
 * window shows the files of foreign repositories, and is no more trusted than they are. A
 * request that is not exactly what the contract says is dropped; only what is named here goes
 * on. Whether an edit can be made is `diagrams`' question: it refuses with a sentence.
 */
import {
  VIEW_LEVELS,
  type DiagramEdit,
  type DiagramProblem,
  type NewConnection,
  type NewDiagram,
  type NewElement,
  type Point
} from '@adr-tool/diagrams'

/** More edits than this are no canvas's work between two saves. */
const EDITS_AT_MOST = 5000
/** More elements or connections than this are no Diagram a person drew. */
const ITEMS_AT_MOST = 2000
/** A text longer than this is no Diagram of the repository. */
export const DIAGRAM_TEXT_LIMIT = 4 * 1024 * 1024
/** Longer than this is no ID, name, description or label. */
const WORDS_AT_MOST = 10_000

/** The edits of the canvas, each rebuilt field by field; `undefined` if one is not an edit. */
export function diagramEditsRequest(edits: unknown): DiagramEdit[] | undefined {
  if (!Array.isArray(edits) || edits.length > EDITS_AT_MOST) return undefined
  const rebuilt: DiagramEdit[] = []
  for (const given of edits) {
    const edit = editOf(record(given))
    if (!edit) return undefined
    rebuilt.push(edit)
  }
  return rebuilt
}

/** A new Diagram as the dialog starts it, rebuilt field by field. */
export function newDiagramRequest(diagram: unknown): NewDiagram | undefined {
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

/**
 * A Problem of a Diagram to repair, rebuilt field by field: an element whose Component is
 * gone, or a picture that is not current. No other Problem has a Repair.
 */
export function diagramProblemRequest(problem: unknown): DiagramProblem | undefined {
  const { kind, path, line, component, picture } = record(problem)
  if (typeof path !== 'string' || typeof line !== 'number' || !Number.isInteger(line)) {
    return undefined
  }
  if (kind === 'component-gone' && isWords(component)) return { kind, path, line, component }
  if (kind === 'stale-picture' && typeof picture === 'string') return { kind, path, line, picture }
  return undefined
}

/** The text of a Diagram as the window holds it, for its Drift. */
export const diagramTextRequest = (text: unknown): string | undefined =>
  typeof text === 'string' && text.length <= DIAGRAM_TEXT_LIMIT ? text : undefined

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
