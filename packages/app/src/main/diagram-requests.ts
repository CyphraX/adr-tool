/**
 * What the window sends for its Diagrams, looked at before anything is planned with it: the
 * window shows the files of foreign repositories, and is no more trusted than they are. A
 * request that is not exactly what the contract says is dropped; only what is named here goes
 * on. The edits and a new Diagram are read as `diagrams` reads what any caller hands in.
 */
import {
  readEdits,
  readNewDiagram,
  type DiagramEdit,
  type DiagramProblem,
  type NewDiagram
} from '@adr-tool/diagrams'

/** A text longer than this is no Diagram of the repository. */
export const DIAGRAM_TEXT_LIMIT = 4 * 1024 * 1024
/** Longer than this is no Component ID. */
const WORDS_AT_MOST = 10_000

/** The edits of the canvas, each rebuilt field by field; `undefined` if one is not an edit. */
export const diagramEditsRequest = (edits: unknown): DiagramEdit[] | undefined => readEdits(edits)

/** A new Diagram as the dialog starts it, rebuilt field by field. */
export const newDiagramRequest = (diagram: unknown): NewDiagram | undefined =>
  readNewDiagram(diagram)

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

const isWords = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= WORDS_AT_MOST

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}
